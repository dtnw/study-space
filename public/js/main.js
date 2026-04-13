/**
 * main.js
 * Bootstraps the game:
 *  1. Connects Socket.io
 *  2. Waits for player to enter name + choose gender
 *  3. Initialises PlayerClass, Phaser + TaskManager
 *  4. Wires all DOM events (modals, task buttons, pomodoro controls)
 */

(function () {
  // ── Single-tab enforcement (signed-in users only) ──────────
  const _myTabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const _tabChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cc_game_tab') : null;
  (function _initTabEnforcement() {
    const raw = localStorage.getItem('cc_session');
    if (!raw) return;
    let session; try { session = JSON.parse(raw); } catch(e) { return; }
    if (!session || session.authType === 'guest') return;
    // Claim this tab
    function _claimTab() {
      localStorage.setItem('cc_active_game_tab', JSON.stringify({ tabId: _myTabId, user: session.name, ts: Date.now() }));
      _tabChannel?.postMessage({ type: 'tabOpened', tabId: _myTabId, user: session.name });
    }
    // Show overlay when another tab claims
    function _showTabConflict() {
      let ov = document.getElementById('tab-conflict-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'tab-conflict-overlay';
        ov.className = 'tab-conflict-overlay';
        ov.innerHTML = '<div class="tab-conflict-box"><div class="tab-conflict-icon">🌸</div><p class="tab-conflict-msg">Cozy Corner is open in another window.</p><button id="tab-take-over-btn" class="pixel-btn">Refresh to use this window</button></div>';
        document.body.appendChild(ov);
        document.getElementById('tab-take-over-btn')?.addEventListener('click', () => { _claimTab(); ov.remove(); });
      }
    }
    if (_tabChannel) {
      _tabChannel.onmessage = (e) => {
        if (e.data?.type === 'tabOpened' && e.data.tabId !== _myTabId) _showTabConflict();
      };
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _claimTab(); });
    _claimTab();
  })();

  // ── Shared game state (read by GameScene) ──────────────────
  window.gameState = {
    playerName: '',
    playerId: null,
    status: 'idle',
  };

  // All players currently in the space (excluding self)
  window._allPlayers = {};
  // Server-confirmed taken chair IDs (prevents overlap even with blocked/invisible players)
  window._takenChairs = new Set();
  // Current player's role: 'creator' | 'mod' | 'regular'
  window.myRole = 'regular';

  function _isGuest() { return !window._ccSession || window._ccSession.authType === 'guest'; }
  function _requireAuth(action) {
    if (_isGuest()) {
      showToast('✨ Sign in to ' + action + '!');
      return false;
    }
    return true;
  }

  window.socialState = {
    friends: [],
    requests: [],
    sendFriendRequest(toId, toName) {
      if (_isGuest()) { showToast('✨ Sign in to add friends!'); return; }
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
  window.CallManager?.wireSocketEvents();

  socket.on('spaceStatus', (status) => {
    window._spaceStatus = status;
    window._updateSpacePanel?.(status);
    // Streamer bar
    const bar = document.getElementById('streamer-bar');
    if (bar) {
      if (status.live && status.twitchLogin) {
        const url = 'https://twitch.tv/' + encodeURIComponent(status.twitchLogin);
        const watchBtn = document.getElementById('watch-live-btn');
        const followBtn = document.getElementById('follow-btn');
        const handle = document.getElementById('streamer-bar-handle');
        if (watchBtn) watchBtn.href = url;
        if (followBtn) followBtn.href = url;
        if (handle) handle.textContent = status.twitchLogin;
        bar.classList.remove('hidden');
      } else {
        bar.classList.add('hidden');
      }
    }
  });

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
      if (_blockedIds.some(b => b.id === p.id)) return;
      window._allPlayers[p.id] = { id: p.id, name: p.name, chatPreference: p.chatPreference || 'sociable', role: p.role || 'regular' };
      if (window.gameScene) window.gameScene._spawnOtherPlayer(p);
      else { window._pendingPlayers = window._pendingPlayers || []; window._pendingPlayers.push(p); }
    });
    _renderMembersList();
  });

  socket.on('playerJoined', (p) => {
    if (_blockedIds.some(b => b.id === p.id)) return;
    // If already known (e.g. after unblock), remove old sprite first
    if (window._allPlayers[p.id]) window.gameScene?._removeOtherPlayer(p.id);
    window._allPlayers[p.id] = { id: p.id, name: p.name, chatPreference: p.chatPreference || 'sociable', role: p.role || 'regular' };
    if (window.gameScene) window.gameScene._spawnOtherPlayer(p);
    else { window._pendingPlayers = window._pendingPlayers || []; window._pendingPlayers.push(p); }
    _renderMembersList();
  });

  socket.on('playerMoved', ({ id, x, y }) => {
    if (_blockedIds.some(b => b.id === id)) return;
    window.gameScene?._moveOtherPlayer(id, x, y);
  });

  // Server confirms our spawn position (restored from last session)
  socket.on('spawnAt', ({ x, y }) => {
    window._pendingSpawn = { x, y };
    if (window.gameScene?.player) {
      window.gameScene.player.setPosition(x, y);
    }
  });

  // Save position before the page unloads so we can restore it on refresh
  window.addEventListener('beforeunload', () => {
    const p = window.gameScene?.player;
    if (p) {
      sessionStorage.setItem('studyspace_x', p.x);
      sessionStorage.setItem('studyspace_y', p.y);
    }
  });

  // Guest "don't lose progress" overlay — shown once per hour on tab-hide
  const _SAVE_PROMPT_MS = 60 * 60 * 1000; // 1 hour
  function _showGuestSaveOverlay() {
    document.getElementById('guest-save-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'guest-save-overlay';
    ov.className = 'guest-save-overlay';
    ov.innerHTML = `
      <div class="guest-save-box">
        <button class="guest-save-close-btn" id="guest-save-close-btn" title="Close">✕</button>
        <div style="font-size:24px;margin-bottom:8px">🪙</div>
        <h2 style="font-size:10px;margin-bottom:8px">DON'T LOSE YOUR PROGRESS!</h2>
        <p style="font-size:7px;color:#aaa;line-height:2;margin-bottom:16px">Sign in to save your coins, tasks &amp; progress.</p>
        <a href="/auth/twitch?role=player" class="pixel-btn" style="display:block;margin-bottom:8px;background:#9146FF;color:#fff;text-align:center;padding:10px;text-decoration:none">🟣 Save with Twitch</a>
        <a href="/auth/google" class="pixel-btn" style="display:block;margin-bottom:12px;background:#4285F4;color:#fff;text-align:center;padding:10px;text-decoration:none">🔵 Save with Google</a>
        <button id="guest-save-skip-btn" class="pixel-btn small" style="background:none;border:1px solid #333;color:#888;font-family:var(--font);font-size:7px;cursor:pointer;width:100%;padding:8px">Continue as guest</button>
      </div>`;
    document.body.appendChild(ov);
    function _closeOverlay() {
      ov.remove();
      document.removeEventListener('keydown', _escHandler);
    }
    function _escHandler(e) { if (e.key === 'Escape') _closeOverlay(); }
    document.getElementById('guest-save-close-btn')?.addEventListener('click', _closeOverlay);
    document.getElementById('guest-save-skip-btn')?.addEventListener('click',  _closeOverlay);
    ov.addEventListener('click', (e) => { if (e.target === ov) _closeOverlay(); });
    document.addEventListener('keydown', _escHandler);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!_isGuest()) return;
    if (!sessionStorage.getItem('studyspace_name')) return;
    // Only show once per hour
    const last = parseInt(sessionStorage.getItem('cc_save_prompt_ts') || '0', 10);
    if (Date.now() - last < _SAVE_PROMPT_MS) return;
    sessionStorage.setItem('cc_save_prompt_ts', String(Date.now()));
    _showGuestSaveOverlay();
  });

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
    // If this player's chat is currently open, refresh overlay state
    if (_activeChatId === id) _renderFriendChatMessages();
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
    // If this person's chat is open, re-evaluate the blocked overlay immediately
    if (typeof _activeChatId !== 'undefined' && _activeChatId === id) _renderFriendChatMessages();
    showToast(name + ' is now your friend! 🎉');
  });

  socket.on('friendWentOffline', ({ id }) => {
    const f = window.socialState.friends.find(f => f.id === id);
    if (f) { f.online = false; _renderMembersList(); }
  });

  socket.on('friendRemoved', ({ id }) => {
    window.socialState.friends = window.socialState.friends.filter(f => f.id !== id);
    _renderMembersList();
  });

  // Mutual block: the other player blocked us — hide them
  socket.on('youWereBlocked', ({ by }) => {
    delete window._allPlayers[by];
    window.gameScene?._removeOtherPlayer(by);
    window.socialState.friends = window.socialState.friends.filter(f => f.id !== by);
    _renderMembersList();
  });

  // ── Role events ───────────────────────────────────────────
  socket.on('yourRole', ({ role }) => {
    window.myRole = role;
    // Show/hide privileged UI
    document.getElementById('clear-tasks-btn')?.classList.toggle('hidden', role === 'regular');
    if (role !== 'regular') window.socket?.emit('getBannedList');
    window._refreshSpacesPanel?.();
    document.getElementById('diy-creator-toggle')?.classList.toggle('hidden', role !== 'creator');
  });

  socket.on('playerRoleUpdated', ({ id, role }) => {
    if (window._allPlayers[id]) window._allPlayers[id].role = role;
    _renderMembersList();
  });

  socket.on('playerStatusIconUpdated', ({ id, type }) => {
    if (window._allPlayers[id]) window._allPlayers[id].statusIcon = type;
    window.gameScene?._setOtherStatusIcon(id, type);
  });

  // ── Kicked / banned ────────────────────────────────────
  socket.on('kicked', ({ reason }) => {
    sessionStorage.clear();
    alert(reason || 'You have been removed from this space.');
    window.location.reload();
  });

  // ── Banned list ────────────────────────────────────────
  socket.on('bannedListUpdated', ({ bannedList }) => {
    _renderBannedList(bannedList);
  });

  // ── allTasksCleared ────────────────────────────────────
  socket.on('allTasksCleared', () => {
    window.TaskManager?.onAllTasksCleared?.();
  });

  // Chair occupancy events from server
  socket.on('chairTaken', ({ chairId }) => { window._takenChairs.add(chairId); });
  socket.on('chairFreed', ({ chairId }) => { window._takenChairs.delete(chairId); });
  // Server rejected sit — auto-seat at nearest free sibling chair (same table)
  socket.on('sitRejected', ({ chairId }) => {
    window.gameScene?._tryAlternateSeat(chairId);
  });

  socket.on('chatMessage', ({ fromId, fromName, message, isSelf }) => {
    if (window.gameScene?._isDeaf) return;
    if (isSelf) {
      // Show own sent message in our chat panel under the nearest other player
      const nearestId = window.gameScene?._nearestOther?.data?.id;
      if (nearestId) window._routeChatToPanel?.(nearestId, fromName, message, true);
      return;
    }
    window._routeChatToPanel?.(fromId, fromName, message, false);
  });

  // ── Gender toggle ──────────────────────────────────────────
  let _selectedGender = 'male';

  // ── Read auth session from localStorage ────────────────────
  window._suppressAutoJoin = false;
  (function _initSessionFromStorage() {
    const raw = localStorage.getItem('cc_session');
    if (!raw) return;
    let session;
    try { session = JSON.parse(raw); } catch(e) { localStorage.removeItem('cc_session'); return; }
    if (!session || Date.now() > (session.expiresAt || 0)) { localStorage.removeItem('cc_session'); return; }
    window._ccSession = session;
    if (session.authType === 'guest') {
      // Guest whose name was collected on the landing page — pre-fill and auto-join
      if (session.name) {
        const nameInputEl = document.getElementById('name-input');
        if (nameInputEl) nameInputEl.value = session.name;
        sessionStorage.setItem('studyspace_name', session.name);
        // Restore avatar choices picked on the landing page
        if (session.gender)     sessionStorage.setItem('studyspace_gender',     session.gender);
        if (session.shirtColor) sessionStorage.setItem('studyspace_shirtColor', session.shirtColor);
        // Hide the modal immediately so there's no flash before auto-join fires
        const _nm = document.getElementById('name-modal');
        _nm?.classList.add('hidden');
        _nm?.classList.remove('active');
      }
      return;
    }
    // Pre-fill identity for OAuth users
    const nameInputEl = document.getElementById('name-input');
    if (nameInputEl && session.name) { nameInputEl.value = session.name; window._suppressAutoJoin = true; }
    sessionStorage.setItem('studyspace_name', session.name || '');
    // Show Twitch/Google welcome state
    document.getElementById('nm-guest-state')?.classList.add('hidden');
    const ts = document.getElementById('nm-twitch-state');
    if (ts) ts.classList.remove('hidden');
    const wt = document.getElementById('nm-welcome-text');
    if (wt) wt.textContent = 'WELCOME BACK!';
    const th = document.getElementById('nm-twitch-handle');
    if (th) {
      th.textContent = session.twitchLogin ? '@' + session.twitchLogin
        : session.googleEmail ? session.googleEmail
        : session.name;
    }
    const av = document.getElementById('nm-avatar');
    if (av && session.profilePic) { av.src = session.profilePic; av.style.display = 'block'; }
  })();

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
      const errEl = document.getElementById('name-error');
      if (errEl) errEl.textContent = 'Please enter a name!';
      nameInput.classList.remove('shake');
      void nameInput.offsetWidth;
      nameInput.classList.add('shake');
      nameInput.focus();
      return;
    }
    const errEl = document.getElementById('name-error');
    if (errEl) errEl.textContent = '';

    // Persist join info so refresh auto-rejoins
    sessionStorage.setItem('studyspace_name',        name);
    sessionStorage.setItem('studyspace_gender',      _selectedGender);
    sessionStorage.setItem('studyspace_shirtColor',  _selectedShirtColor);

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

    window.PlayerClass.init(name, _selectedGender);

    if (window.PixelSprites) {
      window.PixelSprites.setShirtColor(_selectedShirtColor);
    }

    window.TaskManager.init(window._clientId, name);

    // Restore last known position if available
    const savedX = parseFloat(sessionStorage.getItem('studyspace_x') || '');
    const savedY = parseFloat(sessionStorage.getItem('studyspace_y') || '');
    const startX = isFinite(savedX) ? savedX : undefined;
    const startY = isFinite(savedY) ? savedY : undefined;

    socket.emit('playerJoin', { name, gender: _selectedGender, shirtColor: _selectedShirtColor, clientId: window._clientId, startX, startY });

    nameModal.classList.remove('active');
    nameModal.classList.add('hidden');

    startPhaser();
    // Restore timer if it was running before the refresh
    window.PomodoroManager?.restore();
    // Defer blocked list render — _blockedIds is declared later in the IIFE
    setTimeout(() => _renderBlockedList(), 0);
  }

  joinBtn.addEventListener('click', () => { SoundManager.play('click'); joinGame(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

  // ── Auto-rejoin on refresh ─────────────────────────────────
  const savedName  = sessionStorage.getItem('studyspace_name');
  const savedGender = sessionStorage.getItem('studyspace_gender');
  const savedColor  = sessionStorage.getItem('studyspace_shirtColor');
  if (savedName && !window._suppressAutoJoin) {
    // Restore UI selections silently, then join without showing modal
    nameInput.value = savedName;
    if (savedGender) {
      _selectedGender = savedGender;
      document.getElementById('gender-boy-btn')?.classList.toggle('active', savedGender === 'male');
      document.getElementById('gender-girl-btn')?.classList.toggle('active', savedGender === 'female');
    }
    if (savedColor) {
      _selectedShirtColor = savedColor;
      document.querySelectorAll('.shirt-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === savedColor);
      });
    }
    joinGame();
  } else {
    nameInput.focus();
  }

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

  // ── Logout ─────────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (!confirm('Log out and return to the welcome screen?')) return;
    window.socket?.disconnect();
    sessionStorage.clear();
    localStorage.removeItem('cc_session');
    window.location.reload();
  });

  // ── Clear all shared tasks (creator/mod) ────────────────────
  document.getElementById('clear-tasks-btn')?.addEventListener('click', () => {
    if (!confirm('Clear ALL shared tasks? This cannot be undone.')) return;
    window.socket?.emit('clearAllTasks');
  });

  // ── Pomodoro modal ─────────────────────────────────────────
  document.getElementById('start-pomo-btn').addEventListener('click', () => {
    try { SoundManager.play('click'); } catch(e) {}
    const focusMin    = parseInt(document.getElementById('focus-input').value, 10) || 0;
    const breakMin    = parseInt(document.getElementById('break-input').value, 10) || 0;
    const autoNext    = document.getElementById('auto-next-cb').checked;
    const pomosTarget = parseInt(document.getElementById('pomo-target-input').value, 10) || 1;
    hidePomodoroModal();
    window.PomodoroManager.start(focusMin, breakMin, autoNext, pomosTarget);
  });

  document.getElementById('skip-pomo-btn').addEventListener('click', () => {
    try { SoundManager.play('click'); } catch(e) {}
    hidePomodoroModal();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● AT DESK'; si.className = 'status-idle'; }
    if (window.gameScene) window.gameScene.setStatusIcon(null);
  });

  // X button: stay seated without starting timer
  document.getElementById('close-pomo-modal-btn').addEventListener('click', () => {
    try { SoundManager.play('click'); } catch(e) {}
    hidePomodoroModal();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● AT DESK'; si.className = 'status-idle'; }
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
  const _unread = {};   // unread message counts per player id
  let _activeChatId = null;

  // ── Blocked players (client-side) ─────────────────────────
  // Stored as Array<{id, name}> so we can show names in the blocked list
  function _loadBlocked() {
    try {
      const raw = JSON.parse(sessionStorage.getItem('studyspace_blocked') || '[]');
      // Upgrade from old format (array of id strings) to {id,name} objects
      return raw.map(item => (typeof item === 'string' ? { id: item, name: item } : item));
    } catch { return []; }
  }
  function _saveBlocked() {
    try { sessionStorage.setItem('studyspace_blocked', JSON.stringify(_blockedIds)); } catch {}
  }
  const _blockedIds = _loadBlocked(); // Array<{id:string, name:string}>

  function _blockPlayer(id, name) {
    if (!_blockedIds.some(b => b.id === id)) {
      _blockedIds.push({ id, name });
      _saveBlocked();
    }
    window.socket?.emit('blockPlayer', { targetId: id });
    delete window._allPlayers[id];
    window.gameScene?._removeOtherPlayer(id);
    if (_activeChatId === id) {
      document.getElementById('friend-chat-section')?.classList.add('hidden');
      _activeChatId = null;
    }
    _renderMembersList();
    _renderBlockedList();
    showToast(name + ' has been blocked.');
  }

  window._unblockPlayer = (id) => {
    const entry = _blockedIds.find(b => b.id === id);
    if (!entry) return;
    _blockedIds.splice(_blockedIds.indexOf(entry), 1);
    _saveBlocked();
    // Tell server so both sides can see each other again
    window.socket?.emit('unblockPlayer', { targetId: id });
    _renderBlockedList();
    showToast(entry.name + ' has been unblocked.');
  };

  // ── Member action menu ───────────��──────────────────────────
  let _openMenuId = null;

  window._memberMenuToggle = (id, name, isFriend, pref, targetRole) => {
    if (_openMenuId === id) { _closeMenu(); return; }
    _closeMenu();
    _openMenuId = id;
    const li = document.querySelector('.member-item[data-id="' + id + '"]');
    if (!li) return;
    const menu = document.createElement('div');
    menu.className = 'member-menu';
    menu.id = 'member-menu-' + id;
    const si = escHtml(id), sn = escHtml(name);
    const canBan = (window.myRole === 'creator' || window.myRole === 'mod') && targetRole !== 'creator';
    let html = '';
    if (isFriend) {
      html += '<button onclick="window._memberMenuAction(\'removefriend\',\'' + si + '\',\'' + sn + '\')">✕ Remove Friend</button>';
    } else if (pref !== 'private' && pref !== 'lockedin') {
      html += '<button onclick="window._memberMenuAction(\'addfriend\',\'' + si + '\',\'' + sn + '\',\'' + pref + '\')">+ Add Friend</button>';
    }
    html += '<button onclick="window._memberMenuAction(\'block\',\'' + si + '\',\'' + sn + '\')">🚫 Block</button>';
    html += '<button onclick="window._memberMenuAction(\'report\',\'' + si + '\',\'' + sn + '\')">🚩 Report</button>';
    if (canBan) {
      html += '<button class="danger-text" onclick="window._memberMenuAction(\'ban\',\'' + si + '\',\'' + sn + '\')">🔨 Ban</button>';
    }
    if (window.myRole === 'creator') {
      if (targetRole === 'mod') {
        html += '<button onclick="window._memberMenuAction(\'removemod\',\'' + si + '\',\'' + sn + '\')">Remove Mod</button>';
      } else if (targetRole !== 'creator') {
        html += '<button onclick="window._memberMenuAction(\'appointmod\',\'' + si + '\',\'' + sn + '\')">🛡 Make Mod</button>';
      }
    }
    menu.innerHTML = html;
    li.appendChild(menu);
    setTimeout(() => document.addEventListener('click', _onOutsideMenuClick), 0);
  };

  function _onOutsideMenuClick(e) {
    if (!e.target.closest('.member-menu') && !e.target.closest('.member-more-btn')) _closeMenu();
  }
  function _closeMenu() {
    if (_openMenuId) {
      document.getElementById('member-menu-' + _openMenuId)?.remove();
      _openMenuId = null;
      document.removeEventListener('click', _onOutsideMenuClick);
    }
  }

  window._memberMenuAction = (action, id, name, pref) => {
    _closeMenu();
    if (action === 'removefriend') {
      window.socialState.friends = window.socialState.friends.filter(f => f.id !== id);
      window.socket?.emit('removeFriend', { friendId: id });
      _renderMembersList();
      showToast('Removed ' + name + ' as a friend.');
    } else if (action === 'block') {
      _blockPlayer(id, name);
      window.socialState.friends = window.socialState.friends.filter(f => f.id !== id);
      window.socket?.emit('removeFriend', { friendId: id });
    } else if (action === 'report') {
      showToast('🚩 Report submitted for ' + name + '. Thank you for keeping the space safe!');
    } else if (action === 'addfriend') {
      window._memberAddFriend(id, name, pref);
    } else if (action === 'ban') {
      if (confirm('Ban ' + name + '? They will be kicked and cannot rejoin.')) {
        window.socket?.emit('banPlayer', { targetId: id });
        showToast('🔨 ' + name + ' has been banned.');
      }
    } else if (action === 'appointmod') {
      window.socket?.emit('appointMod', { targetId: id });
      showToast('🛡 ' + name + ' is now a mod.');
    } else if (action === 'removemod') {
      window.socket?.emit('removeMod', { targetId: id });
      showToast(name + ' is no longer a mod.');
    }
  };

  function _renderMembersList() {
    const list = document.getElementById('members-list');
    const countEl = document.getElementById('members-online-count');
    if (!list) return;
    const allPlayers = Object.values(window._allPlayers || {}).filter(p => !_blockedIds.some(b => b.id === p.id));
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
      const role = p.role || 'regular';
      const isFriend = friendIds.has(p.id);
      const safeId   = escHtml(p.id);
      const safeName = escHtml(p.name);
      const unreadCount = _unread[p.id] || 0;
      const unreadBadge = unreadCount > 0
        ? '<span class="member-unread">' + (unreadCount > 9 ? '9+' : unreadCount) + '</span>'
        : '';
      const roleBadge = role === 'creator'
        ? '<span class="role-badge-creator">👑 OWNER</span>'
        : role === 'mod'
          ? '<span class="role-badge-mod">🛡 MOD</span>'
          : '';
      const canChat = isFriend || pref === 'sociable';
      const chatBtn = canChat
        ? '<button class="member-chat-btn" title="Open chat" onclick="window._openFriendChatById(\'' + safeId + '\',\'' + safeName + '\')">💬</button>'
        : '<button class="member-add-btn" title="Add friend" onclick="window._memberAddFriend(\'' + safeId + '\',\'' + safeName + '\',\'' + pref + '\')">+</button>';
      const moreBtn = '<button class="member-more-btn" title="More options" onclick="window._memberMenuToggle(\'' + safeId + '\',\'' + safeName + '\',' + isFriend + ',\'' + pref + '\',\'' + role + '\')">⋮</button>';
      const callTitle = window.CallManager?.isInCall() ? 'Invite to call' : 'Call';
      const callBtn = '<button class="member-call-btn" title="' + callTitle + '" onclick="window.CallManager?.startCall(\'' + safeId + '\',\'' + safeName + '\')">📞</button>';
      return '<li class="member-item' + (isFriend ? ' member-is-friend' : '') + '" data-id="' + safeId + '">' +
        '<span class="member-dot ' + pref + '"></span>' +
        roleBadge +
        (isFriend && !roleBadge ? '<span class="member-friend-badge">FRIEND</span>' : '') +
        '<span class="member-name">' + safeName + '</span>' +
        unreadBadge +
        callBtn +
        chatBtn +
        moreBtn +
      '</li>';
    }).join('');
    // Also refresh the offline friends + blocked sections
    _renderOfflineFriends();
    _renderBlockedList();
  }

  window._memberAddFriend = (id, name, pref) => {
    if (pref === 'lockedin') {
      showToast(name + ' is currently locked in to focus! You can add them as a friend when they are out of focus mode.');
      return;
    }
    window.socialState?.sendFriendRequest?.(id, name);
  };

  function _renderFriendsList() {
    // Friends are shown inside the members list
    _renderOfflineFriends();
  }

  function _renderOfflineFriends() {
    const section = document.getElementById('offline-friends-section');
    const list    = document.getElementById('offline-friends-list');
    if (!section || !list) return;
    const onlineIds = new Set(Object.keys(window._allPlayers || {}));
    const offlineFriends = (window.socialState.friends || []).filter(f =>
      !onlineIds.has(f.id) && !f.id.startsWith('npc-')
    );
    section.classList.toggle('hidden', offlineFriends.length === 0);
    list.innerHTML = offlineFriends.map(f =>
      '<li class="offline-friend-item">' +
        '<span class="offline-dot"></span>' +
        '<span class="offline-friend-name">' + escHtml(f.name) + '</span>' +
        '<span class="offline-space-label">Derby\'s Space</span>' +
      '</li>'
    ).join('');
  }

  function _renderBlockedList() {
    const section  = document.getElementById('blocked-section');
    const list     = document.getElementById('blocked-list');
    const countEl  = document.querySelector('#blocked-section .blocked-count');
    if (!section || !list) return;
    section.classList.toggle('hidden', _blockedIds.length === 0);
    if (countEl) countEl.textContent = _blockedIds.length > 0 ? '(' + _blockedIds.length + ')' : '';
    list.innerHTML = _blockedIds.map(b =>
      '<li class="blocked-item">' +
        '<span class="blocked-name">🚫 ' + escHtml(b.name) + '</span>' +
        '<button class="pixel-btn small unblock-btn" onclick="window._unblockPlayer(\'' + escHtml(b.id) + '\')">Unblock</button>' +
      '</li>'
    ).join('');
  }

  function _renderBannedList(bannedList) {
    const section = document.getElementById('banned-section');
    const list    = document.getElementById('banned-list');
    const countEl = document.querySelector('#banned-section .banned-count');
    if (!section || !list) return;
    const isPrivileged = window.myRole === 'creator' || window.myRole === 'mod';
    section.classList.toggle('hidden', !isPrivileged || !bannedList || bannedList.length === 0);
    if (countEl) countEl.textContent = bannedList?.length > 0 ? '(' + bannedList.length + ')' : '';
    if (!bannedList) return;
    list.innerHTML = bannedList.map(b =>
      '<li class="banned-item">' +
        '<span class="banned-name">🔨 ' + escHtml(b.name) + '</span>' +
        (window.myRole === 'creator'
          ? '<button class="pixel-btn small unban-btn" onclick="window._unbanPlayer(\'' + escHtml(b.clientId) + '\')">Unban</button>'
          : '') +
      '</li>'
    ).join('');
  }

  window._unbanPlayer = (clientId) => {
    window.socket?.emit('unbanPlayer', { clientId });
  };

  window._renderOfflineFriends = _renderOfflineFriends;
  window._renderBlockedList    = _renderBlockedList;
  window._renderBannedList     = _renderBannedList;

  // ── Spaces panel functions ─────────────────────────────────
  function _updateSpacePanel(status) {
    window._spaceStatus = status;
    // live dot
    const dot = document.getElementById('space-live-dot');
    if (dot) { dot.className = 'space-dot ' + (status.live ? 'live' : 'offline'); }
    // viewer count
    const vc = document.getElementById('space-viewer-count');
    if (vc) { vc.textContent = status.live ? '👁 ' + status.viewerCount : ''; vc.classList.toggle('hidden', !status.live); }
    // stream info
    const info = document.getElementById('space-stream-info');
    const title = document.getElementById('space-stream-title');
    const game  = document.getElementById('space-game-name');
    if (info) { info.classList.toggle('hidden', !status.live || !status.streamTitle); }
    if (title && status.streamTitle) title.textContent = status.streamTitle;
    if (game  && status.gameName)   game.textContent  = '🎮 ' + status.gameName;
    // watch link
    const link = document.getElementById('space-twitch-link');
    if (link) {
      link.classList.toggle('hidden', !status.twitchLogin);
      if (status.twitchLogin) link.href = 'https://twitch.tv/' + status.twitchLogin;
    }
    // live status dot in header (show small live indicator next to logo)
    let liveBadge = document.getElementById('header-live-badge');
    if (status.live) {
      if (!liveBadge) {
        liveBadge = document.createElement('span');
        liveBadge.id = 'header-live-badge';
        liveBadge.className = 'header-live-badge';
        liveBadge.textContent = '🔴 LIVE';
        document.getElementById('header-left')?.appendChild(liveBadge);
      }
    } else {
      liveBadge?.remove();
    }
  }
  window._updateSpacePanel = _updateSpacePanel;

  function _refreshSpacesPanel() {
    fetch('/api/twitch/config').then(r => r.json()).then(cfg => {
      // Show twitch connect section only to creator
      const section = document.getElementById('twitch-connect-section');
      if (section) section.classList.toggle('hidden', window.myRole !== 'creator');
      const connectedInfo = document.getElementById('twitch-connected-info');
      const notConnected  = document.getElementById('twitch-not-connected');
      const connectedName = document.getElementById('twitch-connected-name');
      if (cfg.connected) {
        connectedInfo?.classList.remove('hidden');
        notConnected?.classList.add('hidden');
        if (connectedName) connectedName.textContent = cfg.twitchUser || '';
      } else {
        connectedInfo?.classList.add('hidden');
        notConnected?.classList.remove('hidden');
      }
      // Show "connect" only if clientId is configured
      const connectLink = document.querySelector('.twitch-connect-btn');
      if (connectLink) connectLink.style.display = cfg.configured ? '' : 'none';
      const hint = document.querySelector('.twitch-hint');
      if (hint) hint.textContent = cfg.configured ? 'Connect Twitch to show live status' : 'Set up data/twitch-config.json first';
    }).catch(() => {});
    if (window._spaceStatus) _updateSpacePanel(window._spaceStatus);
  }
  window._refreshSpacesPanel = _refreshSpacesPanel;

  // ── Call invite populate ───────────────────────────────────
  function _populateCallInviteDropdown() {
    const dd = document.getElementById('call-invite-dropdown');
    if (!dd) return;
    const peerIds = new Set(window.CallManager?.getPeerIds() || []);
    const available = Object.values(window._allPlayers || {}).filter(p => !peerIds.has(p.id));
    if (available.length === 0) {
      dd.innerHTML = '<div class="call-invite-empty">No one else online</div>';
      return;
    }
    dd.innerHTML = available.map(p =>
      '<div class="call-invite-item" onclick="window.CallManager?.startCall(\'' + escHtml(p.id) + '\',\'' + escHtml(p.name) + '\'); document.getElementById(\'call-invite-dropdown\')?.classList.add(\'hidden\')">' +
      '<span class="call-invite-item-name">' + escHtml(p.name) + '</span>' +
      '<span class="pixel-btn small" style="font-size:6px;pointer-events:none">Invite</span>' +
      '</div>'
    ).join('');
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

  function _chatTargetStatus(id) {
    // Returns 'ok' | 'private' | 'lockedin-info'
    // 'lockedin-info' = show a soft banner but input still enabled
    if (!id || id.startsWith('npc-')) return 'ok';
    const pref = window._allPlayers[id]?.chatPreference;
    if (pref === 'lockedin') return 'lockedin-info';
    const isFriend = window.socialState.friends.some(f => f.id === id);
    if (pref === 'private' && !isFriend) return 'private';
    return 'ok';
  }

  function _openFriendChat(friendId, friendName) {
    const status = _chatTargetStatus(friendId);
    if (status === 'private') {
      showToast(friendName + ' is private! Add them as a friend to chat.');
      return;
    }
    _activeChatId = friendId;
    delete _unread[friendId];
    if (!_friendChats[friendId]) _friendChats[friendId] = [];
    const section = document.getElementById('friend-chat-section');
    const nameEl  = document.getElementById('friend-chat-name');
    if (section) section.classList.remove('hidden');
    if (nameEl)  nameEl.textContent = friendName;
    _renderFriendChatMessages();
    _renderMembersList();
    document.getElementById('friend-chat-input')?.focus();
  }

  function _renderFriendChatMessages() {
    const el      = document.getElementById('friend-chat-messages');
    const input   = document.getElementById('friend-chat-input');
    const overlay = document.getElementById('chat-blocked-overlay');
    if (!el || !_activeChatId) return;

    const status = _chatTargetStatus(_activeChatId);
    const targetName = escHtml(window._allPlayers[_activeChatId]?.name || '');

    // Show/hide blocked overlay
    if (overlay) {
      if (status === 'lockedin-info') {
        overlay.className = 'chat-blocked-overlay chat-locked-info';
        overlay.innerHTML = '⏳ <strong>' + targetName + '</strong> is in focus mode — your messages will be delivered when they\'re back!';
        overlay.classList.remove('hidden');
      } else if (status === 'private') {
        overlay.className = 'chat-blocked-overlay';
        overlay.innerHTML = '🔒 <strong>' + targetName + '</strong> is set to private.<br/>Add them as a friend to chat.';
        overlay.classList.remove('hidden');
      } else {
        overlay.className = 'chat-blocked-overlay hidden';
      }
    }
    if (input) {
      // Only hard-disable for private. Locked-in just shows a soft banner.
      input.disabled = status === 'private';
      input.placeholder = status === 'private' ? 'Chat disabled — private mode' : 'Message…';
    }

    const msgs = _friendChats[_activeChatId] || [];
    el.innerHTML = msgs.map(m =>
      '<div class="chat-msg ' + (m.from === 'me' ? 'chat-msg-me' : 'chat-msg-them') + '">' +
        escHtml(m.text) +
      '</div>'
    ).join('');
    el.scrollTop = el.scrollHeight;
  }

  function _sendFriendChat() {
    if (_isGuest()) { showToast('✨ Sign in to send messages!'); return; }
    const input = document.getElementById('friend-chat-input');
    if (!input || !_activeChatId || input.disabled) return;
    const text = input.value.trim();
    if (!text) return;

    // Blocked by private mode → input is already disabled above
    // Locked-in → allowed; server queues and delivers later
    if (!_friendChats[_activeChatId]) _friendChats[_activeChatId] = [];
    _friendChats[_activeChatId].push({ from: 'me', text });
    input.value = '';
    _renderFriendChatMessages();
    if (!_activeChatId.startsWith('npc-')) {
      window.socket?.emit('directMessage', { toId: _activeChatId, message: text });
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
    window.CallManager?.toggleMute();
  });

  document.getElementById('listen-btn')?.addEventListener('click', () => {
    SoundManager.play('click'); // play click before muting
    if (!window.gameScene) return;
    window.gameScene._isDeaf = !window.gameScene._isDeaf;
    const deaf = window.gameScene._isDeaf;
    const btn = document.getElementById('listen-btn');
    btn.textContent = deaf ? '🔕' : '🔊';
    btn.title = deaf ? 'Undeafen' : 'Deafen';
    btn.classList.toggle('deafened', deaf);
    // Silence all game audio (sounds + call streams)
    SoundManager.setDeafened(deaf);
    window.CallManager?.setDeafened(deaf);
  });

  // ── Call panel UI wiring ───────────────────────────────────
  document.getElementById('call-accept-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const el = document.getElementById('incoming-call');
    if (!el) return;
    window.CallManager?.acceptCall(el.dataset.callId);
  });

  document.getElementById('call-decline-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const el = document.getElementById('incoming-call');
    if (!el) return;
    window.CallManager?.declineCall(el.dataset.callId);
  });

  document.getElementById('call-mute-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.CallManager?.toggleMute();
  });

  document.getElementById('call-video-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.CallManager?.toggleVideo();
  });

  document.getElementById('call-leave-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    window.CallManager?.leaveCall();
  });

  // ── Spaces panel ───────────────────────────────────────────
  document.getElementById('spaces-btn')?.addEventListener('click', () => {
    SoundManager.play('click');
    const panel = document.getElementById('spaces-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) window._refreshSpacesPanel?.();
  });
  document.getElementById('spaces-panel-close')?.addEventListener('click', () => {
    document.getElementById('spaces-panel')?.classList.add('hidden');
  });
  document.getElementById('space-copy-link-btn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(location.origin).then(() => showToast('🔗 Link copied!'));
  });
  document.getElementById('twitch-disconnect-btn')?.addEventListener('click', () => {
    fetch('/auth/twitch/disconnect', { method: 'POST' })
      .then(() => { showToast('Twitch disconnected'); window._refreshSpacesPanel?.(); });
  });

  // ── Call invite dropdown ────────────────────────────────────
  document.getElementById('call-invite-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    SoundManager.play('click');
    const dd = document.getElementById('call-invite-dropdown');
    if (!dd) return;
    const hidden = dd.classList.toggle('hidden');
    if (!hidden) _populateCallInviteDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#call-invite-section')) {
      document.getElementById('call-invite-dropdown')?.classList.add('hidden');
    }
  });

  // Handle Twitch OAuth redirect params
  const _urlParams = new URLSearchParams(location.search);
  if (_urlParams.has('twitch')) {
    const twitchResult = _urlParams.get('twitch');
    if (twitchResult === 'connected') showToast('🟣 Twitch connected successfully!');
    else if (twitchResult === 'error') showToast('❌ Twitch connection failed. Check your config.');
    // Clean URL
    history.replaceState({}, '', '/play');
  }

  function _setLockedInOverlay(on) {
    const overlay  = document.getElementById('lockedin-overlay');
    const chatSect = document.getElementById('friend-chat-section');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !on);
    // Also close open chat panel — locked-in players can't read chats
    if (on && chatSect) { chatSect.classList.add('hidden'); }
  }

  document.querySelectorAll('.pref-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      SoundManager.play('click');
      document.querySelectorAll('.pref-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const pref = pill.dataset.pref;
      if (window.gameScene) window.gameScene._chatPreference = pref;
      window.socket?.emit('updatePreference', { preference: pref });
      _setLockedInOverlay(pref === 'lockedin');
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

  // Route incoming chat messages to the panel (proximity or DM)
  window._routeChatToPanel = (fromId, fromName, message, isSelf) => {
    if (!_friendChats[fromId]) _friendChats[fromId] = [];
    _friendChats[fromId].push({ from: isSelf ? 'me' : 'them', text: message, name: fromName });
    if (_activeChatId === fromId) {
      _renderFriendChatMessages();
    } else {
      if (!isSelf) {
        _unread[fromId] = (_unread[fromId] || 0) + 1;
        _renderMembersList();
        // Toast notification so it's visible even with the panel closed
        const preview = message.length > 40 ? message.slice(0, 40) + '…' : message;
        showToast('💬 ' + escHtml(fromName) + ': ' + escHtml(preview));
      }
    }
  };
  // Keep old name for any legacy callers
  window._routeChatToFriendPanel = (fromId, fromName, message) => window._routeChatToPanel(fromId, fromName, message, false);

  // Clicking the game canvas blurs the chat input so movement keys work immediately
  document.getElementById('game-container')?.addEventListener('pointerdown', () => {
    const ae = document.activeElement;
    if (ae && (ae.id === 'friend-chat-input' || ae.id === 'chat-text-input')) ae.blur();
  });
})();
