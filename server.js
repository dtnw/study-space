const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const https = require('https');
const nodemailer = require('nodemailer');

// ── Email config ─────────────────────────────────────────────────────────────
const EMAIL_CONFIG_PATH = path.join(__dirname, 'data', 'email-config.json');
function loadEmailConfig() {
  // Env vars take priority (Railway), fall back to local JSON file
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return { host: 'smtp.gmail.com', port: 587, user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS, to: process.env.EMAIL_TO || process.env.EMAIL_USER };
  }
  try { if (fs.existsSync(EMAIL_CONFIG_PATH)) return JSON.parse(fs.readFileSync(EMAIL_CONFIG_PATH, 'utf8')); } catch(e) {}
  return {};
}
let _mailer = null;
function getMailer() {
  if (_mailer) return _mailer;
  const cfg = loadEmailConfig();
  if (!cfg.user || !cfg.pass) return null;
  _mailer = nodemailer.createTransport({
    host: cfg.host || 'smtp.gmail.com',
    port: cfg.port || 587,
    secure: false,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return _mailer;
}
async function sendNotificationEmail(subject, html) {
  const cfg = loadEmailConfig();
  const mailer = getMailer();
  if (!mailer || !cfg.to) return;
  try {
    await mailer.sendMail({ from: `"Belong Here" <${cfg.user}>`, to: cfg.to, subject, html });
  } catch(e) { console.error('[email]', e.message); }
}

// ── Admin auth ───────────────────────────────────────────────────────────────
const ADMIN_KEY_PATH = path.join(__dirname, 'data', 'admin-key.json');
function getAdminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  try { if (fs.existsSync(ADMIN_KEY_PATH)) return JSON.parse(fs.readFileSync(ADMIN_KEY_PATH, 'utf8')).key; } catch(e) {}
  return 'belonghere-admin-2026';
}
function checkAdmin(req, res) {
  const key = getAdminKey();
  const fromLocalhost = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (fromLocalhost) return true;
  if (key && req.query.key === key) return true;
  res.status(403).send('Forbidden — add ?key=<admin-key> to the URL');
  return false;
}

const app = express();
const DATA_PATH  = path.join(__dirname, 'data', 'tasks.json');
const TWITCH_CONFIG_PATH = path.join(__dirname, 'data', 'twitch-config.json');
const TWITCH_TOKEN_PATH  = path.join(__dirname, 'data', 'twitch-token.json');

const ROOM_CONFIGS = [
  { id: 'derbysaren',     creatorLogin: 'derbysaren',     name: "Derby's Study Space",   path: '/derbysaren', theme: 'demo'  },
  { id: 'demo',           creatorLogin: 'demo',           name: 'Demo Room',             path: '/demo',       theme: 'demo',  hidden: true },
  { id: 'derrizzmachine', creatorLogin: 'derrizzmachine', name: "DerRizzMachine's Café", path: '/derrizzmachine', theme: 'study', hidden: true },
];

// ── Dynamic rooms (user-created, persisted to data/rooms.json) ──────────────
const DYNAMIC_ROOMS_PATH = path.join(__dirname, 'data', 'rooms.json');
function loadDynamicRooms() {
  try { if (fs.existsSync(DYNAMIC_ROOMS_PATH)) return JSON.parse(fs.readFileSync(DYNAMIC_ROOMS_PATH, 'utf8')); } catch(e) {}
  return [];
}
function saveDynamicRooms(rooms) {
  try { fs.mkdirSync(path.dirname(DYNAMIC_ROOMS_PATH), { recursive: true }); fs.writeFileSync(DYNAMIC_ROOMS_PATH, JSON.stringify(rooms, null, 2)); } catch(e) {}
}
// Merge dynamic rooms into ROOM_CONFIGS at startup (avoid duplicating built-in rooms)
loadDynamicRooms().forEach(r => {
  if (!ROOM_CONFIGS.find(c => c.id === r.id)) ROOM_CONFIGS.push(r);
});

// Default room furniture — tilemap interior centre TX=550, TY=400 (map at 358,240; 12×10 tiles; 1-tile walls).
const DEFAULT_DEMO_LAYOUT = [
  { type: 'desk-six', cx: 550, cy: 400, rotation: 0, imgKey: 'furn_big_table' },
  { type: 'chair', cx: 508, cy: 345, rotation: 0, imgKey: 'furn_cl_1' },
  { type: 'chair', cx: 536, cy: 345, rotation: 0, imgKey: 'furn_cl_1' },
  { type: 'chair', cx: 564, cy: 345, rotation: 0, imgKey: 'furn_cl_1' },
  { type: 'chair', cx: 592, cy: 345, rotation: 0, imgKey: 'furn_cl_1' },
  { type: 'chair', cx: 508, cy: 455, rotation: 2, imgKey: 'furn_cl_2' },
  { type: 'chair', cx: 536, cy: 455, rotation: 2, imgKey: 'furn_cl_2' },
  { type: 'chair', cx: 564, cy: 455, rotation: 2, imgKey: 'furn_cl_2' },
  { type: 'chair', cx: 592, cy: 455, rotation: 2, imgKey: 'furn_cl_2' },
];

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

// Per-room roles: { creatorClientId, modClientIds:[], bannedClientIds:[{clientId,name}] }
function loadRolesForRoom(roomId) {
  const filename = roomId === 'derbysaren' ? 'roles.json' : `${roomId}-roles.json`;
  const p = path.join(__dirname, 'data', filename);
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {}
  return { creatorClientId: null, modClientIds: [], bannedClientIds: [] };
}
function saveRolesForRoom(roomId) {
  const filename = roomId === 'derbysaren' ? 'roles.json' : `${roomId}-roles.json`;
  const p = path.join(__dirname, 'data', filename);
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(getRoomState(roomId).rolesData, null, 2)); } catch(e) {}
}
function getRoleForRoom(clientId, roomId) {
  if (!clientId) return 'regular';
  const rd = getRoomState(roomId).rolesData;
  if (rd.modClientIds.includes(clientId)) return 'mod';
  return 'regular';
}

// Per-room state. Each room has its own players, seat map, layout, roles, and calls.
const roomState = new Map();
let _callIdSeq = 0;
function _makeCallId() { return 'call-' + Date.now() + '-' + (++_callIdSeq); }

function getRoomState(roomId) {
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      players:       {},
      clientIdMap:   {},
      seatOccupancy: {},
      roomLayout:    [...DEFAULT_DEMO_LAYOUT],
      rolesData:     loadRolesForRoom(roomId),
      activeCalls:   {},
    });
  }
  return roomState.get(roomId);
}
const httpServer = createServer(app);
const io = new Server(httpServer);

// ── Page routes ──────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));

// Legacy paths → redirect to username-based URLs
app.get('/demo', (req, res) => res.redirect('/derbysaren'));
app.get('/play', (req, res) => res.redirect('/derbysaren'));
app.get('/cafe', (req, res) => res.redirect('/derrizzmachine'));

