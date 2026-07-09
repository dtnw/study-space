/**
 * Tutorial.js
 * A lightweight, dynamic step-by-step onboarding tour for new users.
 *
 * Walks a first-time visitor through the core loop:
 *   1. Moving around
 *   2. Sitting down (interact)
 *   3. The focus timer
 *   4. The task panel
 *   5. The social bar
 *   6. The DIY furniture bar
 *
 * Uses a "spotlight" overlay that dims the page and highlights one element at
 * a time, with a floating tooltip card (Next / Back / Skip). Self-contained —
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

  const isMobile = window.matchMedia?.('(pointer: coarse) and (hover: none)').matches || false;
  const moveHint = 'Use <b>WASD</b> or the <b>arrow buttons</b> to move around the room.';

  // ── Tour steps ───────────────────────────────────────────────
  // target: CSS selector to spotlight (null = centered, whole-screen dim)
  const STEPS = [
    {
      target: null,
      title: '🌷 Welcome!',
      body: "This is your cozy study space. Let's take a quick tour so you feel right at home — it only takes a few taps.",
    },
    {
      target: '#game-container',
      title: '① Move around',
      body: moveHint + ' Explore the space and find a comfy spot.',
      placement: 'center',
    },
    {
      target: '#game-container',
      title: '② Sit down',
      body: 'Walk up to a <b>chair</b> or <b>desk</b> and press <b>E</b> to sit down — or <b>A</b> on mobile — to interact with objects. You can also cook, work out, or relax on the furniture!',
      placement: 'center',
    },
    {
      target: '#timer-bar',
      title: '③ Focus timer',
      body: 'When you sit at a desk, set a <b>Pomodoro</b> focus timer. Track your session, take breaks, and earn 🪙 coins for studying.',
    },
    {
      target: '#task-panel-wrap',
      title: '④ Your tasks',
      body: 'Add what you want to get done with the <b>+</b> button. Tick tasks off as you go — share them with the room or keep them private.',
      expand: 'left',
    },
    {
      target: '#social-panel-wrap',
      title: '⑤ Social bar',
      body: 'See who else is studying, set your <b>status</b> (Sociable / Private / Locked In), add friends, and chat together.',
      expand: 'right',
    },
    {
      target: '#diy-bar',
      title: '⑥ Make it yours',
      body: 'Open the <b>DIY</b> bar to place chairs, tables, plants and decor. Design the room exactly how you like it.',
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
  const restoreCollapse = []; // panels we temporarily expanded

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
      #tut-spotlight {
        position: fixed; z-index: 100001; pointer-events: none;
        border-radius: 10px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 3px var(--accent, #9b6bdb),
                    0 0 22px 4px rgba(155,107,219,0.55);
        transition: all .28s cubic-bezier(.4,0,.2,1);
      }
      #tut-tooltip {
        position: fixed; z-index: 100002;
        width: min(340px, calc(100vw - 32px));
        background: var(--panel-bg, #13131f);
        border: 2px solid var(--accent, #9b6bdb);
        border-radius: 12px;
        padding: 16px 16px 14px;
        box-shadow: 0 10px 34px rgba(0,0,0,0.6);
        font-family: var(--font, 'Press Start 2P', monospace);
        color: #eee;
        transition: top .28s cubic-bezier(.4,0,.2,1), left .28s cubic-bezier(.4,0,.2,1);
      }
      #tut-tooltip .tut-title {
        font-size: 12px; color: var(--accent, #9b6bdb);
        margin: 0 0 10px; line-height: 1.5;
      }
      #tut-tooltip .tut-body {
        font-size: 10px; line-height: 2; color: #cfcfe0;
        font-family: 'Fira Code', monospace; margin: 0 0 14px;
      }
      #tut-tooltip .tut-body b { color: #fff; }
      #tut-tooltip .tut-foot {
        display: flex; align-items: center; gap: 8px;
      }
      #tut-tooltip .tut-dots { display: flex; gap: 5px; margin-right: auto; }
      #tut-tooltip .tut-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--panel-border, #2a2a3e); transition: background .2s;
      }
      #tut-tooltip .tut-dot.on { background: var(--accent, #9b6bdb); }
      #tut-tooltip button {
        font-family: var(--font, 'Press Start 2P', monospace);
        font-size: 9px; cursor: pointer; border-radius: 6px;
        padding: 8px 12px; border: 2px solid var(--panel-border, #2a2a3e);
        background: #1c1c2b; color: #ddd; transition: all .15s;
      }
      #tut-tooltip button:hover { border-color: var(--accent, #9b6bdb); color: #fff; }
      #tut-tooltip button.tut-primary {
        background: var(--accent, #9b6bdb); border-color: var(--accent, #9b6bdb); color: #fff;
      }
      #tut-tooltip button.tut-primary:hover { filter: brightness(1.12); }
      #tut-tooltip .tut-skip {
        position: absolute; top: 10px; right: 12px;
        background: none; border: none; color: #888; font-size: 9px; padding: 2px 4px;
      }
      #tut-tooltip .tut-skip:hover { color: #fff; }
      #tut-help-btn {
        position: fixed; left: 14px; bottom: 14px; z-index: 9500;
        width: 34px; height: 34px; border-radius: 50%;
        background: var(--panel-bg, #13131f); color: var(--accent, #9b6bdb);
        border: 2px solid var(--accent, #9b6bdb); cursor: pointer;
        font-family: var(--font, 'Press Start 2P', monospace); font-size: 12px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.5); opacity: 0.65; transition: opacity .15s, transform .15s;
      }
      #tut-help-btn:hover { opacity: 1; transform: scale(1.08); }
      @media (max-width: 640px) {
        #tut-tooltip .tut-title { font-size: 10px; }
        #tut-help-btn { width: 30px; height: 30px; font-size: 11px; }
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

    // Clicking the dim backdrop does nothing (prevents accidental app clicks)
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

  // ── Render a step ────────────────────────────────────────────
  function render() {
    const step = STEPS[idx];
    const { backdrop, spotlight, tooltip } = els;

    if (step.expand) ensureExpanded(step.expand);

    const targetEl = step.target ? document.querySelector(step.target) : null;
    const rect = targetEl ? targetEl.getBoundingClientRect() : null;
    const hasSpot = rect && rect.width > 0 && rect.height > 0;

    // Spotlight
    if (hasSpot) {
      backdrop.classList.remove('dim');
      spotlight.style.display = 'block';
      const pad = 8;
      spotlight.style.top    = Math.max(0, rect.top - pad) + 'px';
      spotlight.style.left   = Math.max(0, rect.left - pad) + 'px';
      spotlight.style.width  = Math.min(window.innerWidth,  rect.width  + pad * 2) + 'px';
      spotlight.style.height = Math.min(window.innerHeight, rect.height + pad * 2) + 'px';
    } else {
      backdrop.classList.add('dim');
      spotlight.style.display = 'none';
    }

    // Tooltip content
    const dots = STEPS.map((_, i) => `<span class="tut-dot ${i === idx ? 'on' : ''}"></span>`).join('');
    const isLast = idx === STEPS.length - 1;
    const isFirst = idx === 0;
    tooltip.innerHTML = `
      <button class="tut-skip" data-act="skip" title="Skip tour">✕ skip</button>
      <div class="tut-title">${step.title}</div>
      <div class="tut-body">${step.body}</div>
      <div class="tut-foot">
        <div class="tut-dots">${dots}</div>
        ${isFirst ? '' : '<button data-act="back">◀ Back</button>'}
        <button class="tut-primary" data-act="next">${isLast ? '✓ Done' : 'Next ▶'}</button>
      </div>
    `;
    tooltip.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        try { window.SoundManager?.play('click'); } catch (_) {}
        const act = b.dataset.act;
        if (act === 'next') isLast ? finish(true) : go(1);
        else if (act === 'back') go(-1);
        else if (act === 'skip') finish(false);
      });
    });

    positionTooltip(rect, step.placement);
  }

  // ── Tooltip positioning ──────────────────────────────────────
  function positionTooltip(rect, placement) {
    const tip = els.tooltip;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top, left;

    if (!rect || placement === 'center') {
      // No target, or explicitly centered on screen
      if (!rect) {
        top = (vh - th) / 2;
        left = (vw - tw) / 2;
      } else {
        // Center of the target region (used for the game canvas steps)
        top = rect.top + rect.height / 2 - th / 2;
        left = rect.left + rect.width / 2 - tw / 2;
      }
    } else {
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow > th + GAP + 8) {
        top = rect.bottom + GAP;                       // below
      } else if (spaceAbove > th + GAP + 8) {
        top = rect.top - th - GAP;                     // above
      } else {
        top = Math.max(8, (vh - th) / 2);              // fallback: middle
      }
      left = rect.left + rect.width / 2 - tw / 2;       // horizontally centered on target
    }

    // Clamp to viewport
    top  = Math.max(8, Math.min(top,  vh - th - 8));
    left = Math.max(8, Math.min(left, vw - tw - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }

  // ── Navigation ───────────────────────────────────────────────
  function go(dir) {
    idx = Math.max(0, Math.min(STEPS.length - 1, idx + dir));
    render();
  }

  function finish(completed) {
    if (!active) return;
    active = false;
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
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); idx === STEPS.length - 1 ? finish(true) : go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }

  let reflowRaf = null;
  function onReflow() {
    if (reflowRaf) cancelAnimationFrame(reflowRaf);
    reflowRaf = requestAnimationFrame(render);
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
    render();
  }

  function maybeStart() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (_) {}
    ensureHelpButton();
    if (seen) return;
    // Small delay so the game canvas & panels have laid out
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
