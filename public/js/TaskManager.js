/**
 * TaskManager.js
 * Manages personal and global task lists.
 * Personal tasks are local to this browser session.
 * Global tasks are synced via Socket.io.
 */

(function () {
  let _personalTasks = [];  // { id, text, completed, coinsEarned }
  let _globalTasks   = [];  // { id, text, playerName, playerId, completed }
  let _myPlayerId    = null;
  let _myName        = '';

  // ── DOM helpers ────────────────────────────────────────────
  const personalList  = () => document.getElementById('personal-task-list');
  const globalList    = () => document.getElementById('global-task-list');
  const personalEmpty = () => document.getElementById('personal-empty');
  const globalEmpty   = () => document.getElementById('global-empty');

  function renderPersonal() {
    const ul = personalList();
    if (!ul) return;
    ul.innerHTML = '';
    const visible = _personalTasks;
    personalEmpty().style.display = visible.length ? 'none' : 'block';
    visible.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'task-item' + (t.completed ? ' done' : '');
      li.dataset.id = t.id;
      li.innerHTML = `
        <div class="task-checkbox clickable">${t.completed ? '✓' : ''}</div>
        <div class="task-body">${escHtml(t.text)}</div>
        <button class="task-delete" data-id="${t.id}" title="Delete">✕</button>
      `;
      li.querySelector('.task-checkbox').addEventListener('click', () => {
        togglePersonal(t.id);
      });
      li.querySelector('.task-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deletePersonal(t.id);
      });
      ul.appendChild(li);
    });
  }

  function renderGlobal() {
    const ul = globalList();
    if (!ul) return;
    ul.innerHTML = '';
    globalEmpty().style.display = _globalTasks.length ? 'none' : 'block';
    _globalTasks.forEach((t) => {
      const isOwn = t.playerId === _myPlayerId;
      const li = document.createElement('li');
      li.className = 'task-item' + (t.completed ? ' done' : '');
      li.dataset.id = t.id;
      li.innerHTML = `
        <div class="task-checkbox ${isOwn ? 'clickable' : ''}">${t.completed ? '✓' : ''}</div>
        <div class="task-body">
          ${escHtml(t.text)}
          <div class="task-owner">${escHtml(t.playerName)}</div>
        </div>
        ${isOwn ? `<button class="task-delete" data-id="${t.id}" title="Delete">✕</button>` : ''}
      `;
      // Owner can toggle (check or uncheck) their own task on the shared board
      if (isOwn) {
        li.querySelector('.task-checkbox').addEventListener('click', () => {
          if (!t.completed) {
            window.socket.emit('completeTask', { taskId: t.id });
          } else {
            window.socket.emit('uncompleteTask', { taskId: t.id });
          }
        });
      }
      if (isOwn) {
        const delBtn = li.querySelector('.task-delete');
        if (delBtn) {
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.socket.emit('deleteTask', { taskId: t.id });
          });
        }
      }
      ul.appendChild(li);
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Task confetti (smaller burst) ──────────────────────────
  function _taskConfetti() {
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
    const pieces = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * -canvas.height * 0.5,
      w: 5 + Math.random() * 5, h: 5 + Math.random() * 5,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 3,
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
    setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 3000);
  }

  // ── Show task done modal ────────────────────────────────────
  function _showTaskDoneModal(coins) {
    const m    = document.getElementById('task-done-modal');
    const cEl  = document.getElementById('task-done-coins');
    if (!m) return;
    if (cEl) cEl.textContent = coins > 0 ? `+${coins} coins earned!` : '';
    m.classList.remove('hidden');
    m.classList.add('active');
  }

  // ── Personal task operations ────────────────────────────────
  function togglePersonal(id) {
    const t = _personalTasks.find((x) => x.id === id);
    if (!t) return;

    if (!t.completed) {
      // ── Completing ────────────────────────────────────────
      const coins = 10;
      t.completed   = true;
      t.coinsEarned = coins;

      if (window.PlayerClass) window.PlayerClass.addCoins(coins);
      if (window.SoundManager) SoundManager.play('complete');
      _taskConfetti();
      _showTaskDoneModal(coins);

      // Also mark it done on the global board (find by matching text + player)
      const globalMatch = _globalTasks.find(
        (g) => g.playerId === _myPlayerId && g.text === t.text && !g.completed
      );
      if (globalMatch && window.socket) {
        window.socket.emit('completeTask', { taskId: globalMatch.id });
      }
    } else {
      // ── Undoing ───────────────────────────────────────────
      const coinsToRemove = t.coinsEarned || 0;
      t.completed   = false;
      t.coinsEarned = 0;
      if (window.PlayerClass && coinsToRemove > 0) {
        window.PlayerClass.addCoins(-coinsToRemove);
      }
      // Also undo on the shared board (find matching global task by text + player)
      const globalMatch = _globalTasks.find(
        (g) => g.playerId === _myPlayerId && g.text === t.text && g.completed
      );
      if (globalMatch && window.socket) {
        window.socket.emit('uncompleteTask', { taskId: globalMatch.id });
      }
    }

    renderPersonal();
  }

  function deletePersonal(id) {
    _personalTasks = _personalTasks.filter((x) => x.id !== id);
    renderPersonal();
  }

  // ── Public API ──────────────────────────────────────────────
  window.TaskManager = {
    init(playerId, playerName) {
      _myPlayerId = playerId;
      _myName     = playerName;
    },

    addTask(text) {
      if (!text.trim()) return;
      const localId = `local-${Date.now()}`;
      _personalTasks.push({ id: localId, text: text.trim(), completed: false, coinsEarned: 0 });
      renderPersonal();
      window.socket.emit('addTask', { text: text.trim(), playerName: _myName });
    },

    // ── Socket event handlers ───────────────────────────────

    onInit(tasks) {
      _globalTasks = tasks;
      renderGlobal();
    },

    onTaskAdded(task) {
      if (!_globalTasks.find((t) => t.id === task.id)) {
        _globalTasks.push(task);
      }
      renderGlobal();
    },

    onTaskCompleted({ taskId }) {
      const t = _globalTasks.find((x) => x.id === taskId);
      if (t) {
        t.completed = true;
        // If this is MY task, also complete it in the personal list
        if (t.playerId === _myPlayerId) {
          const personal = _personalTasks.find(
            (p) => p.text === t.text && !p.completed
          );
          if (personal) {
            const coins = 10;
            personal.completed  = true;
            personal.coinsEarned = coins;
            if (window.PlayerClass) window.PlayerClass.addCoins(coins);
            if (window.SoundManager) SoundManager.play('complete');
            _taskConfetti();
            _showTaskDoneModal(coins);
            renderPersonal();
          }
        }
      }
      renderGlobal();
    },

    onTaskUncompleted({ taskId }) {
      const t = _globalTasks.find((x) => x.id === taskId);
      if (t) {
        t.completed = false;
        // If this is MY task, also uncheck + return coins in the personal list
        if (t.playerId === _myPlayerId) {
          const personal = _personalTasks.find(
            (p) => p.text === t.text && p.completed
          );
          if (personal) {
            const coinsBack = personal.coinsEarned || 0;
            personal.completed  = false;
            personal.coinsEarned = 0;
            if (window.PlayerClass && coinsBack > 0) {
              window.PlayerClass.addCoins(-coinsBack);
            }
            renderPersonal();
          }
        }
      }
      renderGlobal();
    },

    onTaskDeleted({ taskId }) {
      _globalTasks = _globalTasks.filter((t) => t.id !== taskId);
      renderGlobal();
    },
  };
})();
