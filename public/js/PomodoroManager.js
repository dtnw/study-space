/**
 * PomodoroManager.js
 * Focus / break countdown with pause, resume, stop, auto-next, coin rewards,
 * multi-round support, and stop-confirmation modal.
 */

(function () {
  let _intervalId   = null;
  let _secondsLeft  = 0;
  let _isBreak      = false;
  let _focusSec     = 0;
  let _breakSec     = 0;
  let _isPaused     = false;
  let _pomosTarget  = 1;     // how many pomos to do
  let _pomosLeft    = 0;     // remaining pomos in this run
  let _autoNext     = false;
  let _focusMinutes = 25;    // stored for coin calc

  let _pendingStopCallback = null;
  let _pendingSkipCallback = null;
  let _currentPomoNum = 0;   // which pomo number is currently active (1-based)

  const SS_KEY = 'studyspace_timer';

  function _saveState() {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({
        secondsLeft:    _secondsLeft,
        isBreak:        _isBreak,
        focusSec:       _focusSec,
        breakSec:       _breakSec,
        isPaused:       _isPaused,
        pomosTarget:    _pomosTarget,
        pomosLeft:      _pomosLeft,
        autoNext:       _autoNext,
        focusMinutes:   _focusMinutes,
        currentPomoNum: _currentPomoNum,
        running:        _intervalId !== null && !_isPaused,
        savedAt:        Date.now(),
      }));
    } catch (e) {}
  }

  function _clearSavedState() {
    try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
  }

  const timerBar   = () => document.getElementById('timer-bar');
  const modeLabel  = () => document.getElementById('timer-mode-label');
  const countdown  = () => document.getElementById('timer-countdown');
  const statusEl   = () => document.getElementById('status-indicator');
  const pauseBtn   = () => document.getElementById('pause-pomo-btn');
  const resumeBtn  = () => document.getElementById('resume-pomo-btn');

  function fmt(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function _setDefault() {
    // Return timer bar to default TIMER 00:00 state
    if (modeLabel()) modeLabel().textContent = 'TIMER';
    if (countdown()) countdown().textContent = '00:00';
    const tb = timerBar();
    if (tb) tb.classList.remove('break-mode', 'paused-mode');
    if (statusEl()) { statusEl().textContent = '● IDLE'; statusEl().className = 'status-idle'; }
    _isPaused = false;
    _updatePauseResumeButtons();
    if (window.gameScene) window.gameScene.setStatusIcon(null);
    _updatePomoCounter(false); // hide counter when idle
  }

  // ── Pomo counter display ─────────────────────────────────────────────────
  function _updatePomoCounter(show) {
    const tomato  = document.getElementById('pomo-tomato');
    const counter = document.getElementById('pomo-counter');
    if (!tomato || !counter) return;
    if (!show || _pomosTarget < 1) {
      tomato.classList.add('hidden');
      counter.classList.add('hidden');
      return;
    }
    tomato.classList.remove('hidden');
    counter.classList.remove('hidden');
    counter.textContent = `[${_currentPomoNum}/${_pomosTarget}]`;
  }

  // ── Big confetti burst for ALL DONE celebration ──────────────────────────
  function _bigConfetti() {
    let canvas = document.getElementById('confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti-canvas';
      canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;width:100%;height:100%';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#9B6BDB','#D06080','#7890D0','#60A870','#D4A040','#E06080','#ffffff','#FFD700'];
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 0.6,
      w: 5 + Math.random() * 8, h: 5 + Math.random() * 8,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 1.5 + Math.random() * 3.5, vx: (Math.random() - 0.5) * 4,
      rot: Math.random() * Math.PI, rSpeed: (Math.random() - 0.5) * 0.12,
      star: Math.random() > 0.7, // 30% are star-shaped
    }));
    let frame;
    function drawStar(cx, size) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        if (i === 0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
        else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fill();
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allGone = true;
      pieces.forEach((p) => {
        p.y += p.vy; p.x += p.vx; p.rot += p.rSpeed;
        if (p.y < canvas.height) allGone = false;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.star) drawStar(ctx, p.w);
        else ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if (!allGone) frame = requestAnimationFrame(draw);
      else canvas.remove();
    }
    frame = requestAnimationFrame(draw);
    setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 6000);
  }

  function tick() {
    if (_isPaused) return;
    _secondsLeft -= 1;
    if (countdown()) countdown().textContent = fmt(_secondsLeft);
    _saveState();

    if (_secondsLeft <= 0) {
      clearInterval(_intervalId);
      _intervalId = null;

      if (!_isBreak) {
        // ── Focus session complete ────────────────────────────
        const coinsEarned = _awardCoins(_focusMinutes);
        _confetti();
        SoundManager.play('pomo');

        // Decrement pomo count
        _pomosLeft--;

        if (_breakSec === 0) {
          // No break configured
          if (_pomosLeft > 0 && _autoNext) {
            _showPomoFinishModal('ROUND DONE!', 'Great work! Starting next round…', coinsEarned);
            _startFocus();
          } else if (_pomosLeft > 0) {
            // More rounds but not auto — pause, let player hit ▶ RESUME
            _isPaused = true;
            _secondsLeft = _focusSec;
            if (modeLabel()) modeLabel().textContent = 'FOCUS';
            if (countdown()) countdown().textContent = fmt(_secondsLeft);
            if (window.gameScene) window.gameScene.setStatusIcon('pause');
            _updatePauseResumeButtons();
            _showPomoFinishModal(
              'ROUND DONE!',
              `${_pomosLeft} round${_pomosLeft > 1 ? 's' : ''} left. Press ▶ RESUME when ready!`,
              coinsEarned
            );
          } else {
            // All rounds done — celebrate!
            SoundManager.play('cheer');
            _bigConfetti();
            _showPomoFinishModal('ALL DONE! 🎉', 'Amazing session! You crushed it!', coinsEarned);
            _clearSavedState();
            _setDefault();
            if (window.gameScene) window.gameScene.standUpAfterTimer();
          }
          return;
        }

        // Has a break configured
        if (_autoNext) {
          _showPomoFinishModal('ROUND DONE!', 'Break time! Starting break…', coinsEarned);
          _startBreak();
        } else if (_pomosLeft > 0) {
          // Pause at break — player presses RESUME to start it
          _isBreak = true;
          _secondsLeft = _breakSec;
          if (modeLabel()) modeLabel().textContent = 'BREAK';
          if (countdown()) countdown().textContent = fmt(_secondsLeft);
          const tb = timerBar();
          if (tb) tb.classList.add('break-mode');
          if (statusEl()) { statusEl().textContent = '● BREAK'; statusEl().className = 'status-break'; }
          if (window.gameScene) window.gameScene.setStatusIcon('pause');
          _isPaused = true;
          _updatePauseResumeButtons();
          _showPomoFinishModal('ROUND DONE!', 'Break ready. Press ▶ RESUME to start it!', coinsEarned);
        } else {
          // Last round, no auto — start break then done
          _showPomoFinishModal('LAST ROUND DONE!', 'Break time! Almost finished…', coinsEarned);
          _startBreak();
        }

      } else {
        // ── Break complete ────────────────────────────────────
        SoundManager.play('focus');

        if (_pomosLeft > 0 && _autoNext) {
          _showPomoFinishModal('BREAK OVER!', 'Starting next focus round…', 0);
          _startFocus();
        } else if (_pomosLeft > 0) {
          // Pause — player hits RESUME to start next focus
          _isBreak = false;
          _secondsLeft = _focusSec;
          const tb = timerBar();
          if (tb) tb.classList.remove('break-mode');
          if (modeLabel()) modeLabel().textContent = 'FOCUS';
          if (countdown()) countdown().textContent = fmt(_secondsLeft);
          if (window.gameScene) window.gameScene.setStatusIcon('pause');
          _isPaused = true;
          _updatePauseResumeButtons();
          _showPomoFinishModal(
            'BREAK OVER!',
            `${_pomosLeft} round${_pomosLeft > 1 ? 's' : ''} left. Press ▶ RESUME to focus!`,
            0
          );
        } else {
          // No rounds left after break — celebrate!
          SoundManager.play('cheer');
          _bigConfetti();
          _showPomoFinishModal('ALL DONE! 🎉', 'Session complete! You nailed it!', 0);
          _clearSavedState();
          _setDefault();
          if (window.gameScene) window.gameScene.standUpAfterTimer();
        }
      }
    }
  }

  function _startFocus() {
    _isBreak = false;
    _secondsLeft = _focusSec;
    // _pomosLeft hasn't been decremented yet for this round → use it to derive pomo number
    _currentPomoNum = _pomosTarget - _pomosLeft + 1;
    const tb = timerBar();
    if (tb) tb.classList.remove('break-mode', 'paused-mode');
    if (modeLabel()) modeLabel().textContent = 'FOCUS';
    if (countdown()) countdown().textContent = fmt(_secondsLeft);
    if (statusEl()) { statusEl().textContent = '● STUDYING'; statusEl().className = 'status-studying'; }
    if (window.gameScene) window.gameScene.setStatusIcon('focus');
    _isPaused = false;
    _intervalId = setInterval(tick, 1000);
    _updatePauseResumeButtons();
    _updatePomoCounter(true);
  }

  function _startBreak() {
    _isBreak = true;
    _secondsLeft = _breakSec;
    const tb = timerBar();
    if (tb) { tb.classList.add('break-mode'); tb.classList.remove('paused-mode'); }
    if (modeLabel()) modeLabel().textContent = 'BREAK';
    if (countdown()) countdown().textContent = fmt(_secondsLeft);
    if (statusEl()) { statusEl().textContent = '● BREAK'; statusEl().className = 'status-break'; }
    if (window.gameScene) window.gameScene.setStatusIcon('break');
    _isPaused = false;
    _intervalId = setInterval(tick, 1000);
    _updatePauseResumeButtons();
    _updatePomoCounter(true); // keep showing current pomo number during break
  }

  function _awardCoins(focusMin) {
    if (!window.PlayerClass) return 0;
    let coins = 1;
    if (focusMin >= 90) coins = 100;
    else if (focusMin >= 50) coins = 35;
    else if (focusMin >= 25) coins = 15;
    else if (focusMin >= 10) coins = 5;
    window.PlayerClass.addCoins(coins);
    SoundManager.play('coin');
    return coins;
  }

  function _updatePauseResumeButtons() {
    const pb = pauseBtn();
    const rb = resumeBtn();
    if (!pb || !rb) return;
    if (_isPaused) {
      pb.classList.add('hidden');
      rb.classList.remove('hidden');
    } else {
      pb.classList.remove('hidden');
      rb.classList.add('hidden');
    }
  }

  function _confetti() {
    let canvas = document.getElementById('confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti-canvas';
      canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;width:100%;height:100%';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#9B6BDB','#D06080','#7890D0','#60A870','#D4A040','#E06080'];
    const pieces = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
      w: 6 + Math.random() * 6, h: 6 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 4, vx: (Math.random() - 0.5) * 3,
      rot: Math.random() * Math.PI, rSpeed: (Math.random() - 0.5) * 0.1,
    }));
    let frame;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allGone = true;
      pieces.forEach((p) => {
        p.y += p.vy; p.x += p.vx; p.rot += p.rSpeed;
        if (p.y < canvas.height) allGone = false;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if (!allGone) frame = requestAnimationFrame(draw);
      else canvas.remove();
    }
    frame = requestAnimationFrame(draw);
    setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 4000);
  }

  // ── On-screen pomo finish popup (replaces side toasts) ──────────────────

  let _finishAutoTimer = null;

  function _showPomoFinishModal(title, msg, coinsAwarded) {
    const m     = document.getElementById('pomo-finish-modal');
    const tEl   = document.getElementById('pomo-finish-title');
    const mEl   = document.getElementById('pomo-finish-msg');
    const cEl   = document.getElementById('pomo-finish-coins');
    if (!m) return;
    if (tEl) tEl.textContent = title;
    if (mEl) mEl.textContent = msg;
    if (cEl) cEl.textContent = coinsAwarded ? `+${coinsAwarded} coins earned!` : '';
    m.classList.remove('hidden');
    m.classList.add('active');
    // Auto-dismiss after 7 seconds (enough time to read)
    if (_finishAutoTimer) clearTimeout(_finishAutoTimer);
    _finishAutoTimer = setTimeout(() => {
      m.classList.add('hidden');
      m.classList.remove('active');
    }, 7000);
  }

  function _hidePomoFinishModal() {
    const m = document.getElementById('pomo-finish-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
    if (_finishAutoTimer) { clearTimeout(_finishAutoTimer); _finishAutoTimer = null; }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.PomodoroManager = {
    start(focusMin, breakMin, autoNext, pomosTarget) {
      // Validate focus time
      if (!focusMin || focusMin <= 0) {
        const zm = document.getElementById('timer-zero-modal');
        if (zm) { zm.classList.remove('hidden'); zm.classList.add('active'); }
        return;
      }
      if (_intervalId) clearInterval(_intervalId);
      _focusMinutes   = focusMin;
      _focusSec       = focusMin * 60;
      _breakSec       = (breakMin && breakMin > 0) ? breakMin * 60 : 0;
      _autoNext       = !!autoNext;
      _pomosTarget    = pomosTarget || 1;
      _pomosLeft      = _pomosTarget;
      _currentPomoNum = 0; // will be set by _startFocus()
      _isPaused       = false;
      _startFocus();
    },

    pause() {
      if (!_intervalId && !_isPaused) return;
      _isPaused = true;
      if (window.gameScene) window.gameScene.setStatusIcon('pause');
      _updatePauseResumeButtons();
      _saveState();
    },

    resume() {
      if (!_isPaused) return;
      _isPaused = false;
      if (!_intervalId) _intervalId = setInterval(tick, 1000);
      // Restore correct status icon
      if (window.gameScene) window.gameScene.setStatusIcon(_isBreak ? 'break' : 'focus');
      _updatePauseResumeButtons();
      _saveState();
    },

    // Shows confirmation popup; actual stop happens in confirmStop()
    requestStop(onConfirm) {
      _pendingStopCallback = onConfirm || null;
      const m = document.getElementById('stop-confirm-modal');
      if (m) { m.classList.remove('hidden'); m.classList.add('active'); }
    },

    // Shows confirmation popup; on confirm, calls onConfirm WITHOUT stopping the timer
    requestSkip(onConfirm) {
      _pendingSkipCallback = onConfirm || null;
      const m = document.getElementById('stop-confirm-modal');
      if (m) { m.classList.remove('hidden'); m.classList.add('active'); }
    },

    confirmStop() {
      const m = document.getElementById('stop-confirm-modal');
      if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
      // Skip path: don't wipe the timer state, just call the skip action
      if (_pendingSkipCallback) {
        const cb = _pendingSkipCallback;
        _pendingSkipCallback = null;
        cb();
        return;
      }
      // Normal stop path
      if (_intervalId) clearInterval(_intervalId);
      _intervalId = null;
      _isPaused   = false;
      _isBreak    = false;
      _clearSavedState();
      _setDefault();
      if (_pendingStopCallback) { _pendingStopCallback(); _pendingStopCallback = null; }
    },

    cancelStop() {
      _pendingStopCallback = null;
      _pendingSkipCallback = null;
      const m = document.getElementById('stop-confirm-modal');
      if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
    },

    stop() {
      // Immediate stop without confirmation (used internally)
      if (_intervalId) clearInterval(_intervalId);
      _intervalId = null;
      _isPaused   = false;
      _isBreak    = false;
      _clearSavedState();
      _setDefault();
    },

    // Skip current phase (focus → break, or break → next focus). No coins for skipping focus.
    skip() {
      if (!_intervalId && !_isPaused) return; // nothing running

      clearInterval(_intervalId);
      _intervalId = null;

      if (!_isBreak) {
        // Skipping focus — no coins awarded
        _pomosLeft--;

        if (_breakSec > 0) {
          // Go straight to break
          _showPomoFinishModal('FOCUS SKIPPED', 'Starting break now…', 0);
          _startBreak();
        } else if (_pomosLeft > 0 && _autoNext) {
          _showPomoFinishModal('FOCUS SKIPPED', 'Starting next round…', 0);
          _startFocus();
        } else if (_pomosLeft > 0) {
          _isPaused = true;
          _secondsLeft = _focusSec;
          if (modeLabel()) modeLabel().textContent = 'FOCUS';
          if (countdown()) countdown().textContent = fmt(_secondsLeft);
          if (window.gameScene) window.gameScene.setStatusIcon('pause');
          _updatePauseResumeButtons();
          _showPomoFinishModal('FOCUS SKIPPED', `${_pomosLeft} round${_pomosLeft > 1 ? 's' : ''} left. Press ▶ RESUME!`, 0);
        } else {
          _showPomoFinishModal('SKIPPED', 'Session ended.', 0);
          _setDefault();
          if (window.gameScene) window.gameScene.standUpAfterTimer();
        }
      } else {
        // Skipping break
        _isBreak = false;
        const tb = timerBar();
        if (tb) tb.classList.remove('break-mode');

        if (_pomosLeft > 0 && _autoNext) {
          _showPomoFinishModal('BREAK SKIPPED', 'Starting next focus round…', 0);
          _startFocus();
        } else if (_pomosLeft > 0) {
          _isPaused = true;
          _secondsLeft = _focusSec;
          if (modeLabel()) modeLabel().textContent = 'FOCUS';
          if (countdown()) countdown().textContent = fmt(_secondsLeft);
          if (window.gameScene) window.gameScene.setStatusIcon('pause');
          _updatePauseResumeButtons();
          _showPomoFinishModal('BREAK SKIPPED', `${_pomosLeft} round${_pomosLeft > 1 ? 's' : ''} left. Press ▶ RESUME!`, 0);
        } else {
          _showPomoFinishModal('ALL DONE!', 'Session complete!', 0);
          _setDefault();
          if (window.gameScene) window.gameScene.standUpAfterTimer();
        }
      }
    },

    hideFinishModal() { _hidePomoFinishModal(); },

    // Restore timer state after a page refresh
    restore() {
      try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (!s || (!s.running && !s.isPaused)) return; // nothing was running

        _focusMinutes   = s.focusMinutes;
        _focusSec       = s.focusSec;
        _breakSec       = s.breakSec;
        _autoNext       = s.autoNext;
        _pomosTarget    = s.pomosTarget;
        _pomosLeft      = s.pomosLeft;
        _currentPomoNum = s.currentPomoNum;
        _isBreak        = s.isBreak;

        if (s.running && !s.isPaused) {
          // Timer was ticking — subtract elapsed time
          const elapsedSec = Math.floor((Date.now() - s.savedAt) / 1000);
          _secondsLeft = Math.max(0, s.secondsLeft - elapsedSec);
        } else {
          // Was paused
          _secondsLeft = s.secondsLeft;
        }

        // Restore UI
        const tb = timerBar();
        if (_isBreak) {
          if (tb) { tb.classList.add('break-mode'); tb.classList.remove('paused-mode'); }
          if (modeLabel()) modeLabel().textContent = 'BREAK';
          if (statusEl()) { statusEl().textContent = '● BREAK'; statusEl().className = 'status-break'; }
        } else {
          if (tb) tb.classList.remove('break-mode', 'paused-mode');
          if (modeLabel()) modeLabel().textContent = 'FOCUS';
          if (statusEl()) { statusEl().textContent = '● STUDYING'; statusEl().className = 'status-studying'; }
        }
        if (countdown()) countdown().textContent = fmt(_secondsLeft);
        _updatePomoCounter(true);

        if (s.isPaused || _secondsLeft <= 0) {
          _isPaused = true;
          if (statusEl()) { statusEl().textContent = '● PAUSED'; }
          if (tb) tb.classList.add('paused-mode');
          _updatePauseResumeButtons();
        } else {
          _isPaused = false;
          _intervalId = setInterval(tick, 1000);
          _updatePauseResumeButtons();
        }
      } catch (e) { console.warn('Timer restore failed:', e); }
    },

    isRunning() {
      return _intervalId !== null || _isPaused;
    },

    isBreak() {
      return _isBreak;
    },

    setAutoNext(val) { _autoNext = !!val; },
  };
})();