// Direct space links: /space/derbysaren or /@derbysaren → canonical username URL
app.get('/space/:login', (req, res) => {
  const login = req.params.login.toLowerCase().trim();
  const room = ROOM_CONFIGS.find(r => r.creatorLogin?.toLowerCase() === login);
  if (room) return res.redirect('/' + room.creatorLogin.toLowerCase());
  res.redirect('/');
});
app.get('/@:login', (req, res) => {
  res.redirect('/' + req.params.login.toLowerCase());
});

// Dynamic room route: /:username serves the game if a room exists for that creator
app.get('/:username', (req, res, next) => {
  const username = req.params.username.toLowerCase().trim();
  const room = ROOM_CONFIGS.find(r => r.creatorLogin?.toLowerCase() === username);
  if (!room) return next(); // fall through to static files / 404
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

const playerSessions = new Map();   // token → { name, twitchLogin, profilePic, expiresAt }

// ── Visitor stats ──────────────────────────────────────────────────────────────
const STATS_PATH = path.join(__dirname, 'data', 'stats.json');
function loadStats() {
  try { if (fs.existsSync(STATS_PATH)) return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch(e) {}
  return { twitchLogins: [], guestClientIds: [] };
}
function saveStats(s) {
  try { fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true }); fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2)); } catch(e) {}
}
const _stats = loadStats();

const CREATOR_CODES_PATH = path.join(__dirname, 'data', 'creator-codes.json');
function loadCreatorCodes() {
  try { if (fs.existsSync(CREATOR_CODES_PATH)) return JSON.parse(fs.readFileSync(CREATOR_CODES_PATH, 'utf8')); } catch(e) {}
  return [];
}
function saveCreatorCodes(codes) {
  try { fs.mkdirSync(path.dirname(CREATOR_CODES_PATH), { recursive: true }); fs.writeFileSync(CREATOR_CODES_PATH, JSON.stringify(codes, null, 2)); } catch(e) {}
}

const STREAMER_INTEREST_PATH = path.join(__dirname, 'data', 'streamer-interest.json');
function loadStreamerInterest() {
  try { if (fs.existsSync(STREAMER_INTEREST_PATH)) return JSON.parse(fs.readFileSync(STREAMER_INTEREST_PATH, 'utf8')); } catch(e) {}
  return [];
}
function saveStreamerInterest(list) {
  try { fs.mkdirSync(path.dirname(STREAMER_INTEREST_PATH), { recursive: true }); fs.writeFileSync(STREAMER_INTEREST_PATH, JSON.stringify(list, null, 2)); } catch(e) {}
}

// ── Twitch integration ────────────────────────────────────
function loadTwitchConfig() {
  try { if (fs.existsSync(TWITCH_CONFIG_PATH)) return JSON.parse(fs.readFileSync(TWITCH_CONFIG_PATH, 'utf8')); } catch(e) {}
  return { clientId: 'fxqfxb53bn48lhba6t8bt3bpi0o2h3', clientSecret: 'r5dfve4346jgu4k7mbxnh0x41bp7tp', redirectUri: 'https://study-space-production.up.railway.app/auth/twitch/callback', creatorLogin: 'derbysaren' };
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

const GOOGLE_CONFIG_PATH = path.join(__dirname, 'data', 'google-config.json');
function loadGoogleConfig() {
  try { if (fs.existsSync(GOOGLE_CONFIG_PATH)) return JSON.parse(fs.readFileSync(GOOGLE_CONFIG_PATH, 'utf8')); } catch(e) {}
  return { clientId: '', clientSecret: '', redirectUri: 'http://localhost:3000/auth/google/callback' };
}
let googleCfg = loadGoogleConfig();

const STRIPE_CONFIG_PATH  = path.join(__dirname, 'data', 'stripe-config.json');
const SUBSCRIPTIONS_PATH  = path.join(__dirname, 'data', 'subscriptions.json');
function loadStripeConfig() {
  try { if (fs.existsSync(STRIPE_CONFIG_PATH)) return JSON.parse(fs.readFileSync(STRIPE_CONFIG_PATH, 'utf8')); } catch(e) {}
  return { secretKey: '', webhookSecret: '', priceId: '', successUrl: 'http://localhost:3000/?stripe=success', cancelUrl: 'http://localhost:3000/' };
}
function loadSubscriptions() {
  try { if (fs.existsSync(SUBSCRIPTIONS_PATH)) return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf8')); } catch(e) {}
  return [];
}
function saveSubscriptions(subs) {
  try { fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true }); fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2)); } catch(e) {}
}
const roomSpaceStatus = {};        // roomId → spaceStatus object
const roomCreatorImages = {};      // roomId → profile image URL

ROOM_CONFIGS.forEach(cfg => {
  roomSpaceStatus[cfg.id] = { live: false, twitchUser: null, twitchLogin: null, streamTitle: null, viewerCount: 0, gameName: null };
});

// ── App access token (client credentials, no user sign-in needed) ──
let _appToken = { accessToken: null, expiresAt: 0 };
async function getAppToken() {
  if (_appToken.accessToken && Date.now() < _appToken.expiresAt - 60000) return _appToken.accessToken;
  if (!twitchCfg.clientId || !twitchCfg.clientSecret) return null;
  try {
    const params = new URLSearchParams({ client_id: twitchCfg.clientId, client_secret: twitchCfg.clientSecret, grant_type: 'client_credentials' });
    const data = await _httpsPost('id.twitch.tv', '/oauth2/token', params.toString());
    if (data.access_token) {
      _appToken = { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
      return _appToken.accessToken;
    }
  } catch(e) { console.warn('App token fetch failed:', e.message); }
  return null;
}

function _httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': buf.length
        }
      },
      (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            console.log('HTTPS POST response:', d); // 👈 ADD THIS
            resolve(JSON.parse(d));
          } catch (e) {
            console.error('POST parse error:', d);
            reject(e);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error('HTTPS POST error:', err); // 👈 ADD THIS
      reject(err);
    });
    req.write(buf);
    req.end();
  });
}
function _httpsGet(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: urlPath,
        method: 'GET',
        headers
      },
      (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            console.log('HTTPS GET response:', d); // 👈 ADD THIS
            resolve({ status: res.statusCode, body: JSON.parse(d) });
          } catch (e) {
            console.error('GET parse error:', d);
            reject(e);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error('HTTPS GET error:', err); // 👈 ADD THIS
      reject(err);
    });
    req.end();
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
async function getCreatorProfile() {
  if (!twitchCfg.clientId) return;
  try {
    const appTok = await getAppToken();
    if (!appTok) return;
    for (const cfg of ROOM_CONFIGS) {
      if (!cfg.creatorLogin) continue;
      try {
        const r = await _httpsGet('api.twitch.tv', `/helix/users?login=${cfg.creatorLogin}`, twitchHeaders(appTok));
        const user = r.body?.data?.[0];
        if (user?.profile_image_url) {
          roomCreatorImages[cfg.id] = user.profile_image_url;
          console.log('Creator profile image fetched for', cfg.id, ':', user.profile_image_url);
        }
      } catch(e) {}
    }
  } catch(e) { console.warn('getCreatorProfile failed:', e.message); }
}

