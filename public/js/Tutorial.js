/**
 * Tutorial.js
 * A lightweight, dynamic step-by-step onboarding tour for new users.
 *
 * Walks a first-time visitor through the core loop and — for the hands-on
 * steps — waits for the user to actually DO the thing before the Next button
 * unlocks:
 *   1. Move around      (walk with WASD / arrows)
 *   2. Sit down         (press E / A on a chair)
 *   3. Focus timer      (start a Pomodoro at a desk)
 *   4. Your tasks       (add a task)
 *   5. Make a friend    (add someone)
 *   6. Make it yours    (DIY furniture — informational)
 *
 * Interactive steps use a non-blocking glowing "ring" so the app stays fully
 * usable; intro/outro steps dim the page with a spotlight. Self-contained —
 * injects its own styles, no external CSS needed.
 *
 * Public API:
 *   window.Tutorial.start()        → force-start the tour
 *   window.Tutorial.maybeStart()   → start only if the user hasn't seen it
 *   window.startTutorial()         → alias for start()
 */
(function () {
  const SEEN_KEY = 'bh_tutorial_done';
  const GAP = 14; // px between spotlight and tooltip

  const moveHint = 'Use <b>WASD</b> or the <b>arrow buttons</b> to move around the room.';

  function taskCount() {
    return document.querySelectorAll('#personal-task-list li, #global-task-list li').length;
  }

  // ── Tour steps ───────────────────────────────────────────────
  // target : CSS selector to highlight (null = centered, dimmed spotlight)
  // action : { arm(), check(state) } — makes the step hands-on & gates Next
  // cue / doneMsg : the little prompt shown while waiting / once complete
  const STEPS = [
    {
      target: null,
      title: '🌷 Welcome!',
      body: "This is your cozy study space. Let's take a quick tour — you'll actually try each thing as we go!",
    },
    {
      target: '#game-container',
      title: '① Move around',
      body: moveHint + ' Give it a try now — take a little walk!',
      placement: 'top',
      cue: 'Walk around with WASD / arrows',
      doneMsg: 'Nice moves! Ready for the next step.',
      action: {
        arm: () => { const p = window.gameScene?.player; return { x: p?.x ?? null, y: p?.y ?? null }; },
        check: (b) => {
          const p = window.gameScene?.player;
          if (!p || !b) return false;
          if (b.x == null) { b.x = p.x; b.y = p.y; return false; }
          return Math.hypot(p.x - b.x, p.y - b.y) > 24;
        },
      },
    },
    {
      target: '#game-container',
      title: '② Sit down',
      body: 'Walk up to a <b>chair</b> or <b>desk</b> and press <b>E</b> to sit down — or <b>A</b> on mobile — to interact with objects. Try sitting now!',
      placement: 'top',
      cue: 'Press E (or A) on a chair to sit',
      doneMsg: 'You sat down! On to the timer.',
      action: {
        arm: () => ({}),
        check: () => !!window.gameScene?.isSitting,
      },
    },
    {
      target: '#game-container',
      title: '③ Focus timer',
      body: 'Sit at a <b>desk</b> and start a <b>Pomodoro</b> focus timer — it appears up top. Track your session, take breaks, and earn 🪙 coins for studying.',
      placement: 'top',
      cue: 'Sit at a desk & start a focus timer',
      doneMsg: 'Timer started — great focus!',
      action: {
        arm: () => ({}),
        check: () => { try { return !!window.PomodoroManager?.isRunning?.(); } catch (_) { return false; } },
      },
    },
    {
      target: '#task-panel-wrap',
      title: '④ Your tasks',
      body: 'Add what you want to get done with the <b>+</b> button. Tick tasks off as you go — share them with the room or keep them private. Add one now!',
      placement: 'beside',
      expand: 'left',
      cue: 'Tap + and add a task',
      doneMsg: 'Task added! Keep it up.',
      action: {
        arm: () => ({ n: taskCount() }),
        check: (b) => taskCount() > (b?.n ?? 0),
      },
    },
    {
      target: '#social-panel-wrap',
      title: '⑤ Make a friend',
      body: 'See who else is studying here. Click someone in the <b>Social</b> bar to add them as a friend and chat together.',
      placement: 'beside',
      expand: 'right',
      cue: 'Click someone → Add Friend',
      doneMsg: 'All set!',
      action: {
        arm: () => ({ n: window.socialState?.friends?.length || 0, others: Object.keys(window._allPlayers || {}).length }),
        check: (b) => {
          if (!b || (b.others || 0) === 0) return true; // nobody else here — nothing to do
          return (window.socialState?.friends?.length || 0) > (b.n || 0);
        },
      },
    },
    {
      target: '#diy-bar',
      title: '⑥ Make it yours',
      body: 'Open the <b>DIY</b> bar to place chairs, tables, plants and decor. Design the room exactly how you like it — go ahead and open it!',
      placement: 'top',
      passthrough: true,
    },
    {
      target: null,
      title: "🎉 You're all set!",
      body: "That's it — go study, hang out, and belong here. You can replay this tour anytime with the <b>?</b> button in the corner.",
    },
  ];

  let idx = 0;
  let active = false;
  let els = null;
  let armState = null;
  let stepDone = true;
  let pollTimer = null;
  let modalWatch = null;
  const restoreCollapse = []; // panels we temporarily expanded

  // Hide the tour card while any app modal is open so it stays fully usable
  function syncModalVisibility() {
    if (!els) return;
    const open = !!document.querySelector('.modal-overlay:not(.hidden)');
    els.tooltip.classList.toggle('by-modal', open);
  }

  // ── Styles ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('tutorial-styles')) return;
    const s = document.createElement('style');
    s.id = 'tutorial-styles';
    s.textContent = `
      #tut-backdrop {
        position: fixed; inset: 0; z-index: 100000;
        background: transparent; cursor: default;
      }
      #tut-backdrop.dim { background: rgba(0,0,0,0.72); transition: background .2s ease; }
      #tut-backdrop.pass { pointer-events: none; }
      #tut-spotlight {
        position: fixed; z-index: 100001; pointer-events: none;
        border-radius: 10px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 3px var(--accent, #9b6bdb),
                    0 0 22px 4px rgba(155,107,219,0.55);
        transition: top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1),
                    width .28s cubic-bezier(.4,0,.2,1), height .28s cubic-bezier(.4,0,.2,1);
      }
      /* Ring-only highlight for hands-on steps — no page dim, app stays usable */
      #tut-spotlight.ring {
        box-shadow: 0 0 0 3px var(--accent, #9b6bdb), 0 0 18px 5px rgba(155,107,219,0.6);
        animation: tutPulse 1.5s ease-in-out infinite;
      }
      @keyframes tutPulse {
        0%,100% { box-shadow: 0 0 0 3px var(--accent, #9b6bdb), 0 0 14px 3px rgba(155,107,219,0.45); }
        50%     { box-shadow: 0 0 0 3px var(--accent, #9b6bdb), 0 0 26px 9px rgba(155,107,219,0.85); }
      }
      #tut-tooltip {
        position: fixed; z-index: 100002;
        width: min(360px, calc(100vw - 24px));
        background: var(--panel-bg, #13131f);
        border: 2px solid var(--accent, #9b6bdb);
        border-radius: 12px;
        padding: 18px 18px 15px;
        box-shadow: 0 10px 34px rgba(0,0,0,0.6);
        font-family: var(--font, 'Press Start 2P', monospace);
        color: #eee;
        /* Card body lets clicks fall through to the app so hands-on controls
           (the + button, member list, etc.) stay usable even if overlapped.
           Buttons re-enable pointer events below. */
        pointer-events: none;
        transition: top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1);
      }
      #tut-tooltip button { pointer-events: auto; }
      /* When an app modal (add-task, pomodoro, etc.) is open, get out of the
         way completely so it's fully usable; we reappear when it closes. */
      #tut-tooltip.by-modal { opacity: 0; pointer-events: none; }
      #tut-tooltip .tut-title {
        font-size: 15px; color: var(--accent, #9b6bdb);
        margin: 0 0 12px; line-height: 1.5;
      }
      #tut-tooltip .tut-body {
        font-size: 13px; line-height: 1.95; color: #d4d4e4;
        font-family: 'Fira Code', monospace; margin: 0 0 14px;
      }
      #tut-tooltip .tut-body b { color: #fff; }
      #tut-tooltip .tut-cue {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        font-family: 'Fira Code', monospace; font-size: 12px; line-height: 1.7;
        color: var(--accent2, #5a8fe8);
        background: rgba(90,143,232,0.10); border: 1px solid rgba(90,143,232,0.35);
        border-radius: 8px; padding: 9px 11px; margin: 0 0 14px;
      }
      #tut-tooltip .tut-cue.done { color: #6ee7a8; background: rgba(110,231,168,0.10); border-color: rgba(110,231,168,0.4); }
      #tut-tooltip .tut-cue-txt { flex: 1; min-width: 0; }
      #tut-tooltip .tut-skipstep {
        margin-left: auto; background: none; border: none; color: #7a7a90;
        font-family: 'Fira Code', monospace; font-size: 11px; cursor: pointer;
        padding: 2px 4px; text-decoration: underline;
      }
      #tut-tooltip .tut-skipstep:hover { color: #ccc; }
      #tut-tooltip .tut-foot {
        display: flex; align-items: center; gap: 8px;
      }
      #tut-tooltip .tut-dots { display: flex; gap: 6px; margin-right: auto; }
      #tut-tooltip .tut-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--panel-border, #2a2a3e); transition: background .2s;
      }
      #tut-tooltip .tut-dot.on { background: var(--accent, #9b6bdb); }
      #tut-tooltip button.tut-nav {
        font-family: var(--font, 'Press Start 2P', monospace);
        font-size: 11px; cursor: pointer; border-radius: 6px;
        padding: 9px 13px; border: 2px solid var(--panel-border, #2a2a3e);
        background: #1c1c2b; color: #ddd; transition: all .15s;
      }
      #tut-tooltip button.tut-nav:hover { border-color: var(--accent, #9b6bdb); color: #fff; }
      #tut-tooltip button.tut-primary {
        background: var(--accent, #9b6bdb); border-color: var(--accent, #9b6bdb); color: #fff;
      }
      #tut-tooltip button.tut-primary:hover { filter: brightness(1.12); }
      #tut-tooltip button.tut-primary:disabled {
        opacity: .4; cursor: not-allowed; filter: grayscale(.35);
        background: #3a3550; border-color: #3a3550;
      }
      #tut-tooltip .tut-skip {
        position: absolute; top: 11px; right: 13px;
        background: none; border: none; color: #888; font-size: 11px; padding: 2px 4px; cursor: pointer;
        font-family: var(--font, 'Press Start 2P', monospace);
      }
      #tut-tooltip .tut-skip:hover { color: #fff; }
      #tut-help-btn {
        position: fixed; right: 14px; bottom: 14px; z-index: 9500;
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--panel-bg, #13131f); color: var(--accent, #9b6bdb);
        border: 2px solid var(--accent, #9b6bdb); cursor: pointer;
        font-family: var(--font, 'Press Start 2P', monospace); font-size: 14px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.5); opacity: 0.65; transition: opacity .15s, transform .15s;
      }
      #tut-help-btn:hover { opacity: 1; transform: scale(1.08); }
      @media (max-width: 640px) {
        #tut-tooltip .tut-title { font-size: 13px; }
        #tut-tooltip .tut-body { font-size: 12px; }
        #tut-help-btn { width: 32px; height: 32px; font-size: 13px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── DOM build ────────────────────────────────────────────────
  function buildDom() {
    const backdrop = document.createElement('div');
    backdrop.id = 'tut-backdrop';
    const spotlight = document.createElement('div');
    spotlight.id = 'tut-spotlight';
    const tooltip = document.createElement('div');
    tooltip.id = 'tut-tooltip';
    document.body.appendChild(backdrop);
    document.body.appendChild(spotlight);
    document.body.appendChild(tooltip);
    backdrop.addEventListener('click', (e) => e.stopPropagation());
    return { backdrop, spotlight, tooltip };
  }

  // ── Panel expand helper (task / social panels may be collapsed) ──
  function ensureExpanded(side) {
    const wrapId = side === 'left' ? 'task-panel-wrap' : 'social-panel-wrap';
    const wrap = document.getElementById(wrapId);
    if (wrap && wrap.classList.contains('collapsed')) {
      wrap.classList.remove('collapsed');
      restoreCollapse.push(wrapId);
    }
  }
  function restorePanels() {
    restoreCollapse.forEach(id => document.getElementById(id)?.classList.add('collapsed'));
    restoreCollapse.length = 0;
  }

  function safeCheck(step) {
    try { return !!step.action.check(armState); } catch (_) { return false; }
  }

  // ── Show a step (entry point when idx changes) ───────────────
  function showStep() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const step = STEPS[idx];
    const { tooltip } = els;

    if (step.expand) ensureExpanded(step.expand);

    const dots = STEPS.map((_, i) => `<span class="tut-dot ${i === idx ? 'on' : ''}"></span>`).join('');
    const isLast = idx === STEPS.length - 1;
    const isFirst = idx === 0;
    tooltip.innerHTML = `
      <button class="tut-skip" data-act="skip" title="Skip tour">✕ skip</button>
      <div class="tut-title">${step.title}</div>
      <div class="tut-body">${step.body}</div>
      ${step.action ? `<div class="tut-cue"><span class="tut-cue-txt"></span><button class="tut-skipstep" data-act="skipstep">skip step →</button></div>` : ''}
      <div class="tut-foot">
        <div class="tut-dots">${dots}</div>
        ${isFirst ? '' : '<button class="tut-nav" data-act="back">◀ Back</button>'}
        <button class="tut-nav tut-primary" data-act="next">${isLast ? '✓ Done' : 'Next ▶'}</button>
      </div>
    `;
    tooltip.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        try { window.SoundManager?.play('click'); } catch (_) {}
        const act = b.dataset.act;
        if (act === 'next') { if (isLast) finish(true); else go(1); }
        else if (act === 'back') go(-1);
        else if (act === 'skip') finish(false);
        else if (act === 'skipstep') go(1);
      });
    });

    // Arm the hands-on check (fresh baseline each time the step is shown)
    armState = step.action ? step.action.arm() : null;
    stepDone = step.action ? safeCheck(step) : true;
    updateGateUI();

    if (step.action && !stepDone) {
      pollTimer = setInterval(() => {
        if (safeCheck(STEPS[idx])) {
          stepDone = true;
          clearInterval(pollTimer); pollTimer = null;
          try { window.SoundManager?.play('complete'); } catch (_) {}
          updateGateUI();
        }
      }, 400);
    }

    layout();

    // A panel we just expanded animates its width — re-measure once it settles
    // so the highlight ring covers the full panel, not the mid-transition sliver.
    if (step.expand) {
      setTimeout(() => { if (active && STEPS[idx] === step) layout(); }, 240);
      setTimeout(() => { if (active && STEPS[idx] === step) layout(); }, 460);
    }
  }

  // Reflect the gated/done state in the tooltip (Next enabled + cue text)
  function updateGateUI() {
    const step = STEPS[idx];
    const tooltip = els?.tooltip;
    if (!tooltip) return;
    const nextBtn = tooltip.querySelector('[data-act=next]');
    if (nextBtn) nextBtn.disabled = !stepDone;
    if (!step.action) return;
    const cueRow = tooltip.querySelector('.tut-cue');
    const cueTxt = tooltip.querySelector('.tut-cue-txt');
    const skipStep = tooltip.querySelector('.tut-skipstep');
    if (cueRow) cueRow.classList.toggle('done', stepDone);
    if (cueTxt) cueTxt.innerHTML = stepDone ? ('✅ ' + (step.doneMsg || 'Done!')) : ('👉 ' + (step.cue || 'Try it'));
    if (skipStep) skipStep.style.display = stepDone ? 'none' : '';
  }

  // ── Layout: position the spotlight + tooltip (also on reflow) ─
  function layout() {
    const step = STEPS[idx];
    const { backdrop, spotlight } = els;
    const targetEl = step.target ? document.querySelector(step.target) : null;
    const rect = targetEl ? targetEl.getBoundingClientRect() : null;
    const hasSpot = rect && rect.width > 0 && rect.height > 0;

    if (step.action || step.passthrough) {
      // Hands-on / explore step: glowing ring, no dim, app stays clickable
      backdrop.classList.remove('dim');
      backdrop.classList.add('pass');
      if (hasSpot) {
        spotlight.classList.add('ring');
        spotlight.style.display = 'block';
        placeSpot(rect);
      } else {
        spotlight.style.display = 'none';
      }
    } else if (hasSpot) {
      // Informational step with a target: dimmed spotlight (blocks clicks)
      backdrop.classList.remove('dim', 'pass');
      spotlight.classList.remove('ring');
      spotlight.style.display = 'block';
      placeSpot(rect);
    } else {
      // No target: full dim, centered card
      backdrop.classList.add('dim');
      backdrop.classList.remove('pass');
      spotlight.style.display = 'none';
    }

    positionTooltip(rect, step.placement);
  }

  function placeSpot(rect) {
    const spotlight = els.spotlight;
    const pad = 8;
    spotlight.style.top    = Math.max(0, rect.top - pad) + 'px';
    spotlight.style.left   = Math.max(0, rect.left - pad) + 'px';
    spotlight.style.width  = Math.min(window.innerWidth,  rect.width  + pad * 2) + 'px';
    spotlight.style.height = Math.min(window.innerHeight, rect.height + pad * 2) + 'px';
  }

  // ── Tooltip positioning ──────────────────────────────────────
  function positionTooltip(rect, placement) {
    const tip = els.tooltip;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top, left;

    if (placement === 'top') {
      // Pinned just below the header — keeps the game & any pop-up modals clear
      const hdr = document.getElementById('header')?.getBoundingClientRect();
      top = (hdr ? hdr.bottom : 8) + 10;
      left = (vw - tw) / 2;
    } else if (placement === 'beside' && rect) {
      // Place the card next to a side panel (never on top of its controls):
      // panel on the left → card to its right, and vice-versa. Top-aligned so
      // the footer buttons stay high and clear any centered pop-up modal.
      const centerX = rect.left + rect.width / 2;
      left = centerX < vw / 2 ? rect.right + GAP : rect.left - tw - GAP;
      const hdr = document.getElementById('header')?.getBoundingClientRect();
      top = (hdr ? hdr.bottom : 8) + 10;
    } else if (!rect || placement === 'center') {
      if (!rect) { top = (vh - th) / 2; left = (vw - tw) / 2; }
      else { top = rect.top + rect.height / 2 - th / 2; left = rect.left + rect.width / 2 - tw / 2; }
    } else {
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow > th + GAP + 8) top = rect.bottom + GAP;
      else if (spaceAbove > th + GAP + 8) top = rect.top - th - GAP;
      else top = Math.max(8, (vh - th) / 2);
      left = rect.left + rect.width / 2 - tw / 2;
    }

    top  = Math.max(8, Math.min(top,  vh - th - 8));
    left = Math.max(8, Math.min(left, vw - tw - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }

  // ── Navigation ───────────────────────────────────────────────
  function go(dir) {
    idx = Math.max(0, Math.min(STEPS.length - 1, idx + dir));
    showStep();
  }

  function finish(completed) {
    if (!active) return;
    active = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (modalWatch) { clearInterval(modalWatch); modalWatch = null; }
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onReflow);
    window.removeEventListener('scroll', onReflow, true);
    els.backdrop.remove();
    els.spotlight.remove();
    els.tooltip.remove();
    els = null;
    restorePanels();
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) {}
    if (completed) { try { window.showToast?.('🌷 Enjoy your space!'); } catch (_) {} }
    ensureHelpButton();
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      // Respect gating — only advance once the step's action is done
      if (!stepDone) return;
      e.preventDefault();
      idx === STEPS.length - 1 ? finish(true) : go(1);
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }

  let reflowRaf = null;
  function onReflow() {
    if (reflowRaf) cancelAnimationFrame(reflowRaf);
    reflowRaf = requestAnimationFrame(() => { if (active) layout(); });
  }

  // ── Public entry points ──────────────────────────────────────
  function start() {
    if (active) return;
    injectStyles();
    active = true;
    idx = 0;
    els = buildDom();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    modalWatch = setInterval(syncModalVisibility, 200);
    showStep();
  }

  function maybeStart() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (_) {}
    ensureHelpButton();
    if (seen) return;
    setTimeout(() => { if (!active) start(); }, 700);
  }

  // ── Persistent "replay tour" help button ─────────────────────
  function ensureHelpButton() {
    if (document.getElementById('tut-help-btn')) return;
    injectStyles();
    const b = document.createElement('button');
    b.id = 'tut-help-btn';
    b.textContent = '?';
    b.title = 'Replay the tour';
    b.addEventListener('click', () => { try { window.SoundManager?.play('click'); } catch (_) {} start(); });
    document.body.appendChild(b);
  }

  window.Tutorial = { start, maybeStart };
  window.startTutorial = start;
})();
