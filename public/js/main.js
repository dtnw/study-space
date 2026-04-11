/**
 * main.js
 * Bootstraps the game:
 *  1. Connects Socket.io
 *  2. Waits for player to enter name + choose gender
 *  3. Initialises PlayerClass, Phaser + TaskManager
 *  4. Wires all DOM events (modals, task buttons, pomodoro controls)
 */

(function () {
  // ── Shared game state (read by GameScene) ──────────────────
  window.gameState = {
    playerName: '',
    playerId: null,
    status: 'idle',
  };

  // All players currently in the space (excluding self)
  window._allPlayers = {};

  window.socialState = {
    friends: [],
    requests: [],
    sendFriendRequest(toId, toName) {
      if (this.friends.find(f => f.id === toId)) { showToast('Already friends!'); return; }
      if (toId.startsWith('npc-')) {
        showToast('Friend request sent to ' + toName + '!');
        // NPC accepts after a short delay
        setTimeout(() => {
          if (!window.socialState.friends.find(f => f.id === toId)) {
            window.socialState.friends.push({ id: toId, name: toName, online: true });
            window._renderMembersList?.();
            showToast(toName + ' accepted your request! 🎉');
          }
        }, 1800);
        return;
      }
      window.socket?.emit('friendRequest', { toId });
      showToast('Friend request sent to ' + toName + '!');
    },
  };

  // ── Socket.io ──────────────────────────────────────────────
  const socket = io();
  window.socket = socket;

  socket.on('init', ({ tasks }) => {
    window.TaskManager.onInit(tasks);
  });
  socket.on('taskAdded',     (task)       => window.TaskManager.onTaskAdded(task));
  socket.on('taskCompleted',   ({ taskId }) => window.TaskManager.onTaskCompleted({ taskId }));
  socket.on('taskUncompleted', ({ taskId }) => window.TaskManager.onTaskUncompleted({ taskId }));
  socket.on('taskDeleted',     ({ taskId }) => window.TaskManager.onTaskDeleted({ taskId }));
  socket.on('playerCount',   (n)          => {
    document.getElementById('player-count').textContent = `👤 ${n}`;
  });

  // ── Social socket events ───────────────────────────────────

  socket.on('existingPlayers', (list) => {
    list.forEach(p => {
      window._allPlayers[p.id] = { id: p.id, name: p.name, chatPreference: p.chatPreference || 'sociable' };
      if (window.gameScene) window.gameScene._spawnOtherPlayer(p);
      else { window._pendingPlayers = window._pendingPlayers || []; window._pendingPlayers.push(p); }
    });
    _renderMembersList();
  });

  socket.on('playerJoined', (p) => {
    window._allPlayers[p.id] = { id: p.id, name: p.name, chatPreference: p.chatPreference || 'sociable' };
    if (window.gameScene) window.gameScene._spawnOtherPlayer(p);
    else { window._pendingPlayers = window._pendingPlayers || []; window._pendingPlayers.push(p); }
    _renderMembersList();
  });

  socket.on('playerMoved', ({ id, x, y }) => { window.gameScene?._moveOtherPlayer(id, x, y); });

  socket.on('playerLeft', ({ id }) => {
    delete window._allPlayers[id];
    window.gameScene?._removeOtherPlayer(id);
    const f = window.socialState.friends.find(f => f.id === id);
    if (f) { f.online = false; }
    _renderMembersList();
  });

  socket.on('playerPreferenceUpdated', ({ id, preference }) => {
    if (window._allPlayers[id]) window._allPlayers[id].chatPreference = preference;
    const op = window.gameScene?.otherPlayers?.[id];
    if (op) op.data.chatPreference = preference;
    _renderMembersList();
  });

  socket.on('friendRequestReceived', ({ fromId, fromName }) => {
    window.socialState.requests.push({ fromId, fromName });
    _renderFriendRequests();
    showToast(fromName + ' wants to be friends!');
  });

  socket.on('friendAdded', ({ id, name }) => {
    if (!window.socialState.friends.find(f => f.id === id))
      window.socialState.friends.push({ id, name, online: true });
    window.socialState.requests = window.socialState.requests.filter(r => r.fromId !== id);
    _renderFriendRequests();
    _renderMembersList();
    showToast(name + ' is now your friend! 🎉');
  });

  socket.on('friendWentOffline', ({ id }) => {
    const f = window.socialState.friends.find(f => f.id === id);
    if (f) { f.online = false; _renderMembersList(); }
  });

  socket.on('chatMessage', ({ fromId, fromName, message, isSelf }) => {
    if (window.gameScene?._isDeaf) return;
    if (isSelf) return; // self messages shown in own chat bubble still (proximity)
    window._routeChatToFriendPanel?.(fromId, fromName, message);
  });

  // ── Gender toggle ──────────────────────────────────────────
  let _selectedGender = 'male';

  document.getElementById('gender-boy-btn').addEventListener('click', () => {
    SoundManager.play('click');
    _selectedGender = 'male';
    document.getElementById('gender-boy-btn').classList.add('active');
    document.getElementById('gender-girl-btn').classList.remove('active');
  });

  document.getElementById('gender-girl-btn').addEventListener('click', () => {
    SoundManager.play('click');
    _selectedGender = 'female';
    document.getElementById('gender-girl-btn').classList.add('active');
    document.getElementById('gender-boy-btn').classList.remove('active');
  });

  // ── Shirt colour swatches ──────────────────────────────────
  let _selectedShirtColor = 'blue';

  document.querySelectorAll('.shirt-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.shirt-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      _selectedShirtColor = swatch.dataset.color;
      SoundManager.play('click');
    });
  });

  // ── Name modal → join ──────────────────────────────────────
  const nameModal = document.getElementById('name-modal');
  const nameInput = document.getElementById('name-input');
  const joinBtn   = document.getElementById('join-btn');

  function joinGame() {
    const name = nameInput.value.trim();
    if (!name) {
      // Shake the input and show error — don't proceed
      const errEl = document.getElementById('name-error');
      if (errEl) errEl.textContent = 'Please enter a name!';
      nameInput.classList.remove('shake');
      void nameInput.offsetWidth; // force reflow so animation restarts
      nameInput.classList.add('shake');
      nameInput.focus();
      return;
    }
    // Clear any previous error
    const errEl = document.getElementById('name-error');
    if (errEl) errEl.textContent = '';
    // Stable client ID survives page refresh / socket reconnect
    let clientId = sessionStorage.getItem('studyspace_clientId');
    if (!clientId) {
      clientId = 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('studyspace_clientId', clientId);
    }
    window._clientId = clientId;

    window.gameState.playerName = name;
    window.gameState.playerId   = socket.id || `local-${Date.now()}`;

    document.getElementById('player-name-display').textContent = name;

    // Init player data
    window.PlayerClass.init(name, _selectedGender);

    // Apply shirt colour before Phaser creates textures
    if (window.PixelSprites) {
      window.PixelSprites.setShirtColor(_selectedShirtColor);
    }

    window.TaskManager.init(socket.id, name);
    socket.emit('playerJoin', { name, gender: _selectedGender, shirtColor: _selectedShirtColor, clientId: window._clientId });

    nameModal.classList.remove('active');
    nameModal.classList.add('hidden');

    startPhaser();

  }

  joinBtn.addEventListener('click', () => { SoundManager.play('click'); joinGame(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
  nameInput.focus();

  // ── Phaser startup ─────────────────────────────────────────
  function startPhaser() {
    const config = {
      type: Phaser.CANVAS,
      width: 1100,
      height: 800,
      parent: 'game-container',
      backgroundColor: '#0a0a10',
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
      },
      scene: [GameScene],
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
      },
    };
    window.game = new Phaser.Game(config);
  }

  // ── Input blocking (keys pass through to inputs while typing) ────────────
  // clearCaptures() removes ALL preventDefault hooks while an input is focused.
  // On focusout we only restore the arrow-key captures (WASD/E/Space are already
  // registered with enableCapture=false in GameScene so they never need restoring).
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (window.game?.input?.keyboard) {
        window.game.input.keyboard.clearCaptures();
      }
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (window.game?.input?.keyboard) {
        // Restore only arrow-key captures for cursor movement in the game
        window.game.input.keyboard.addCapture([37, 38, 39, 40]); // ← ↑ → ↓
      }
    }
  });

  // ── Pomodoro modal ─────────────────────────────────────────
  document.getElementById('start-pomo-btn').addEventListener('click', () => {
    SoundManager.play('click');
    const focusMin    = parseInt(document.getElementById('focus-input').value, 10) || 0;
    const breakMin    = parseInt(document.getElementById('break-input').value, 10) || 0;
    const autoNext    = document.getElementById('auto-next-cb').checked;
    const pomosTarget = parseInt(document.getElementById('pomo-target-input').value, 10) || 1;
    hidePomodoroModal();
    window.PomodoroManager.start(focusMin, breakMin, autoNext, pomosTarget);
  });

  document.getElementById('skip-pomo-btn').addEventListener('click', () => {
    SoundManager.play('click');
    hidePomodoroModal();
    // Just sitting — no timer, no status icon
    const si = document.getElementById('status-indicator');
    si.textContent = '● AT DESK';
    si.className = 'status-idle';
    if (window.gameScene) window.gameScene.setStatusIcon(null);
  });

  // X button: stay seated without starting timer
  document.getElementById('close-pomo-modal-btn').addEventListener('click', () => {
    SoundManager.play('click');
    hidePomodoroModal();
    // Just sitting — no timer, no status icon
    const si = document.getElementById('status-indicator');
    si.textContent = '● AT DESK';
    si.className = 'status-idle';
    if (window.gameScene) window.gameScene.setStatusIcon(null);
  });

  function hidePomodoroModal() {
    const m = document.getElementById('pomodoro-modal');
    m.classList.add('hidden');
    m.classList.remove('active');
  }

  // ── Timer controls (pause / resume / stop) ─────────────────
  document.getElementById('pause-pomo-btn').addEventListener('click', () => {
    SoundManager.play('click');
    window.PomodoroManager.pause();
  });

  document.getElementById('resume-pomo-btn').addEventListener('click', () => {
    SoundManager.play('click');
    window.PomodoroManager.resume();
  });

  document.getElementById('skip-timer-btn').addEventListener('click', () => {
    SoundManager.play('click');
    if (window.PomodoroManager.isRunning()) {
      const msgEl = document.getElementById('stop-confirm-msg');
      const onBreak = window.PomodoroManager.isBreak?.() ?? false;
      if (msgEl) msgEl.textContent = onBreak
        ? 'Breaks are important! Are you sure you want to skip?'
        : 'Skip this focus phase?';
      window.PomodoroManager.requestSkip(() => window.PomodoroManager.skip());
    }
  });

  document.getElementById('stop-timer-btn').addEventListener('click', () => {
    SoundManager.play('click');
    if (window.PomodoroManager.isRunning()) {
      window.PomodoroManager.requestStop(() => {
        if (window.gameScene) window.gameScene.standUp();
      });
    }
  });

  // ── Stop confirm modal buttons ─────────────────────────────
  document.getElementById('stop-confirm-yes-btn').addEventListener('click', () => {
    SoundManager.play('click');
    window.PomodoroManager.confirmStop();
  });

  document.getElementById('stop-confirm-no-btn').addEventListener('click', () => {
    SoundManager.play('click');
    window.PomodoroManager.cancelStop();
  });

  // ── Pomo finish modal ─────────────────────────────────────
  document.getElementById('pomo-finish-ok-btn').addEventListener('click', () => {
    SoundManager.play('click');
    window.PomodoroManager.hideFinishModal();
  });

  // ── Timer zero modal ───────────────────────────────────────
  document.getElementById('timer-zero-ok-btn').addEventListener('click', () => {
    SoundManager.play('click');
    const m = document.getElementById('timer-zero-modal');
    m.classList.add('hidden');
    m.classList.remove('active');
  });

  // ── Task done modal ────────────────────────────────────────
  document.getElementById('task-done-ok-btn').addEventListener('click', () => {
    SoundManager.play('click');
    const m = document.getElementById('task-done-modal');
    m.classList.add('hidden');
    m.classList.remove('active');
  });

  // ── Add task modal ─────────────────────────────────────────
  const addTaskModal   = document.getElementById('add-task-modal');
  const taskInput      = document.getElementById('task-input');
  const addTaskBtn     = document.getElementById('add-task-btn');
  const confirmTaskBtn = document.getElementById('confirm-task-btn');
  const cancelTaskBtn  = document.getElementById('cancel-task-btn');

  addTaskBtn.addEventListener('click', () => {
    SoundManager.play('click');
    taskInput.value = '';
    addTaskModal.classList.remove('hidden');
    addTaskModal.classList.add('active');
    setTimeout(() => taskInput.focus(), 50);
  });

  function submitTask() {
    const text = taskInput.value.trim();
    if (text) {
      window.TaskManager.addTask(text);
      SoundManager.play('complete');
    }
    closeTaskModal();
  }

  confirmTaskBtn.addEventListener('click', () => { SoundManager.play('click'); submitTask(); });
  taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitTask(); });
  cancelTaskBtn.addEventListener('click', () => { SoundManager.play('click'); closeTaskModal(); });

  function closeTaskModal() {
    addTaskModal.classList.add('hidden');
    addTaskModal.classList.remove('active');
  }

  // ── Click outside modal to close ──────────────────────────
  [addTaskModal].forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        m.classList.add('hidden');
        m.classList.remove('active');
      }
    });
  });

  // ── Keyboard: Escape closes modals ────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [addTaskModal].forEach((m) => {
        m.classList.add('hidden');
        m.classList.remove('active');
      });
    }
  });

  // ── Helper ────────────────────────────────────────────────
  function getGameScene() {
    if (!window.game) return null;
    return window.game.scene.getScene('GameScene');
  }

  // ── DIY bar ──────────────────────────────────────────────

  // Creator mode toggle
  const diyToggleBtn = document.getElementById('diy-creator-toggle');
  const diyPanel     = document.getElementById('diy-panel');
  let diyCreatorOn   = false;

  diyToggleBtn?.addEventListener('click', () => {
    SoundManager.play('click');
    diyCreatorOn = !diyCreatorOn;
    diyToggleBtn.classList.toggle('active', diyCreatorOn);
    diyPanel?.classList.toggle('hidden', !diyCreatorOn);
    if (diyCreatorOn) window.gameScene?.enterCreatorMode();
    else              window.gameScene?.exitCreatorMode();
  });

  // Exit creator from inside the panel
  document.getElementById('diy-exit-creator')?.addEventListener('click', () => {
    SoundManager.play('click');
    diyCreatorOn = false;
    diyToggleBtn?.classList.remove('active');
    diyPanel?.classList.add('hidden');
    window.gameScene?.exitCreatorMode();
  });

  // Section tabs (Furniture / Decoration)
  document.querySelectorAll('.diy-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      SoundManager.play('click');
      document.querySelectorAll('.diy-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.diy-tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`diy-tab-${tab.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // Item buttons — enter placement mode (mousedown for drag-to-place support)
  document.querySelectorAll('.diy-item-btn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      SoundManager.play('click');
      const type = btn.dataset.type;
      if (!window.gameScene) return;
      document.querySelectorAll('.diy-item-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.gameScene.enterDIYPlacement(type);
      window.gameScene._isDragPlacing = true;
    });
    // If mouse released on the button itself (normal click, no drag) → clear drag flag
    btn.addEventListener('mouseup', () => {
      if (window.gameScene) window.gameScene._isDragPlacing = false;
    });
  });

  // Placement controls
  document.getElementById('diy-rotate-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?._diyRotate();
  });
  // ── Eat timer modal ────────────────────────────────────────
  function hideEatModal() {
    const m = document.getElementById('eat-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
  }
  document.getElementById('eat-just-sit-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    hideEatModal();
  });
  document.getElementById('eat-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('eat-minutes').value, 10) || 20;
    hideEatModal();
    window.ActivityTimer.start('EATING', mins, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene.standUp();
    });
  });

  // ── Cook timer modal ────────────────────────────────────────
  function hideCookModal() {
    const m = document.getElementById('cook-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
  }
  document.getElementById('cook-just-cook-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    hideCookModal();
  });
  document.getElementById('cook-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('cook-minutes').value, 10) || 15;
    hideCookModal();
    window.ActivityTimer.start('COOKING', mins, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene._stopCooking();
    });
  });

  // ── Relax timer modal (bean bag) ────────────────────────────────────────
  function hideRelaxModal() {
    const m = document.getElementById('relax-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
  }
  document.getElementById('relax-just-chill-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    hideRelaxModal();
  });
  document.getElementById('relax-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('relax-minutes').value, 10) || 15;
    hideRelaxModal();
    window.ActivityTimer.start('RELAXING', mins, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene.standUp();
    });
  });

  // ── Laundry timer modal ──────────────────────────────────────────────────
  function hideLaundryModal() {
    const m = document.getElementById('laundry-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
  }
  document.getElementById('laundry-just-wash-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    hideLaundryModal();
  });
  document.getElementById('laundry-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('laundry-minutes').value, 10) || 45;
    hideLaundryModal();
    window.ActivityTimer.start('LAUNDRY', mins, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene._stopLaundry();
    });
  });

  // ── Workout timer modal ─────────────────────────────────────────────────
  document.getElementById('workout-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('workout-duration').value, 10) || 30;
    document.getElementById('workout-modal').classList.add('hidden');
    document.getElementById('workout-modal').classList.remove('active');
    window.ActivityTimer.start('WORKING OUT', mins * 60, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene._stopWorkout();
    });
  });
  document.getElementById('workout-skip-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    document.getElementById('workout-modal').classList.add('hidden');
    document.getElementById('workout-modal').classList.remove('active');
  });

  // ── Wash-up timer modal ──────────────────────────────────────────────────
  document.getElementById('wash-start-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const mins = parseInt(document.getElementById('wash-duration').value, 10) || 10;
    document.getElementById('wash-modal').classList.add('hidden');
    document.getElementById('wash-modal').classList.remove('active');
    window.ActivityTimer.start('WASHING UP', mins * 60, () => {
      SoundManager.play('pomo');
      if (window.gameScene) window.gameScene._stopWashUp();
    });
  });
  document.getElementById('wash-skip-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    document.getElementById('wash-modal').classList.add('hidden');
    document.getElementById('wash-modal').classList.remove('active');
  });

  document.getElementById('diy-cancel-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?.exitDIYPlacement();
  });

  // Selection controls
  document.getElementById('diy-rot-left-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?._diyRotateSelected(-1);
  });
  document.getElementById('diy-rot-right-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?._diyRotateSelected(1);
  });
  document.getElementById('diy-delete-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?._diyDeleteSelected();
  });
  document.getElementById('diy-deselect-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.gameScene?._diyDeselect();
  });

  // ── Social helper functions ────────────────────────────────

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Per-friend chat history: { [friendId]: [{from:'me'|'them', text, name}] }
  const _friendChats = {};
  let _activeChatId = null;

  function _renderMembersList() {
    const list = document.getElementById('members-list');
    const countEl = document.getElementById('members-online-count');
    if (!list) return;
    const allPlayers = Object.values(window._allPlayers || {});
    if (countEl) countEl.textContent = allPlayers.length > 0 ? allPlayers.length : '';
    if (allPlayers.length === 0) {
      list.innerHTML = '<li class="members-empty">Just you here!<br/>Invite someone to study 🌸</li>';
      return;
    }
    const friends = window.socialState.friends || [];
    const friendIds = new Set(friends.map(f => f.id));
    const sorted = [...allPlayers].sort((a, b) => {
      const af = friendIds.has(a.id), bf = friendIds.has(b.id);
      if (af && !bf) return -1;
      if (!af && bf) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    list.innerHTML = sorted.map(p => {
      const pref = p.chatPreference || 'sociable';
      const isFriend = friendIds.has(p.id);
      const safeId   = escHtml(p.id);
      const safeName = escHtml(p.name);
      const actionBtn = isFriend
        ? '<button class="member-chat-btn" title="Open chat" onclick="window._openFriendChatById(\'' + safeId + '\',\'' + safeName + '\')">💬</button>'
        : '<button class="member-add-btn" title="Add friend" onclick="window._memberAddFriend(\'' + safeId + '\',\'' + safeName + '\',\'' + pref + '\')">+</button>';
      return '<li class="member-item">' +
        '<span class="member-dot ' + pref + '"></span>' +
        (isFriend ? '<span class="member-star" title="Friend">★</span>' : '') +
        '<span class="member-name">' + safeName + '</span>' +
        actionBtn +
      '</li>';
    }).join('');
  }

  window._memberAddFriend = (id, name, pref) => {
    if (pref === 'lockedin') {
      showToast(name + ' is currently locked in to focus! You can add them as a friend when they are out of focus mode.');
      return;
    }
    window.socialState?.sendFriendRequest?.(id, name);
  };

  function _renderFriendsList() {
    // No-op: friends are shown inside the members list
  }

  function _renderFriendRequests() {
    const section = document.getElementById('friend-requests');
    const list = document.getElementById('friend-request-list');
    if (!section || !list) return;
    const reqs = window.socialState.requests;
    section.classList.toggle('hidden', reqs.length === 0);
    list.innerHTML = reqs.map(r =>
      '<li class="friend-req-item">' +
        '<span>' + escHtml(r.fromName) + '</span>' +
        '<button class="pixel-btn small friend-req-accept" onclick="window._acceptFriend(\'' + escHtml(r.fromId) + '\')">✓</button>' +
        '<button class="pixel-btn small danger" onclick="window._declineFriend(\'' + escHtml(r.fromId) + '\')">✕</button>' +
      '</li>'
    ).join('');
  }

  window._renderFriendRequests = _renderFriendRequests;
  window._renderFriendsList    = _renderFriendsList;

  window._acceptFriend = (fromId) => {
    const req = window.socialState.requests.find(r => r.fromId === fromId);
    if (!req) return;
    if (fromId.startsWith('npc-')) {
      if (!window.socialState.friends.find(f => f.id === fromId))
        window.socialState.friends.push({ id: fromId, name: req.fromName, online: true });
      window.socialState.requests = window.socialState.requests.filter(r => r.fromId !== fromId);
      _renderFriendRequests();
      _renderMembersList();
      showToast(req.fromName + ' is now your friend! 🎉');
    } else {
      window.socket?.emit('friendAccept', { fromId });
    }
  };

  window._declineFriend = (fromId) => {
    window.socket?.emit('friendDecline', { fromId });
    window.socialState.requests = window.socialState.requests.filter(r => r.fromId !== fromId);
    _renderFriendRequests();
  };

  // ── Friend chat ────────────────────────────────────────────

  function _openFriendChat(friendId, friendName) {
    _activeChatId = friendId;
    if (!_friendChats[friendId]) _friendChats[friendId] = [];
    const section = document.getElementById('friend-chat-section');
    const nameEl  = document.getElementById('friend-chat-name');
    if (section) section.classList.remove('hidden');
    if (nameEl)  nameEl.textContent = friendName;
    _renderFriendChatMessages();
    document.getElementById('friend-chat-input')?.focus();
  }

  function _renderFriendChatMessages() {
    const el = document.getElementById('friend-chat-messages');
    if (!el || !_activeChatId) return;
    const msgs = _friendChats[_activeChatId] || [];
    el.innerHTML = msgs.map(m =>
      '<div class="chat-msg ' + (m.from === 'me' ? 'chat-msg-me' : 'chat-msg-them') + '">' +
        escHtml(m.text) +
      '</div>'
    ).join('');
    el.scrollTop = el.scrollHeight;
  }

  function _sendFriendChat() {
    const input = document.getElementById('friend-chat-input');
    if (!input || !_activeChatId) return;
    const text = input.value.trim();
    if (!text) return;
    if (!_friendChats[_activeChatId]) _friendChats[_activeChatId] = [];
    _friendChats[_activeChatId].push({ from: 'me', text });
    input.value = '';
    _renderFriendChatMessages();
    if (!_activeChatId.startsWith('npc-')) {
      window.socket?.emit('directMessage', { toId: _activeChatId, message: text });
      const targetPref = window._allPlayers[_activeChatId]?.chatPreference;
      if (targetPref === 'lockedin') {
        const targetName = window._allPlayers[_activeChatId]?.name || 'They';
        showToast(targetName + ' is locked in to focus mode! Your message will be sent when they are out of focus mode.');
      }
    }
  }

  // NPC pushes a message into friend chat
  window._receiveNPCMessage = (npcId, npcName, message) => {
    if (!_friendChats[npcId]) _friendChats[npcId] = [];
    _friendChats[npcId].push({ from: 'them', text: message });
    if (_activeChatId === npcId) {
      _renderFriendChatMessages();
    } else {
      showToast(npcName + ': ' + message.substring(0, 28) + (message.length > 28 ? '…' : ''));
    }
  };

  window._openFriendChatById = (friendId, friendName) => _openFriendChat(friendId, friendName);
  window._renderMembersList = _renderMembersList;

  function showToast(msg) {
    let t = document.getElementById('social-toast');
    if (!t) { t = document.createElement('div'); t.id = 'social-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('toast-hide');
    t.classList.add('toast-show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => { t.classList.remove('toast-show'); t.classList.add('toast-hide'); }, 3500);
  }
  window.showToast = showToast;

  // ── Social DOM event handlers ──────────────────────────────

  document.getElementById('mic-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    if (!window.gameScene) return;
    window.gameScene._isMuted = !window.gameScene._isMuted;
    const btn = document.getElementById('mic-btn');
    btn.textContent = window.gameScene._isMuted ? '🔇' : '🎤';
    btn.classList.toggle('muted', window.gameScene._isMuted);
  });

  document.getElementById('listen-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    if (!window.gameScene) return;
    window.gameScene._isDeaf = !window.gameScene._isDeaf;
    const btn = document.getElementById('listen-btn');
    btn.textContent = window.gameScene._isDeaf ? '🔕' : '🔊';
    btn.classList.toggle('deafened', window.gameScene._isDeaf);
  });

  document.querySelectorAll('.pref-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      SoundManager.play('click');
      document.querySelectorAll('.pref-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const pref = pill.dataset.pref;
      if (window.gameScene) window.gameScene._chatPreference = pref;
      window.socket?.emit('updatePreference', { preference: pref });
    });
  });

  document.getElementById('social-toggle-btn')?.addEventListener('click', () => {
    const body = document.getElementById('social-body');
    const btn  = document.getElementById('social-toggle-btn');
    if (!body) return;
    const collapsed = body.classList.toggle('hidden');
    btn.textContent = collapsed ? '▸' : '▾';
  });

  document.getElementById('chat-text-input')?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') window.gameScene?._sendChat(e.target.value);
    else if (e.key === 'Escape') window.gameScene?._closeChat();
  });

  // ── Friend chat input / close ──────────────────────────────
  document.getElementById('friend-chat-input')?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') _sendFriendChat();
    else if (e.key === 'Escape') {
      document.getElementById('friend-chat-section')?.classList.add('hidden');
      _activeChatId = null;
    }
  });

  document.getElementById('friend-chat-close')?.addEventListener('click', () => {
    document.getElementById('friend-chat-section')?.classList.add('hidden');
    _activeChatId = null;
  });

  // Route incoming socket chat messages to friend chat panel
  window._routeChatToFriendPanel = (fromId, fromName, message) => {
    if (!_friendChats[fromId]) _friendChats[fromId] = [];
    _friendChats[fromId].push({ from: 'them', text: message });
    if (_activeChatId === fromId) _renderFriendChatMessages();
    else showToast(fromName + ': ' + message.substring(0, 28) + (message.length > 28 ? '…' : ''));
  };
})();