async function checkLiveStatus() {
  if (!twitchCfg.clientId) return;
  const appTok = await getAppToken();
  if (!appTok) return;
  for (const cfg of ROOM_CONFIGS) {
    if (!cfg.creatorLogin) continue;
    try {
      const r = await _httpsGet('api.twitch.tv', `/helix/streams?user_login=${cfg.creatorLogin}`, twitchHeaders(appTok));
      if (r.status === 401) { _appToken = { accessToken: null, expiresAt: 0 }; return; }
      const stream = r.body?.data?.[0];
      roomSpaceStatus[cfg.id] = {
        live:        !!stream,
        twitchUser:  cfg.creatorLogin,
        twitchLogin: cfg.creatorLogin,
        streamTitle: stream?.title || null,
        viewerCount: stream?.viewer_count || 0,
        gameName:    stream?.game_name || null,
      };
      console.log('Live status for', cfg.id, ':', !!stream);
      // Broadcast status to room occupants
      io.to(cfg.id).emit('spaceStatus', roomSpaceStatus[cfg.id]);
    } catch(e) { console.warn('Twitch check failed for', cfg.id, ':', e.message); }
  }
  // Ensure creator images are fetched (for landing page)
  if (Object.keys(roomCreatorImages).length === 0) await getCreatorProfile();
}
setInterval(checkLiveStatus, 60000);
checkLiveStatus();
// Fetch creator profile image on startup (separate from live check)
getCreatorProfile();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of playerSessions) { if (now > v.expiresAt) playerSessions.delete(k); }
}, 5 * 60 * 1000);

