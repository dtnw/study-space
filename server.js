const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const DATA_PATH  = path.join(__dirname, 'data', 'tasks.json');
const ROLES_PATH = path.join(__dirname, 'data', 'roles.json');
const TWITCH_CONFIG_PATH = path.join(__dirname, 'data', 'twitch-config.json');
const TWITCH_TOKEN_PATH  = path.join(__dirname, 'data', 'twitch-token.json');

function loadTasks() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) { console.warn('Could not load tasks:', e.message); }
  return [];
}
function saveTasks() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(globalTasks, null, 2));
  } catch (e) { console.warn('Could not save tasks:', e.message); }
}

// Roles: { creatorClientId, modClientIds:[], bannedClientIds:[{clientId,name}] }
function loadRoles() {
  try {
    if (fs.existsSync(ROLES_PATH)) return JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
  } catch (e) {}
  return { creatorClientId: null, modClientIds: [], bannedClientIds: [] };
}
function saveRoles() {
  try {
    fs.mkdirSync(path.dirname(ROLES_PATH), { recursive: true });
    fs.writeFileSync(ROLES_PATH, JSON.stringify(rolesData, null, 2));
  } catch (e) {}
}
let rolesData = loadRoles();

function getRoleFor(clientId) {
  if (!clientId) return 'regular';
  if (clientId === rolesData.creatorClientId) return 'creator';
  if (rolesData.modClientIds.includes(clientId)) return 'mod';
  return 'regular';
}
const httpServer = createServer(app);
const io = new Server(httpServer);

// ── Page routes ──────────────────────────────────────────
app.get('/',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Input sanitisation ───────────────────────────────────
function sanitise(str, maxLen) {
  return String(str ?? '').replace(/[<>"'&]/g, '').trim().slice(0, maxLen);
}

// ── Per-socket rate limiter ──────────────────────────────
// Returns a checker function; call checker() → true if allowed, false if throttled.
function makeLimiter(maxPerWindow, windowMs) {
  let count = 0;
  let windowStart = Date.now();
  return function () {
    const now = Date.now();
    if (now - windowStart > windowMs) { count = 0; windowStart = now; }
    if (count >= maxPerWindow) return false;
    count++;
    return true;
  };
}

// ── Persistent state
let globalTasks = loadTasks();
if (globalTasks.length === 0) {
  globalTasks = [
    {
      id: 'dummy-1',
      text: 'Read 20 pages of a book',
      playerName: 'Sakura',
      playerId: 'dummy-player-1',
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dummy-2',
      text: 'Finish the project proposal',
      playerName: 'Hiro',
      playerId: 'dummy-player-2',
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];
  saveTasks();
}

const players = {};
// Maps stable client UUID → socket.id for reconnection deduplication
const clientIdMap = {};
// Server-side chair occupancy: chairId → socketId
const seatOccupancy = {};
// Per-player calls: callId → { participants: [socketId] }
const activeCalls = {};
let _callIdSeq = 0;
function _makeCallId() { return 'call-' + Date.now() + '-' + (++_callIdSeq); }

// ── Twitch integration ────────────────────────────────────
function loadTwitchConfig() {
  try { if (fs.existsSync(TWITCH_CONFIG_PATH)) return JSON.parse(fs.readFileSync(TWITCH_CONFIG_PATH, 'utf8')); } catch(e) {}
  return { clientId: 'fxqfxb53bn48lhba6t8bt3bpi0o2h3', clientSecret: 'r5dfve4346jgu4k7mbxnh0x41bp7tp', redirectUri: 'https://study-space-production.up.railway.app/auth/twitch/callback' };
}
function loadTwitchToken() {
  try { if (fs.existsSync(TWITCH_TOKEN_PATH)) return JSON.parse(fs.readFileSync(TWITCH_TOKEN_PATH, 'utf8')); } catch(e) {}
  return null;
}
function saveTwitchToken(t) {
  try { fs.mkdirSync(path.dirname(TWITCH_TOKEN_PATH), { recursive: true }); fs.writeFileSync(TWITCH_TOKEN_PATH, JSON.stringify(t, null, 2)); } catch(e) {}
}
let twitchCfg   = loadTwitchConfig();
let twitchToken = loadTwitchToken();
let spaceStatus = { live: false, twitchUser: null, twitchLogin: null, streamTitle: null, viewerCount: 0, gameName: null };

function _httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request({ hostname, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': buf.length } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.write(buf); req.end();
  });
}
function _httpsGet(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'GET', headers }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.end();
  });
}
function twitchHeaders(token) {
  return { 'Client-Id': twitchCfg.clientId, 'Authorization': `Bearer ${token}` };
}
async function refreshTwitchToken() {
  if (!twitchToken?.refreshToken || !twitchCfg.clientId || !twitchCfg.clientSecret) return false;
  try {
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: twitchToken.refreshToken, client_id: twitchCfg.clientId, client_secret: twitchCfg.clientSecret });
    const data = await _httpsPost('id.twitch.tv', '/oauth2/token', params.toString());
    if (data.access_token) { twitchToken.accessToken = data.access_token; if (data.refresh_token) twitchToken.refreshToken = data.refresh_token; saveTwitchToken(twitchToken); return true; }
  } catch(e) {}
  return false;
}
async function checkLiveStatus() {
  if (!twitchToken?.accessToken || !twitchToken?.twitchLogin || !twitchCfg.clientId) return;
  try {
    let r = await _httpsGet('api.twitch.tv', `/helix/streams?user_login=${twitchToken.twitchLogin}`, twitchHeaders(twitchToken.accessToken));
    if (r.status === 401) { const ok = await refreshTwitchToken(); if (ok) r = await _httpsGet('api.twitch.tv', `/helix/streams?user_login=${twitchToken.twitchLogin}`, twitchHeaders(twitchToken.accessToken)); else return; }
    const stream = r.body?.data?.[0];
    spaceStatus = { live: !!stream, twitchUser: twitchToken.twitchDisplayName || twitchToken.twitchLogin, twitchLogin: twitchToken.twitchLogin, streamTitle: stream?.title || null, viewerCount: stream?.viewer_count || 0, gameName: stream?.game_name || null };
    io.emit('spaceStatus', spaceStatus);
  } catch(e) { console.warn('Twitch check failed:', e.message); }
}
setInterval(checkLiveStatus, 60000);
checkLiveStatus();

