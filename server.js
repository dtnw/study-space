const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_PATH = path.join(__dirname, 'data', 'tasks.json');

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
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

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
  socket.on('playerJoin', ({ name, gender, shirtColor, clientId }) => {
    if (players[socket.id]) return; // already joined — ignore duplicate
    const safeName = sanitise(name, 24);
    if (!safeName) return socket.disconnect();

    // Reconnection: evict ghost player from previous socket
    const safeClientId = sanitise(clientId, 64);
    if (safeClientId && clientIdMap[safeClientId] && clientIdMap[safeClientId] !== socket.id) {
      const oldSocketId = clientIdMap[safeClientId];
      if (players[oldSocketId]) {
        socket.broadcast.emit('playerLeft', { id: oldSocketId });
        delete players[oldSocketId];
      }
    }
    if (safeClientId) clientIdMap[safeClientId] = socket.id;
    const safeColor  = ['blue','red','green','purple'].includes(shirtColor) ? shirtColor : 'blue';
    const safeGender = gender === 'female' ? 'female' : 'male';
    players[socket.id] = {
      id: socket.id,
      name: safeName,
      gender: safeGender,
      shirtColor: safeColor,
      x: 400,
      y: 560,
      chatPreference: 'sociable',
      friends: [],
      pendingFrom: [],
    };
    io.emit('playerCount', Object.keys(players).length);

    // Send existing players to new joiner
    socket.emit('existingPlayers', Object.values(players)
      .filter(p => p.id !== socket.id)
      .map(p => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        shirtColor: p.shirtColor,
        x: p.x,
        y: p.y,
        chatPreference: p.chatPreference,
      }))
    );

    // Broadcast to others
    socket.broadcast.emit('playerJoined', {
      id: socket.id,
      name: safeName,
      gender: safeGender,
      shirtColor: safeColor,
      x: 400,
      y: 560,
      chatPreference: 'sociable',
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
    players[socket.id].chatPreference = safe;
    socket.broadcast.emit('playerPreferenceUpdated', { id: socket.id, preference: safe });
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

  // ── Direct message ───────────────────────────────────────
  socket.on('directMessage', ({ toId, message }) => {
    if (!allow.directMessage()) return;
    const sender = players[socket.id];
    const target = players[toId];
    if (!sender || !target) return;
    if (!sender.friends.includes(toId)) return; // must be mutual friends
    const safeMsg = sanitise(message, 200);
    if (!safeMsg) return;
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
    const task = {
      id: `${socket.id}-${Date.now()}`,
      text: safeText,
      playerName: safeName,
      playerId: socket.id,
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

  // Mark a task complete (only owner)
  socket.on('completeTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId && t.playerId === socket.id);
    if (task) {
      task.completed = true;
      saveTasks();
      io.emit('taskCompleted', { taskId });
    }
  });

  // Undo a task completion (only owner)
  socket.on('uncompleteTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId && t.playerId === socket.id);
    if (task) {
      task.completed = false;
      saveTasks();
      io.emit('taskUncompleted', { taskId });
    }
  });

  // Delete a task (only owner can delete)
  socket.on('deleteTask', ({ taskId }) => {
    const task = globalTasks.find((t) => t.id === taskId);
    if (task && task.playerId === socket.id) {
      globalTasks = globalTasks.filter((t) => t.id !== taskId);
      saveTasks();
      io.emit('taskDeleted', { taskId });
    }
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