// ── ActivityTimer ─────────────────────────────────────────────────────────
// Lightweight countdown for eating / cooking.  Uses the same timer-bar
// display as PomodoroManager (they are mutually exclusive states).
(function () {
  let _id    = null;
  let _secs  = 0;
  let _onDone = null;

  const modeLabel = () => document.getElementById('timer-mode-label');
  const countdown = () => document.getElementById('timer-countdown');
  const timerBar  = () => document.getElementById('timer-bar');

  function fmt(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function tick() {
    _secs--;
    if (countdown()) countdown().textContent = fmt(Math.max(0, _secs));
    if (_secs <= 0) {
      clearInterval(_id); _id = null;
      const tb = timerBar();
      if (tb) tb.classList.remove('activity-mode');
      if (modeLabel()) modeLabel().textContent = 'TIMER';
      if (countdown()) countdown().textContent = '00:00';
      if (_onDone) { const cb = _onDone; _onDone = null; cb(); }
    }
  }

  window.ActivityTimer = {
    start(label, minutes, onDone) {
      if (_id) clearInterval(_id);
      _secs   = (minutes || 1) * 60;
      _onDone = onDone || null;
      if (modeLabel()) modeLabel().textContent = label;
      if (countdown()) countdown().textContent = fmt(_secs);
      const tb = timerBar();
      if (tb) { tb.classList.remove('break-mode', 'paused-mode'); tb.classList.add('activity-mode'); }
      _id = setInterval(tick, 1000);
    },
    stop() {
      if (_id) { clearInterval(_id); _id = null; }
      _onDone = null;
      const tb = timerBar();
      if (tb) tb.classList.remove('activity-mode');
      if (modeLabel()) modeLabel().textContent = 'TIMER';
      if (countdown()) countdown().textContent = '00:00';
    },
    isRunning() { return _id !== null; },
  };
})();