app.get('/auth/twitch', (req, res) => {
  if (!twitchCfg.clientId) return res.send('<h2>Set clientId in data/twitch-config.json first.</h2>');
  const role  = req.query.role === 'player' ? 'player' : 'creator';
  const ret   = req.query.return || '/play';
  const state = Buffer.from(JSON.stringify({ role, return: ret })).toString('base64url');
  const p = new URLSearchParams({
    client_id:     twitchCfg.clientId,
    redirect_uri:  twitchCfg.redirectUri,
    response_type: 'code',
    scope:         'user:read:email',
    state,
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${p}`);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect('/?twitch=error');
  let stateObj = { role: 'creator', return: '/play' };
  try { stateObj = JSON.parse(Buffer.from(state || '', 'base64url').toString()); } catch(e) {}
  try {
    const params = new URLSearchParams({ client_id: twitchCfg.clientId, client_secret: twitchCfg.clientSecret, code, grant_type: 'authorization_code', redirect_uri: twitchCfg.redirectUri });
    const tokenData = await _httpsPost('id.twitch.tv', '/oauth2/token', params.toString());
    if (!tokenData.access_token) return res.redirect('/?twitch=error');
    const userResp = await _httpsGet('api.twitch.tv', '/helix/users', twitchHeaders(tokenData.access_token));
    const user = userResp.body?.data?.[0];
    if (stateObj.role === 'player') {
      const token = 'ps-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      playerSessions.set(token, {
        name:        user?.display_name || user?.login || 'Viewer',
        twitchLogin: user?.login || null,
        twitchEmail: user?.email || null,
        googleEmail: null,
        profilePic:  user?.profile_image_url || null,
        authType:    'twitch',
        expiresAt:   Date.now() + 10 * 60 * 1000,
      });
      return res.redirect(`/?psid=${token}`);
    }
    // creator flow
    twitchToken = { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, twitchUserId: user?.id, twitchLogin: user?.login, twitchDisplayName: user?.display_name, profileImageUrl: user?.profile_image_url || null };
    saveTwitchToken(twitchToken);
    await checkLiveStatus();
    res.redirect('/play?twitch=connected&preview=1');
  } catch(e) { console.error('Twitch OAuth error:', e); res.redirect('/?twitch=error'); }
});

app.post('/auth/twitch/disconnect', (req, res) => {
  twitchToken = null; saveTwitchToken({});
  ROOM_CONFIGS.forEach(cfg => {
    roomSpaceStatus[cfg.id] = { live: false, twitchUser: null, twitchLogin: null, streamTitle: null, viewerCount: 0, gameName: null };
    io.to(cfg.id).emit('spaceStatus', roomSpaceStatus[cfg.id]);
  });
  res.json({ ok: true });
});

app.get('/auth/google', (req, res) => {
  if (!googleCfg.clientId) return res.send('<h2>Set clientId in data/google-config.json first.</h2>');
  const state = Buffer.from(JSON.stringify({ role: 'player', return: '/' })).toString('base64url');
  const p = new URLSearchParams({
    client_id:     googleCfg.clientId,
    redirect_uri:  googleCfg.redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'offline',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?google=error');
  try {
    const params = new URLSearchParams({ client_id: googleCfg.clientId, client_secret: googleCfg.clientSecret, code, grant_type: 'authorization_code', redirect_uri: googleCfg.redirectUri });
    const tokenData = await _httpsPost('oauth2.googleapis.com', '/token', params.toString());
    if (!tokenData.access_token) return res.redirect('/?google=error');
    const userResp = await _httpsGet('openidconnect.googleapis.com', '/v1/userinfo', { 'Authorization': `Bearer ${tokenData.access_token}` });
    const user = userResp.body;
    const token = 'ps-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    playerSessions.set(token, {
      name:        user?.name || user?.given_name || 'Player',
      twitchLogin: null,
      googleEmail: user?.email || null,
      profilePic:  user?.picture || null,
      authType:    'google',
      expiresAt:   Date.now() + 10 * 60 * 1000,
    });
    res.redirect(`/?psid=${token}`);
  } catch(e) { console.error('Google OAuth error:', e); res.redirect('/?google=error'); }
});

app.get('/api/session/:token', (req, res) => {
  const session = playerSessions.get(req.params.token);
  if (!session || Date.now() > session.expiresAt) {
    playerSessions.delete(req.params.token);
    return res.status(404).json({ error: 'invalid' });
  }
  playerSessions.delete(req.params.token);
  res.json({ name: session.name, twitchLogin: session.twitchLogin, twitchEmail: session.twitchEmail || null, googleEmail: session.googleEmail || null, profilePic: session.profilePic, authType: session.authType || 'twitch' });
});

app.get('/api/twitch/status', (req, res) => {
  const roomId = (req.query.roomId && ROOM_CONFIGS.find(r => r.id === req.query.roomId)) ? req.query.roomId : 'derbysaren';
  res.json(roomSpaceStatus[roomId] || {});
});
app.get('/api/twitch/config', (req, res) => res.json({ configured: !!(twitchCfg.clientId && twitchCfg.clientSecret), connected: !!twitchToken?.twitchLogin, twitchUser: twitchToken?.twitchDisplayName || null, profileImageUrl: twitchToken?.profileImageUrl || null }));

app.get('/api/spaces', (req, res) => {
  const spaces = ROOM_CONFIGS.filter(cfg => !cfg.hidden).map(cfg => {
    const rs  = getRoomState(cfg.id);
    const st  = roomSpaceStatus[cfg.id] || {};
    return {
      id:           cfg.id,
      name:         cfg.name,
      twitchLogin:  cfg.creatorLogin,
      description:  '',
      roomPath:     cfg.path,
      theme:        cfg.theme,
      live:         !!st.live,
      streamTitle:  st.streamTitle  || null,
      viewerCount:  st.viewerCount  || 0,
      gameName:     st.gameName     || null,
      twitchUser:   st.twitchUser   || null,
      playersOnline: Object.keys(rs.players).length,
      creatorAvatar: roomCreatorImages[cfg.id] || null,
    };
  });
  spaces.sort((a, b) => {
    const sA = (a.live ? 100000 : 0) + (a.viewerCount * 100) + (a.playersOnline * 50);
    const sB = (b.live ? 100000 : 0) + (b.viewerCount * 100) + (b.playersOnline * 50);
    return sB - sA;
  });
  res.json(spaces);
});

app.post('/api/streamer-interest', (req, res) => {
  const { name, email, twitchHandle, spaceFor, message } = req.body || {};
  if (!email && !twitchHandle) return res.status(400).json({ ok: false, error: 'Need at least an email or Twitch handle.' });
  const list = loadStreamerInterest();
  const duplicate = list.find(e => (email && e.email === email.trim()) || (twitchHandle && e.twitchHandle === twitchHandle.trim().replace(/^@/, '')));
  if (duplicate) return res.json({ ok: true, alreadyRegistered: true });
  list.push({
    name:         name?.trim() || null,
    email:        email?.trim() || null,
    twitchHandle: twitchHandle?.trim().replace(/^@/, '') || null,
    spaceFor:     spaceFor || null,
    message:      message?.trim() || null,
    submittedAt:  new Date().toISOString(),
    ip:           req.socket.remoteAddress,
  });
  saveStreamerInterest(list);
  res.json({ ok: true });
  // Fire notification email (non-blocking)
  const entry = list[list.length - 1];
  sendNotificationEmail(
    `🌷 New Interest — ${entry.name || entry.twitchHandle || entry.email}`,
    `<pre style="font-family:monospace">
Name:    ${entry.name || '—'}
Email:   ${entry.email || '—'}
Twitch:  ${entry.twitchHandle ? '@' + entry.twitchHandle : '—'}
Space for: ${entry.spaceFor || '—'}
Message: ${entry.message || '—'}
Time:    ${entry.submittedAt}
    </pre>`
  );
});

app.get('/admin/streamer-interest', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const list = loadStreamerInterest();
  const rows = list.map(e => `
    <tr>
      <td>${e.submittedAt?.slice(0,10) || '—'}</td>
      <td>${e.name || '—'}</td>
      <td>${e.email ? `<a href="mailto:${e.email}">${e.email}</a>` : '—'}</td>
      <td>${e.twitchHandle ? `@${e.twitchHandle}` : '—'}</td>
      <td>${e.spaceFor || '—'}</td>
      <td>${e.message || '—'}</td>
    </tr>`).join('');
  res.send(`<!DOCTYPE html><html><head><style>
    body{font-family:monospace;background:#0a0a14;color:#e8e0d0;padding:24px}
    h2{color:#f9c4d2}
    table{border-collapse:collapse;width:100%}
    th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #333}
    th{background:#1a1a2e;color:#f9c4d2}
    a{color:#f9c4d2}
    .count{opacity:.6;margin-bottom:16px}
  </style></head><body>
  <h2>🌷 Interest Registrations (${list.length})</h2>
  <p class="count">${list.length} entr${list.length === 1 ? 'y' : 'ies'}</p>
  <table>
    <tr><th>Date</th><th>Name</th><th>Email</th><th>Twitch</th><th>Space for</th><th>Message</th></tr>
    ${rows || '<tr><td colspan="6">No entries yet</td></tr>'}
  </table>
  </body></html>`);
});

app.post('/api/creator-codes/validate', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ valid: false });
  const codes = loadCreatorCodes();
  const entry = codes.find(c => c.code === code.toUpperCase().trim() && !c.used);
  if (!entry) return res.status(400).json({ valid: false });
  entry.used = true; entry.usedBy = req.ip; entry.usedAt = new Date().toISOString();
  saveCreatorCodes(codes);
  res.json({ valid: true });
});
app.get('/admin/generate-code', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const code = 'CC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const codes = loadCreatorCodes();
  codes.push({ code, used: false, usedBy: null, createdAt: new Date().toISOString() });
  saveCreatorCodes(codes);
  res.json({ code, note: 'Share this with your customer. It can only be used once.' });
});

// ── Feedback ──────────────────────────────────────────────────────────────────
const FEEDBACK_PATH = path.join(__dirname, 'data', 'feedback.json');
function loadFeedback() {
  try { if (fs.existsSync(FEEDBACK_PATH)) return JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8')); } catch(e) {}
  return [];
}
function saveFeedback(list) {
  try { fs.mkdirSync(path.dirname(FEEDBACK_PATH), { recursive: true }); fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(list, null, 2)); } catch(e) {}
}

app.post('/api/feedback', (req, res) => {
  const VALID = ['player', 'streamer', 'maybe', 'not-for-me'];
  const LABELS = { player: '🎮 Yes, as a player', streamer: '🎙️ Yes, as a streamer', maybe: '🤔 Maybe', 'not-for-me': '💜 Not for me' };
  const { choice, roomId } = req.body || {};
  if (!VALID.includes(choice)) return res.status(400).json({ ok: false });
  const list = loadFeedback();
  list.push({ choice, roomId: roomId || null, at: new Date().toISOString() });
  saveFeedback(list);
  res.json({ ok: true });
  sendNotificationEmail(
    `💬 Feedback — ${LABELS[choice] || choice}`,
    `<pre style="font-family:monospace">Choice: ${LABELS[choice] || choice}\nRoom:   ${roomId || '—'}\nTime:   ${new Date().toISOString()}\nTotal responses so far: ${list.length}</pre>`
  );
});

app.get('/admin/feedback', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const list = loadFeedback();
  const counts = { player: 0, streamer: 0, maybe: 0, 'not-for-me': 0 };
  list.forEach(e => { if (counts[e.choice] !== undefined) counts[e.choice]++; });
  const total = list.length;
  const pct = (n) => total ? Math.round(n / total * 100) + '%' : '—';
  res.send(`
    <pre style="font-family:monospace;font-size:14px;padding:24px;background:#0a0a14;color:#e8e0d0;min-height:100vh">
=== Belong Here — Feedback Responses ===

Total responses: ${total}

🎮 Yes, as a player       ${counts['player']}  (${pct(counts['player'])})
🎙️  Yes, as a streamer     ${counts['streamer']}  (${pct(counts['streamer'])})
🤔 Maybe                  ${counts['maybe']}  (${pct(counts['maybe'])})
💜 Not for me             ${counts['not-for-me']}  (${pct(counts['not-for-me'])})

Recent responses:
${list.slice(-20).reverse().map(e => `  ${e.at.slice(0,16).replace('T',' ')}  ${e.choice}  ${e.roomId ? '('+e.roomId+')' : ''}`).join('\n') || '  (none yet)'}
    </pre>
  `);
});

app.get('/admin/stats', (req, res) => {
  const twitchCount = _stats.twitchLogins.length;
  const guestCount  = _stats.guestClientIds.length;
  const currentlyOnline = [...roomState.values()].reduce((sum, rs) => sum + Object.keys(rs.players).length, 0);
  res.send(`
    <pre style="font-family:monospace;font-size:14px;padding:24px;background:#0a0a14;color:#e8e0d0;min-height:100vh">
=== Belong Here — Visitor Stats ===

Twitch sign-ins (unique):  ${twitchCount}
Guests (unique devices):   ${guestCount}
Total unique visitors:     ${twitchCount + guestCount}

Currently online:          ${currentlyOnline}

Twitch logins seen:
${_stats.twitchLogins.map(l => '  @' + l).join('\n') || '  (none yet)'}
    </pre>
  `);
});

// ── Room creation ─────────────────────────────────────────────────────────────
const ROOM_CREATE_CODE = 'SECRETVIP';
app.post('/api/create-room', (req, res) => {
  const { code, twitchLogin, twitchDisplayName } = req.body || {};
  if (!code || !twitchLogin) return res.status(400).json({ error: 'Missing fields.' });
  const safeLogin = twitchLogin.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  if (!safeLogin) return res.status(400).json({ error: 'Invalid Twitch login.' });
  if (code.trim().toUpperCase() !== ROOM_CREATE_CODE) return res.status(403).json({ error: 'Invalid code.' });
  const safeName = twitchDisplayName ? twitchDisplayName.replace(/[<>"'&]/g, '').slice(0, 30) : safeLogin;
  // Check if room already exists
  const existing = ROOM_CONFIGS.find(r => r.creatorLogin?.toLowerCase() === safeLogin);
  if (existing) {
    return res.json({ ok: true, roomPath: existing.path, alreadyExists: true });
  }
  // Create new room
  const newRoom = {
    id: safeLogin,
    creatorLogin: safeLogin,
    name: `${safeName}'s Space`,
    path: '/' + safeLogin,
    theme: 'demo',
    createdAt: new Date().toISOString(),
  };
  ROOM_CONFIGS.push(newRoom);
  // Also persist to dynamic rooms file (excluding built-in rooms)
  const dynamic = loadDynamicRooms().filter(r => r.id !== safeLogin);
  dynamic.push(newRoom);
  saveDynamicRooms(dynamic);
  // Init room state so players can join immediately
  getRoomState(safeLogin);
  roomSpaceStatus[safeLogin] = { live: false, twitchUser: safeLogin, twitchLogin: safeLogin, streamTitle: null, viewerCount: 0, gameName: null };
  res.json({ ok: true, roomPath: newRoom.path });
});

app.get('/api/stripe/checkout', async (req, res) => {
  const stripeCfg = loadStripeConfig();
  if (!stripeCfg.secretKey) return res.status(503).json({ error: 'Stripe not configured — add secretKey to data/stripe-config.json' });
  let stripe;
  try { stripe = require('stripe')(stripeCfg.secretKey); } catch(e) { return res.status(503).json({ error: 'Run: npm install stripe' }); }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: stripeCfg.priceId, quantity: 1 }],
      success_url: stripeCfg.successUrl,
      cancel_url:  stripeCfg.cancelUrl,
    });
    res.redirect(303, session.url);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripeCfg = loadStripeConfig();
  if (!stripeCfg.secretKey) return res.status(503).send('not configured');
  let stripe;
  try { stripe = require('stripe')(stripeCfg.secretKey); } catch(e) { return res.status(503).send('stripe not installed'); }
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], stripeCfg.webhookSecret); } catch(e) { return res.status(400).send('Webhook signature failed'); }
  if (['checkout.session.completed','customer.subscription.created'].includes(event.type)) {
    const obj = event.data.object;
    const subs = loadSubscriptions();
    subs.push({ customerId: obj.customer, email: obj.customer_email || obj.customer_details?.email || null, subscriptionId: obj.subscription || obj.id, status: 'active', createdAt: new Date().toISOString() });
    saveSubscriptions(subs);
  }
  if (event.type === 'customer.subscription.deleted') {
    const subs = loadSubscriptions().map(s => s.subscriptionId === event.data.object.id ? {...s, status:'canceled'} : s);
    saveSubscriptions(subs);
  }
  res.json({ received: true });
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Per-socket rate limiters
  const allow = {
    playerMove:    makeLimiter(20,  1000),
    sendChat:      makeLimiter(5,   3000),
    directMessage: makeLimiter(10,  3000),
    friendRequest: makeLimiter(10,  10000),
    addTask:       makeLimiter(5,   10000),
  };

  // Per-room helpers (valid after playerJoin sets socket.data.roomId)
  const R      = ()         => socket.data.roomId ? getRoomState(socket.data.roomId) : null;
  const P      = ()         => R()?.players || {};
  const me     = ()         => P()[socket.id];
  const bcast  = (evt, d)   => { if (socket.data.roomId) socket.to(socket.data.roomId).emit(evt, d); };
  const emitR  = (evt, d)   => { if (socket.data.roomId) io.to(socket.data.roomId).emit(evt, d); };

  // Send tasks immediately (global); room status + layout sent after playerJoin
  socket.emit('init', { tasks: globalTasks });

  // ── Player join ──────────────────────────────────────────
  socket.on('playerJoin', ({ name, gender, shirtColor, charNum, clientId, twitchLogin, roomId, startX, startY }) => {
    // Resolve room
    const cfg = ROOM_CONFIGS.find(r => r.id === roomId);
    const safeRoomId = cfg ? cfg.id : 'derbysaren';
    socket.data.roomId = safeRoomId;
    socket.join(safeRoomId);                 // socket.io room for scoped broadcasts

    const rs = getRoomState(safeRoomId);
    if (rs.players[socket.id]) return;       // already joined

    const safeName = sanitise(name, 24);
    if (!safeName) return socket.disconnect();
    const safeClientId = sanitise(clientId, 64);

    // Ban check
    if (safeClientId && rs.rolesData.bannedClientIds.some(b => b.clientId === safeClientId)) {
      socket.emit('kicked', { reason: 'You have been banned from this space.' });
      socket.disconnect(); return;
    }

    // Evict ghost from previous socket
    if (safeClientId && rs.clientIdMap[safeClientId] && rs.clientIdMap[safeClientId] !== socket.id) {
      const oldId = rs.clientIdMap[safeClientId];
      if (rs.players[oldId]) {
        socket.to(safeRoomId).emit('playerLeft', { id: oldId });
        delete rs.players[oldId];
      }
    }
    if (safeClientId) rs.clientIdMap[safeClientId] = socket.id;

    const safeTwitchLogin = typeof twitchLogin === 'string' ? twitchLogin.toLowerCase().trim() : null;

    // Creator role: twitchLogin must match this room's creatorLogin
    let role;
    if (safeTwitchLogin && cfg?.creatorLogin &&
        safeTwitchLogin === cfg.creatorLogin.toLowerCase()) {
      role = 'creator';
      if (safeClientId && rs.rolesData.creatorClientId !== safeClientId) {
        rs.rolesData.creatorClientId = safeClientId;
        saveRolesForRoom(safeRoomId);
      }
    } else {
      role = getRoleForRoom(safeClientId, safeRoomId);
    }

    const safeColor   = ['blue','red','green','purple'].includes(shirtColor) ? shirtColor : 'blue';
    const safeGender  = gender === 'female' ? 'female' : 'male';
    const safeCharNum = (typeof charNum === 'string' && /^\d{2}$/.test(charNum) && parseInt(charNum) >= 1 && parseInt(charNum) <= 20) ? charNum : '01';
    const sx = (typeof startX === 'number' && startX >= 32 && startX <= 1068) ? Math.round(startX) : 400;
    const sy = (typeof startY === 'number' && startY >= 32 && startY <= 764)  ? Math.round(startY) : 560;

    rs.players[socket.id] = { id: socket.id, clientId: safeClientId || socket.id, name: safeName, gender: safeGender, shirtColor: safeColor, charNum: safeCharNum, x: sx, y: sy, chatPreference: 'sociable', role, friends: [], pendingFrom: [], pendingMessages: [] };

    // Track unique visitors
    if (safeTwitchLogin) {
      if (!_stats.twitchLogins.includes(safeTwitchLogin)) {
        _stats.twitchLogins.push(safeTwitchLogin);
        saveStats(_stats);
      }
    } else if (safeClientId) {
      if (!_stats.guestClientIds.includes(safeClientId)) {
        _stats.guestClientIds.push(safeClientId);
        saveStats(_stats);
      }
    }

    emitR('playerCount', Object.keys(rs.players).length);
    socket.emit('yourRole', { role });
    socket.emit('spaceStatus', roomSpaceStatus[safeRoomId] || {});
    if (rs.roomLayout) socket.emit('roomLayout', rs.roomLayout);

    socket.emit('existingPlayers', Object.values(rs.players)
      .filter(p => p.id !== socket.id)
      .map(p => ({ id: p.id, name: p.name, gender: p.gender, shirtColor: p.shirtColor, charNum: p.charNum || '01', x: p.x, y: p.y, chatPreference: p.chatPreference, role: p.role || 'regular', statusIcon: p.statusIcon || null, chairSide: p.chairSide || null }))
    );
    socket.emit('spawnAt', { x: sx, y: sy });
    bcast('playerJoined', { id: socket.id, name: safeName, gender: safeGender, shirtColor: safeColor, charNum: safeCharNum, x: sx, y: sy, chatPreference: 'sociable', role, statusIcon: null });
  });

  // ── Player movement ──────────────────────────────────────
  socket.on('playerMove', ({ x, y }) => {
    if (!allow.playerMove()) return;
    const p = me(); if (!p) return;
    const cx = Math.max(32, Math.min(1068, Math.round(Number(x) || 0)));
    const cy = Math.max(32, Math.min(764,  Math.round(Number(y) || 0)));
    const dx = cx - p.x, dy = cy - p.y;
    if (Math.sqrt(dx * dx + dy * dy) > 200) return;
    p.x = cx; p.y = cy;
    bcast('playerMoved', { id: socket.id, x: cx, y: cy });
  });

  // ── Chat preference ──────────────────────────────────────
  socket.on('updatePreference', ({ preference }) => {
    const safe = ['sociable', 'private', 'lockedin'].includes(preference) ? preference : null;
    const p = me(); if (!safe || !p) return;
    const wasLocked = p.chatPreference === 'lockedin';
    p.chatPreference = safe;
    bcast('playerPreferenceUpdated', { id: socket.id, preference: safe });
    if (wasLocked && safe !== 'lockedin') {
      const pending = (p.pendingMessages || []).splice(0);
      pending.forEach(msg => socket.emit('chatMessage', { fromId: msg.fromId, fromName: msg.fromName, message: msg.message }));
    }
  });

  // ── Friend request ───────────────────────────────────────
  socket.on('friendRequest', ({ toId }) => {
    if (!allow.friendRequest()) return;
    const sender = me(), target = P()[toId];
    if (!sender || !target) return;
    if (target.friends.includes(socket.id)) return;
    if (target.pendingFrom.some(r => r.fromId === socket.id)) return;
    target.pendingFrom.push({ fromId: socket.id, fromName: sender.name });
    io.to(toId).emit('friendRequestReceived', { fromId: socket.id, fromName: sender.name });
  });

  socket.on('friendAccept', ({ fromId }) => {
    const accepter = me(), requester = P()[fromId];
    if (!accepter || !requester) return;
    if (!accepter.friends.includes(fromId)) accepter.friends.push(fromId);
    if (!requester.friends.includes(socket.id)) requester.friends.push(socket.id);
    accepter.pendingFrom = accepter.pendingFrom.filter(r => r.fromId !== fromId);
    io.to(fromId).emit('friendAdded', { id: socket.id, name: accepter.name });
    socket.emit('friendAdded', { id: fromId, name: requester.name });
  });

  socket.on('friendDecline', ({ fromId }) => {
    const p = me(); if (p) p.pendingFrom = p.pendingFrom.filter(r => r.fromId !== fromId);
  });

  socket.on('removeFriend', ({ friendId }) => {
    const self = me(), other = P()[friendId];
    if (self) self.friends = self.friends.filter(id => id !== friendId);
    if (other) other.friends = other.friends.filter(id => id !== socket.id);
    socket.emit('friendRemoved', { id: friendId });
    if (other) io.to(friendId).emit('friendRemoved', { id: socket.id });
  });

  // ── Direct message ───────────────────────────────────────
  socket.on('directMessage', ({ toId, message }) => {
    if (!allow.directMessage()) return;
    const sender = me(), target = P()[toId];
    if (!sender || !target) return;
    const safeMsg = sanitise(message, 200); if (!safeMsg) return;
    if (target.chatPreference === 'private' && !sender.friends.includes(toId)) return;
    if (target.chatPreference === 'lockedin') {
      if (!Array.isArray(target.pendingMessages)) target.pendingMessages = [];
      target.pendingMessages.push({ fromId: socket.id, fromName: sender.name, message: safeMsg });
      return;
    }
    io.to(toId).emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg });
  });

  // ── Proximity chat ────────────────────────────────────────
  socket.on('sendChat', ({ message }) => {
    if (!allow.sendChat()) return;
    const sender = me(); if (!sender) return;
    const safeMsg = sanitise(message, 200); if (!safeMsg) return;
    const MAX_PROXIMITY = 120;
    for (const [id, target] of Object.entries(P())) {
      if (id === socket.id) continue;
      const dx = sender.x - target.x, dy = sender.y - target.y;
      if (Math.sqrt(dx * dx + dy * dy) > MAX_PROXIMITY) continue;
      if (target.chatPreference === 'lockedin') continue;
      if (target.chatPreference === 'private' && !target.friends.includes(socket.id)) continue;
      io.to(id).emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg });
    }
    socket.emit('chatMessage', { fromId: socket.id, fromName: sender.name, message: safeMsg, isSelf: true });
  });

  // ── Tasks (global across all rooms) ──────────────────────
  const myClientId = () => me()?.clientId || socket.id;

  socket.on('addTask', ({ text, playerName }) => {
    if (!allow.addTask()) return;
    const safeText = sanitise(text, 120); if (!safeText) return;
    const p = me();
    const task = { id: `${(p?.clientId || socket.id)}-${Date.now()}`, text: safeText, playerName: p ? p.name : sanitise(playerName, 24), playerId: p?.clientId || socket.id, completed: false, createdAt: new Date().toISOString() };
    globalTasks.push(task);
    const incomplete = globalTasks.filter(t => !t.completed);
    const completed  = globalTasks.filter(t =>  t.completed).slice(-200);
    globalTasks = [...incomplete, ...completed];
    saveTasks();
    io.emit('taskAdded', task);
  });

  socket.on('completeTask', ({ taskId }) => {
    const task = globalTasks.find(t => t.id === taskId && t.playerId === myClientId());
    if (task) { task.completed = true; saveTasks(); io.emit('taskCompleted', { taskId }); }
  });
  socket.on('uncompleteTask', ({ taskId }) => {
    const task = globalTasks.find(t => t.id === taskId && t.playerId === myClientId());
    if (task) { task.completed = false; saveTasks(); io.emit('taskUncompleted', { taskId }); }
  });
  socket.on('deleteTask', ({ taskId }) => {
    const task = globalTasks.find(t => t.id === taskId);
    if (task && task.playerId === myClientId()) { globalTasks = globalTasks.filter(t => t.id !== taskId); saveTasks(); io.emit('taskDeleted', { taskId }); }
  });
  socket.on('clearAllTasks', () => {
    const p = me(); if (!p || (p.role !== 'creator' && p.role !== 'mod')) return;
    globalTasks = []; saveTasks(); io.emit('allTasksCleared');
  });

  // ── Status icon ───────────────────────────────────────────
  socket.on('playerStatusIcon', ({ type }) => {
    const p = me(); if (!p) return;
    const valid = [null,'focus','break','pause','eating','cooking','relax','laundry','coffee','workout','washup'];
    const safe = valid.includes(type) ? type : null;
    p.statusIcon = safe;
    bcast('playerStatusIconUpdated', { id: socket.id, type: safe });
  });

  // ── Block / unblock ───────────────────────────────────────
  socket.on('blockPlayer',   ({ targetId }) => { if (me() && P()[targetId]) io.to(targetId).emit('youWereBlocked', { by: socket.id }); });
  socket.on('unblockPlayer', ({ targetId }) => {
    const self = me(), target = P()[targetId];
    if (!self || !target) return;
    socket.emit('playerJoined', { id: target.id, name: target.name, gender: target.gender, shirtColor: target.shirtColor, charNum: target.charNum || '01', x: target.x, y: target.y, chatPreference: target.chatPreference, role: target.role || 'regular', statusIcon: target.statusIcon || null });
    io.to(targetId).emit('playerJoined', { id: self.id, name: self.name, gender: self.gender, shirtColor: self.shirtColor, charNum: self.charNum || '01', x: self.x, y: self.y, chatPreference: self.chatPreference, role: self.role || 'regular', statusIcon: self.statusIcon || null });
  });

  // ── Role management ───────────────────────────────────────
  socket.on('appointMod', ({ targetId }) => {
    const self = me(), target = P()[targetId];
    if (!self || self.role !== 'creator' || !target) return;
    const rd = R().rolesData;
    if (!rd.modClientIds.includes(target.clientId)) rd.modClientIds.push(target.clientId);
    saveRolesForRoom(socket.data.roomId);
    target.role = 'mod';
    io.to(targetId).emit('yourRole', { role: 'mod' });
    emitR('playerRoleUpdated', { id: targetId, role: 'mod' });
  });
  socket.on('removeMod', ({ targetId }) => {
    const self = me(), target = P()[targetId];
    if (!self || self.role !== 'creator' || !target) return;
    const rd = R().rolesData;
    rd.modClientIds = rd.modClientIds.filter(id => id !== target.clientId);
    saveRolesForRoom(socket.data.roomId);
    target.role = 'regular';
    io.to(targetId).emit('yourRole', { role: 'regular' });
    emitR('playerRoleUpdated', { id: targetId, role: 'regular' });
  });

  socket.on('banPlayer', ({ targetId }) => {
    const self = me(), target = P()[targetId];
    if (!self || !target) return;
    if (self.role !== 'creator' && self.role !== 'mod') return;
    if (target.role === 'creator') return;
    if (target.role === 'mod' && self.role === 'mod') return;
    const rd = R().rolesData;
    if (!rd.bannedClientIds.some(b => b.clientId === target.clientId)) rd.bannedClientIds.push({ clientId: target.clientId, name: target.name });
    rd.modClientIds = rd.modClientIds.filter(id => id !== target.clientId);
    saveRolesForRoom(socket.data.roomId);
    io.to(targetId).emit('kicked', { reason: 'You have been banned from this space.' });
    bcast('playerLeft', { id: targetId });
    io.sockets.sockets.get(targetId)?.disconnect();
  });
  socket.on('unbanPlayer', ({ clientId }) => {
    const self = me(); if (!self || self.role !== 'creator') return;
    const rd = R().rolesData;
    rd.bannedClientIds = rd.bannedClientIds.filter(b => b.clientId !== clientId);
    saveRolesForRoom(socket.data.roomId);
    socket.emit('bannedListUpdated', { bannedList: rd.bannedClientIds });
  });
  socket.on('getBannedList', () => {
    const self = me(); if (!self || (self.role !== 'creator' && self.role !== 'mod')) return;
    socket.emit('bannedListUpdated', { bannedList: R().rolesData.bannedClientIds });
  });

  // ── DIY layout sync ───────────────────────────────────────
  socket.on('saveDIYLayout', ({ items }) => {
    const self = me(); if (!self || self.role !== 'creator') return;
    if (!Array.isArray(items)) return;
    R().roomLayout = items;
    bcast('roomLayout', items);
  });

  socket.on('getLayout', () => {
    const rs = R(); if (!rs) return;
    const rid = socket.data.roomId;
    const layout = rs.roomLayout || [...DEFAULT_DEMO_LAYOUT];
    socket.emit('roomLayout', layout);
  });

  // ── Appearance ────────────────────────────────────────────
  socket.on('updateAppearance', ({ gender, shirtColor }) => {
    const p = me(); if (!p) return;
    p.gender = gender === 'female' ? 'female' : 'male';
    p.shirtColor = ['blue','red','green','purple'].includes(shirtColor) ? shirtColor : 'blue';
    bcast('playerAppearanceUpdated', { id: socket.id, gender: p.gender, shirtColor: p.shirtColor });
  });

  // ── Chair sit / stand ─────────────────────────────────────
  socket.on('sitDown', ({ chairId, side }) => {
    const safeId   = String(chairId).slice(0, 32);
    const safeSide = ['north','south','east','west'].includes(side) ? side : null;
    const seats = R()?.seatOccupancy; if (!seats) return;
    if (seats[safeId] && seats[safeId] !== socket.id) { socket.emit('sitRejected', { chairId: safeId }); return; }
    for (const [cid, sid] of Object.entries(seats)) { if (sid === socket.id) { delete seats[cid]; bcast('chairFreed', { chairId: cid, playerId: socket.id }); break; } }
    seats[safeId] = socket.id;
    const p = me(); if (p) p.chairSide = safeSide;
    bcast('chairTaken', { chairId: safeId, playerId: socket.id, side: safeSide });
  });
  socket.on('standUp', ({ chairId }) => {
    const safeId = String(chairId).slice(0, 32);
    const seats = R()?.seatOccupancy; if (!seats) return;
    if (seats[safeId] === socket.id) {
      delete seats[safeId];
      const p = me(); if (p) p.chairSide = null;
      bcast('chairFreed', { chairId: safeId, playerId: socket.id });
    }
  });

  // ── Call signaling ────────────────────────────────────────
  socket.on('callRequest', ({ toId }) => {
    const self = me(), target = P()[toId]; if (!self || !target) return;
    const callId = _makeCallId();
    R().activeCalls[callId] = { participants: [socket.id] };
    socket.emit('callCreated', { callId, toId });
    io.to(toId).emit('incomingCall', { callId, fromId: socket.id, fromName: self.name });
  });
  socket.on('callAccept', ({ callId }) => {
    const self = me(); if (!self) return;
    const call = R()?.activeCalls[callId]; if (!call) return;
    const others = [...call.participants];
    call.participants.push(socket.id);
    socket.emit('callJoined', { callId, participants: others });
    others.forEach(pid => io.to(pid).emit('callParticipantJoined', { callId, peerId: socket.id, peerName: self.name }));
  });
  socket.on('callDecline', ({ callId }) => {
    const call = R()?.activeCalls[callId]; if (!call) return;
    call.participants.forEach(pid => io.to(pid).emit('callDeclined', { callId, byId: socket.id, byName: me()?.name || '?' }));
    if (call.participants.length <= 1) delete R().activeCalls[callId];
  });
  socket.on('callLeave', ({ callId }) => {
    const calls = R()?.activeCalls; if (!calls || !calls[callId]) return;
    const call = calls[callId];
    call.participants = call.participants.filter(id => id !== socket.id);
    call.participants.forEach(pid => io.to(pid).emit('callParticipantLeft', { callId, peerId: socket.id }));
    if (call.participants.length === 0) { delete calls[callId]; }
    else if (call.participants.length === 1) { io.to(call.participants[0]).emit('callEnded', { callId }); delete calls[callId]; }
  });
  socket.on('callInvite', ({ callId, toId }) => {
    const self = me(), target = P()[toId], call = R()?.activeCalls[callId];
    if (!self || !target || !call || !call.participants.includes(socket.id)) return;
    io.to(toId).emit('incomingCall', { callId, fromId: socket.id, fromName: self.name });
  });
  socket.on('callOffer',  ({ toId, offer })     => { if (me() && P()[toId]) io.to(toId).emit('callOffer',  { fromId: socket.id, offer }); });
  socket.on('callAnswer', ({ toId, answer })    => { if (me() && P()[toId]) io.to(toId).emit('callAnswer', { fromId: socket.id, answer }); });
  socket.on('callIce',    ({ toId, candidate }) => { if (me() && P()[toId]) io.to(toId).emit('callIce',    { fromId: socket.id, candidate }); });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const rs = socket.data.roomId ? getRoomState(socket.data.roomId) : null;
    if (!rs) return;
    const player = rs.players[socket.id];
    if (player) {
      for (const friendId of player.friends) {
        io.to(friendId).emit('friendWentOffline', { id: socket.id });
        if (rs.players[friendId]) rs.players[friendId].friends = rs.players[friendId].friends.filter(id => id !== socket.id);
      }
    }
    for (const [callId, call] of Object.entries(rs.activeCalls)) {
      if (!call.participants.includes(socket.id)) continue;
      call.participants = call.participants.filter(id => id !== socket.id);
      call.participants.forEach(pid => io.to(pid).emit('callParticipantLeft', { callId, peerId: socket.id }));
      if (call.participants.length === 0) { delete rs.activeCalls[callId]; }
      else if (call.participants.length === 1) { io.to(call.participants[0]).emit('callEnded', { callId }); delete rs.activeCalls[callId]; }
    }
    for (const [cid, sid] of Object.entries(rs.seatOccupancy)) {
      if (sid === socket.id) { delete rs.seatOccupancy[cid]; socket.to(socket.data.roomId).emit('chairFreed', { chairId: cid, playerId: socket.id }); break; }
    }
    socket.to(socket.data.roomId).emit('playerLeft', { id: socket.id });
    delete rs.players[socket.id];
    for (const [cid, sid] of Object.entries(rs.clientIdMap)) { if (sid === socket.id) { delete rs.clientIdMap[cid]; break; } }
    io.to(socket.data.roomId).emit('playerCount', Object.keys(rs.players).length);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Study Space running → http://localhost:${PORT}`);
});