app.get('/auth/twitch', (req, res) => {
  if (!twitchCfg.clientId) return res.send('<h2>Set clientId in data/twitch-config.json first.</h2>');
  const p = new URLSearchParams({ client_id: twitchCfg.clientId, redirect_uri: twitchCfg.redirectUri, response_type: 'code', scope: 'user:read:email' });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${p}`);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/play?twitch=error');
  try {
    const params = new URLSearchParams({ client_id: twitchCfg.clientId, client_secret: twitchCfg.clientSecret, code, grant_type: 'authorization_code', redirect_uri: twitchCfg.redirectUri });
    const tokenData = await _httpsPost('id.twitch.tv', '/oauth2/token', params.toString());
    if (!tokenData.access_token) return res.redirect('/play?twitch=error');
    const userResp = await _httpsGet('api.twitch.tv', '/helix/users', twitchHeaders(tokenData.access_token));
    const user = userResp.body?.data?.[0];
    twitchToken = { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, twitchUserId: user?.id, twitchLogin: user?.login, twitchDisplayName: user?.display_name };
    saveTwitchToken(twitchToken);
    await checkLiveStatus();
    res.redirect('/play?twitch=connected');
  } catch(e) { console.error('Twitch OAuth error:', e); res.redirect('/play?twitch=error'); }
});

app.post('/auth/twitch/disconnect', (req, res) => {
  twitchToken = null; saveTwitchToken({}); spaceStatus = { live: false, twitchUser: null, twitchLogin: null, streamTitle: null, viewerCount: 0, gameName: null };
  io.emit('spaceStatus', spaceStatus); res.json({ ok: true });
});

app.get('/api/twitch/status', (req, res) => res.json(spaceStatus));
app.get('/api/twitch/config', (req, res) => res.json({ configured: !!(twitchCfg.clientId && twitchCfg.clientSecret), connected: !!twitchToken?.twitchLogin, twitchUser: twitchToken?.twitchDisplayName || null }));

app.get('/api/spaces', (req, res) => {
  res.json([{
    id:           'derbysaren',
    name:         "Derby's Study Space",
    twitchLogin:  twitchToken?.twitchLogin || 'derbysaren',
    description:  "Derby's cozy community study room",
    roomPath:     '/play',
    live:          spaceStatus.live,
    streamTitle:   spaceStatus.streamTitle,
    viewerCount:   spaceStatus.viewerCount,
    gameName:      spaceStatus.gameName,
    twitchUser:    spaceStatus.twitchUser,
    playersOnline: Object.keys(players).length,
  }]);
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Per-socket rate limiters
  const allow = {
    playerMove:    makeLimiter(20,  1000),   // 20 moves/s
    sendChat:      makeLimiter(5,   3000),   // 5 msgs / 3 s
    directMessage: makeLimiter(10,  3000),   // 10 DMs / 3 s
    friendRequest: makeLimiter(10,  10000),  // 10 / 10 s
    addTask:       makeLimiter(5,   10000),  // 5 tasks / 10 s
  };

  // Send current state to new player
  socket.emit('init', { tasks: globalTasks });

  // ── Player join ──────────────────────────────────────────
  socket.on('playerJoin', ({ name, gender, shirtColor, clientId, startX, startY }) => {
    if (players[socket.id]) return; // already joined — ignore duplicate
    const safeName = sanitise(name, 24);
    if (!safeName) return socket.disconnect();

    const safeClientId = sanitise(clientId, 64);

    // Reject banned players before doing anything else
    if (safeClientId && rolesData.bannedClientIds.some(b => b.clientId === safeClientId)) {
      socket.emit('kicked', { reason: 'You have been banned from this space.' });
      socket.disconnect();
      return;
    }

    // Reconnection: evict ghost player from previous socket
    if (safeClientId && clientIdMap[safeClientId] && clientIdMap[safeClientId] !== socket.id) {
      const oldSocketId = clientIdMap[safeClientId];
      if (players[oldSocketId]) {
        socket.broadcast.emit('playerLeft', { id: oldSocketId });
        delete players[oldSocketId];
      }
    }
    if (safeClientId) clientIdMap[safeClientId] = socket.id;

    // "admin" is always the creator regardless of join order
    if (safeName.toLowerCase() === 'admin' && safeClientId) {
      rolesData.creatorClientId = safeClientId;
      saveRoles();
    } else if (!rolesData.creatorClientId && safeClientId) {
      // First non-admin player becomes creator only if no creator exists yet
      rolesData.creatorClientId = safeClientId;
      saveRoles();
    }

    const safeColor  = ['blue','red','green','purple'].includes(shirtColor) ? shirtColor : 'blue';
    const safeGender = gender === 'female' ? 'female' : 'male';
    const sx = (typeof startX === 'number' && startX >= 32 && startX <= 1068) ? Math.round(startX) : 400;
    const sy = (typeof startY === 'number' && startY >= 32 && startY <= 764)  ? Math.round(startY) : 560;
    const role = getRoleFor(safeClientId);

    players[socket.id] = {
      id: socket.id,
      clientId: safeClientId || socket.id,
      name: safeName,
      gender: safeGender,
      shirtColor: safeColor,
      x: sx,
      y: sy,
      chatPreference: 'sociable',
      role,
      friends: [],
      pendingFrom: [],
      pendingMessages: [],
    };
    io.emit('playerCount', Object.keys(players).length);

    // Tell this player their role
    socket.emit('yourRole', { role });
    socket.emit('spaceStatus', spaceStatus);

    // Send existing players to new joiner (include roles + statusIcon)
    socket.emit('existingPlayers', Object.values(players)
      .filter(p => p.id !== socket.id)
      .map(p => ({
        id: p.id, name: p.name, gender: p.gender, shirtColor: p.shirtColor,
        x: p.x, y: p.y, chatPreference: p.chatPreference,
        role: p.role || 'regular', statusIcon: p.statusIcon || null,
      }))
    );

    // Tell the joining client their restored spawn position
    socket.emit('spawnAt', { x: sx, y: sy });

    // Broadcast new player to everyone else (include role)
    socket.broadcast.emit('playerJoined', {
      id: socket.id, name: safeName, gender: safeGender, shirtColor: safeColor,
      x: sx, y: sy, chatPreference: 'sociable', role, statusIcon: null,
    });
  });

  // ── Player movement ──────────────────────────────────────
  socket.on('playerMove', ({ x, y }) => {
    if (!allow.playerMove()) return;
    const p = players[socket.id];
    if (!p) return;
    // Clamp to valid world bounds (matches client canvas 1100×800)
    const cx = Math.max(32, Math.min(1068, Math.round(Number(x) || 0)));
    const cy = Math.max(32, Math.min(764,  Math.round(Number(y) || 0)));
    // Reject implausible teleports (> 200px per tick at 150ms intervals = ~1300px/s)
    const dx = cx - p.x, dy = cy - p.y;
    if (Math.sqrt(dx * dx + dy * dy) > 200) return;
    p.x = cx; p.y = cy;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: cx, y: cy });
  });

  // ── Chat preference ──────────────────────────────────────
  socket.on('updatePreference', ({ preference }) => {
    const safe = ['sociable', 'private', 'lockedin'].includes(preference) ? preference : null;
    if (!safe || !players[socket.id]) return;
    const wasLocked = players[socket.id].chatPreference === 'lockedin';
    players[socket.id].chatPreference = safe;
    socket.broadcast.emit('playerPreferenceUpdated', { id: socket.id, preference: safe });
    // Flush queued messages now that player is no longer locked in
    if (wasLocked && safe !== 'lockedin') {
      if (!Array.isArray(players[socket.id].pendingMessages)) players[socket.id].pendingMessages = [];
      const pending = players[socket.id].pendingMessages.splice(0);
      pending.forEach(msg => {
        socket.emit('chatMessage', { fromId: msg.fromId, fromName: msg.fromName, message: msg.message });
      });
    }
  });

  // ── Friend request ───────────────────────────────────────
  socket.on('friendRequest', ({ toId }) => {
    if (!allow.friendRequest()) return;
    const sender = players[socket.id];
    const target = players[toId];
    if (!sender || !target) return;
    if (target.friends.includes(socket.id)) return;
    if (target.pendingFrom.some(r => r.fromId === socket.id)) return;
    target.pendingFrom.push({ fromId: socket.id, fromName: sender.name });
    io.to(toId).emit('friendRequestReceived', { fromId: socket.id, fromName: sender.name });
  });

  // ── Friend accept ────────────────────────────────────────
  socket.on('friendAccept', ({ fromId }) => {
    const accepter = players[socket.id];
    const requester = players[fromId];
    if (!accepter || !requester) return;
    // Add to each other's friends arrays
    if (!accepter.friends.includes(fromId)) accepter.friends.push(fromId);
    if (!requester.friends.includes(socket.id)) requester.friends.push(socket.id);
    // Remove from pendingFrom
    accepter.pendingFrom = accepter.pendingFrom.filter(r => r.fromId !== fromId);
    // Notify both
    io.to(fromId).emit('friendAdded', { id: socket.id, name: accepter.name });
    socket.emit('friendAdded', { id: fromId, name: requester.name });
  });

  // ── Friend decline ───────────────────────────────────────
  socket.on('friendDecline', ({ fromId }) => {
    const accepter = players[socket.id];
    if (!accepter) return;
    accepter.pendingFrom = accepter.pendingFrom.filter(r => r.fromId !== fromId);
  });

  // ── Remove friend ────────────────────────────────────────
  socket.on('removeFriend', ({ friendId }) => {
    const me = players[socket.id];
    const other = players[friendId];
    if (me) me.friends = me.friends.filter(id => id !== friendId);
    if (other) other.friends = other.friends.filter(id => id !== socket.id);
    socket.emit('friendRemoved', { id: friendId });
    if (other) io.to(friendId).emit('friendRemoved', { id: socket.id });
  });

  // ── Direct message ───────────────────────────────────────
  socket.on('directMessage', ({ toId, message }) => {
    if (!allow.directMessage()) return;
    const sender = players[socket.id];
    const target = players[toId];
    if (!sender || !target) return;
    const safeMsg = sanitise(message, 200);   // ← must be before any use of safeMsg
    if (!safeMsg) return;
    // Private players only accept DMs from friends
    if (target.chatPreference === 'private' && !sender.friends.includes(toId)) return;
    // Locked-in: queue the message and deliver when they become active again
    if (target.chatPreference === 'lockedin') {
      if (!Array.isArray(target.pendingMessages)) target.pendingMessages = [];
      target.pendingMessages.push({ fromId: socket.id, fromName: sender.name, message: safeMsg });
      return;
    }
    io.to(toId).emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg });
  });

  // ── Send chat (proximity — server validates distance) ────
  socket.on('sendChat', ({ message }) => {  // nearbyIds no longer accepted from client
    if (!allow.sendChat()) return;
    const sender = players[socket.id];
    if (!sender) return;
    const safeMsg = sanitise(message, 200);
    if (!safeMsg) return;
    const MAX_PROXIMITY = 120;
    for (const [id, target] of Object.entries(players)) {
      if (id === socket.id) continue;
      const dx = sender.x - target.x, dy = sender.y - target.y;
      if (Math.sqrt(dx * dx + dy * dy) > MAX_PROXIMITY) continue;
      if (target.chatPreference === 'lockedin') continue;
      if (target.chatPreference === 'private' && !target.friends.includes(socket.id)) continue;
      io.to(id).emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg });
    }
    // Echo back to sender
    socket.emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg, isSelf: true });
  });

  // ── Task events ──────────────────────────────────────────

  // Add a task (appears on both personal + global boards)
  socket.on('addTask', ({ text, playerName }) => {
    if (!allow.addTask()) return;
    const safeText = sanitise(text, 120);
    if (!safeText) return;
    const p = players[socket.id];
    const safeName = p ? p.name : sanitise(playerName, 24);
    const p2 = players[socket.id];
    const task = {
      id: `${(p2?.clientId || socket.id)}-${Date.now()}`,
      text: safeText,
      playerName: safeName,
      playerId: p2?.clientId || socket.id,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    globalTasks.push(task);
    // Prune: keep all incomplete + only the 200 most-recent completed
    const incomplete = globalTasks.filter(t => !t.completed);
    const completed  = globalTasks.filter(t =>  t.completed).slice(-200);
    globalTasks = [...incomplete, ...completed];
    saveTasks();
    io.emit('taskAdded', task);
  });

  // Helper: get the stable clientId for the acting socket
  const myClientId = () => players[socket.id]?.clientId || socket.id;

  // Mark a task complete (only owner)
  socket.on('completeTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId && t.playerId === myClientId());
    if (task) {
      task.completed = true;
      saveTasks();
      io.emit('taskCompleted', { taskId });
    }
  });

  // Undo a task completion (only owner)
  socket.on('uncompleteTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId && t.playerId === myClientId());
    if (task) {
      task.completed = false;
      saveTasks();
      io.emit('taskUncompleted', { taskId });
    }
  });

  // Delete a task (only owner can delete)
  socket.on('deleteTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId);
    if (task && task.playerId === myClientId()) {
      globalTasks = globalTasks.filter((t) => t.id !== taskId);
      saveTasks();
      io.emit('taskDeleted', { taskId });
    }
  });

  // ── Status icon broadcast ────────────────────────────────
  socket.on('playerStatusIcon', ({ type }) => {
    const p = players[socket.id];
    if (!p) return;
    const valid = [null,'focus','break','pause','eating','cooking','relax','laundry','coffee','workout','washup'];
    const safe = valid.includes(type) ? type : null;
    p.statusIcon = safe;
    socket.broadcast.emit('playerStatusIconUpdated', { id: socket.id, type: safe });
  });

  // ── Block player (mutual) ───────────────────────────────
  socket.on('blockPlayer', ({ targetId }) => {
    if (!players[socket.id] || !players[targetId]) return;
    io.to(targetId).emit('youWereBlocked', { by: socket.id });
  });

  // ── Unblock player — re-introduce both sides ────────────
  socket.on('unblockPlayer', ({ targetId }) => {
    const me = players[socket.id];
    const target = players[targetId];
    if (!me || !target) return;
    // Reintroduce target to me
    socket.emit('playerJoined', {
      id: target.id, name: target.name, gender: target.gender,
      shirtColor: target.shirtColor, x: target.x, y: target.y,
      chatPreference: target.chatPreference, role: target.role || 'regular',
      statusIcon: target.statusIcon || null,
    });
    // Reintroduce me to target
    io.to(targetId).emit('playerJoined', {
      id: me.id, name: me.name, gender: me.gender,
      shirtColor: me.shirtColor, x: me.x, y: me.y,
      chatPreference: me.chatPreference, role: me.role || 'regular',
      statusIcon: me.statusIcon || null,
    });
  });

  // ── Role management ─────────────────────────────────────
  socket.on('appointMod', ({ targetId }) => {
    const me = players[socket.id];
    const target = players[targetId];
    if (!me || me.role !== 'creator' || !target) return;
    if (!rolesData.modClientIds.includes(target.clientId))
      rolesData.modClientIds.push(target.clientId);
    saveRoles();
    target.role = 'mod';
    io.to(targetId).emit('yourRole', { role: 'mod' });
    io.emit('playerRoleUpdated', { id: targetId, role: 'mod' });
  });

  socket.on('removeMod', ({ targetId }) => {
    const me = players[socket.id];
    const target = players[targetId];
    if (!me || me.role !== 'creator' || !target) return;
    rolesData.modClientIds = rolesData.modClientIds.filter(id => id !== target.clientId);
    saveRoles();
    target.role = 'regular';
    io.to(targetId).emit('yourRole', { role: 'regular' });
    io.emit('playerRoleUpdated', { id: targetId, role: 'regular' });
  });

  // ── Ban player ──────────────────────────────────────────
  socket.on('banPlayer', ({ targetId }) => {
    const me = players[socket.id];
    const target = players[targetId];
    if (!me || !target) return;
    if (me.role !== 'creator' && me.role !== 'mod') return;
    if (target.role === 'creator') return;                        // can never ban creator
    if (target.role === 'mod' && me.role === 'mod') return;      // mods can't ban mods

    if (!rolesData.bannedClientIds.some(b => b.clientId === target.clientId)) {
      rolesData.bannedClientIds.push({ clientId: target.clientId, name: target.name });
    }
    rolesData.modClientIds = rolesData.modClientIds.filter(id => id !== target.clientId);
    saveRoles();

    io.to(targetId).emit('kicked', { reason: 'You have been banned from this space.' });
    socket.broadcast.emit('playerLeft', { id: targetId });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.disconnect();
  });

  socket.on('unbanPlayer', ({ clientId }) => {
    const me = players[socket.id];
    if (!me || me.role !== 'creator') return;
    rolesData.bannedClientIds = rolesData.bannedClientIds.filter(b => b.clientId !== clientId);
    saveRoles();
    socket.emit('bannedListUpdated', { bannedList: rolesData.bannedClientIds });
  });

  socket.on('getBannedList', () => {
    const me = players[socket.id];
    if (!me || (me.role !== 'creator' && me.role !== 'mod')) return;
    socket.emit('bannedListUpdated', { bannedList: rolesData.bannedClientIds });
  });

  // ── Clear all shared tasks ──────────────────────────────
  socket.on('clearAllTasks', () => {
    const me = players[socket.id];
    if (!me || (me.role !== 'creator' && me.role !== 'mod')) return;
    globalTasks = [];
    saveTasks();
    io.emit('allTasksCleared');
  });

  // ── Chair sit / stand (server-authoritative) ─────────────
  socket.on('sitDown', ({ chairId }) => {
    const safeId = String(chairId).slice(0, 32);
    if (seatOccupancy[safeId] && seatOccupancy[safeId] !== socket.id) {
      socket.emit('sitRejected', { chairId: safeId });
      return;
    }
    // Free own old seat if any
    for (const [cid, sid] of Object.entries(seatOccupancy)) {
      if (sid === socket.id) { delete seatOccupancy[cid]; socket.broadcast.emit('chairFreed', { chairId: cid }); break; }
    }
    seatOccupancy[safeId] = socket.id;
    socket.broadcast.emit('chairTaken', { chairId: safeId });
  });

  socket.on('standUp', ({ chairId }) => {
    const safeId = String(chairId).slice(0, 32);
    if (seatOccupancy[safeId] === socket.id) {
      delete seatOccupancy[safeId];
      socket.broadcast.emit('chairFreed', { chairId: safeId });
    }
  });

  // ── Per-player call signaling ────────────────────────────
  socket.on('callRequest', ({ toId }) => {
    const me = players[socket.id];
    const target = players[toId];
    if (!me || !target) return;
    const callId = _makeCallId();
    activeCalls[callId] = { participants: [socket.id] };
    socket.emit('callCreated', { callId, toId });
    io.to(toId).emit('incomingCall', { callId, fromId: socket.id, fromName: me.name });
  });

  socket.on('callAccept', ({ callId }) => {
    const me = players[socket.id];
    if (!me || !activeCalls[callId]) return;
    const call = activeCalls[callId];
    const others = [...call.participants];
    call.participants.push(socket.id);
    // Tell accepter who is already in the call (they will offer to those people)
    socket.emit('callJoined', { callId, participants: others });
    // Tell everyone already in the call that this person joined (they wait for offer)
    others.forEach(pid => {
      io.to(pid).emit('callParticipantJoined', { callId, peerId: socket.id, peerName: me.name });
    });
  });

  socket.on('callDecline', ({ callId }) => {
    const call = activeCalls[callId];
    const me = players[socket.id];
    if (!call) return;
    call.participants.forEach(pid => {
      io.to(pid).emit('callDeclined', { callId, byId: socket.id, byName: me?.name || '?' });
    });
    // If caller is alone waiting, clean up the call
    if (call.participants.length <= 1) delete activeCalls[callId];
  });

  socket.on('callLeave', ({ callId }) => {
    const call = activeCalls[callId];
    if (!call) return;
    call.participants = call.participants.filter(id => id !== socket.id);
    call.participants.forEach(pid => {
      io.to(pid).emit('callParticipantLeft', { callId, peerId: socket.id });
    });
    if (call.participants.length === 0) {
      delete activeCalls[callId];
    } else if (call.participants.length === 1) {
      io.to(call.participants[0]).emit('callEnded', { callId });
      delete activeCalls[callId];
    }
  });

  socket.on('callInvite', ({ callId, toId }) => {
    const me = players[socket.id];
    const target = players[toId];
    const call = activeCalls[callId];
    if (!me || !target || !call) return;
    if (!call.participants.includes(socket.id)) return;
    io.to(toId).emit('incomingCall', { callId, fromId: socket.id, fromName: me.name });
  });

  // WebRTC relay for calls
  socket.on('callOffer', ({ toId, offer }) => {
    if (!players[socket.id] || !players[toId]) return;
    io.to(toId).emit('callOffer', { fromId: socket.id, offer });
  });
  socket.on('callAnswer', ({ toId, answer }) => {
    if (!players[socket.id] || !players[toId]) return;
    io.to(toId).emit('callAnswer', { fromId: socket.id, answer });
  });
  socket.on('callIce', ({ toId, candidate }) => {
    if (!players[socket.id] || !players[toId]) return;
    io.to(toId).emit('callIce', { fromId: socket.id, candidate });
  });

  // ── Disconnect ───────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const player = players[socket.id];
    if (player) {
      // Notify friends that this player went offline
      for (const friendId of player.friends) {
        io.to(friendId).emit('friendWentOffline', { id: socket.id });
        // Remove stale ID from each friend's friends array
        if (players[friendId]) {
          players[friendId].friends = players[friendId].friends.filter(id => id !== socket.id);
        }
      }
    }
    // Clean up any active calls this player was in
    for (const [callId, call] of Object.entries(activeCalls)) {
      if (!call.participants.includes(socket.id)) continue;
      call.participants = call.participants.filter(id => id !== socket.id);
      call.participants.forEach(pid => io.to(pid).emit('callParticipantLeft', { callId, peerId: socket.id }));
      if (call.participants.length === 0) {
        delete activeCalls[callId];
      } else if (call.participants.length === 1) {
        io.to(call.participants[0]).emit('callEnded', { callId });
        delete activeCalls[callId];
      }
    }
    // Free any held chair
    for (const [cid, sid] of Object.entries(seatOccupancy)) {
      if (sid === socket.id) { delete seatOccupancy[cid]; socket.broadcast.emit('chairFreed', { chairId: cid }); break; }
    }
    socket.broadcast.emit('playerLeft', { id: socket.id });
    delete players[socket.id];
    // Also clean up any lingering clientId mapping
    for (const [cid, sid] of Object.entries(clientIdMap)) {
      if (sid === socket.id) { delete clientIdMap[cid]; break; }
    }
    io.emit('playerCount', Object.keys(players).length);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Study Space running → http://localhost:${PORT}`);
});
