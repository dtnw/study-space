/**
 * landing.js — Belong Here lobby page
 * Fetches available study spaces and renders room cards.
 * Uses Socket.io for real-time live-status updates.
 */

// ── Consume OAuth callback session ────────────────────────
(async function _consumePsid() {
  const params = new URLSearchParams(location.search);
  const psid = params.get('psid');
  const googleErr = params.get('google');
  if (googleErr === 'error') { history.replaceState({}, '', '/'); /* will show toast after loadSpaces */ }
  if (!psid) return;
  history.replaceState({}, '', '/');
  try {
    const res = await fetch('/api/session/' + encodeURIComponent(psid));
    if (!res.ok) return;
    const data = await res.json();
    localStorage.setItem('cc_session', JSON.stringify({
      name:        data.name,
      twitchLogin: data.twitchLogin  || null,
      twitchEmail: data.twitchEmail  || null,
      googleEmail: data.googleEmail  || null,
      profilePic:  data.profilePic   || null,
      authType:    data.authType     || 'twitch',
      expiresAt:   Date.now() + 7 * 24 * 60 * 60 * 1000,
    }));
    _updateLandingHeader();

    // After OAuth, check if we need to show appearance picker
    const session = _getSession();
    const pendingRoom = sessionStorage.getItem('cc_pending_room');
    if (session && (!session.gender || !session.shirtColor)) {
      // New OAuth user — needs to pick appearance before entering
      if (pendingRoom) {
        sessionStorage.removeItem('cc_pending_room');
        _showAppearancePrompt(pendingRoom);
      } else {
        // No pending room — still show appearance picker so it's ready for later
        _showAppearancePrompt(null);
      }
    } else if (pendingRoom) {
      // Already has appearance, just navigate
      sessionStorage.removeItem('cc_pending_room');
      window.location.href = pendingRoom;
    }
  } catch(e) {}
})();

function _getSession() {
  try {
    const raw = localStorage.getItem('cc_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { localStorage.removeItem('cc_session'); return null; }
    return s;
  } catch(e) { return null; }
}

function _updateLandingHeader() {
  const session   = _getSession();
  const authArea  = document.getElementById('lp-auth-area');
  const heroAuth  = document.getElementById('lp-hero-auth');
  const hasSession = !!session;
  const isOAuth    = session && session.authType !== 'guest';
  const isGuest    = session && session.authType === 'guest';

  // Header pill — show for both OAuth and named guests
  if (authArea) {
    if (isOAuth) {
      authArea.innerHTML = `
        <div class="lp-user-pill">
          ${session.profilePic ? `<img src="${esc(session.profilePic)}" class="lp-user-avatar" alt="" />` : ''}
          <span class="lp-user-name">${esc(session.name)}</span>
          <button class="lp-signout-btn" onclick="window._signOut()">Sign out</button>
        </div>`;
    } else if (isGuest && session.name) {
      authArea.innerHTML = `
        <div class="lp-user-pill lp-guest-pill">
          <span class="lp-guest-icon">👤</span>
          <span class="lp-user-name">${esc(session.name)} <span style="font-size:5px;color:#888">(guest)</span></span>
          <button class="lp-signout-btn" onclick="window._signOut()">Sign out</button>
        </div>`;
    } else {
      authArea.innerHTML = '';
    }
  }

  // Hero sign-in buttons: hide when already signed in (OAuth or guest)
  if (heroAuth) {
    if (hasSession) {
      heroAuth.classList.add('hidden');
    } else {
      heroAuth.classList.remove('hidden');
    }
  }
}

window._signOut = function() {
  localStorage.removeItem('cc_session');
  _updateLandingHeader();
  // Broadcast sign-out so other landing-page tabs also update
  try { new BroadcastChannel('cc_landing_tab').postMessage({ type: 'signOut' }); } catch(e) {}
};


// ── Landing-page tab enforcement (all auth types inc. guests) ──
(function _landingTabGuard() {
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cc_landing_tab') : null;
  if (!ch) return;
  ch.onmessage = (e) => {
    if (e.data?.type === 'signOut') { _updateLandingHeader(); }
  };
})();

// ── Star canvas ────────────────────────────────────────────
(function () {
  const canvas = document.getElementById('star-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = Array.from({ length: 180 }, () => ({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height,
      r:    Math.random() * 1.2 + 0.2,
      a:    Math.random(),
      spd:  Math.random() * 0.004 + 0.001,
      dir:  Math.random() < 0.5 ? 1 : -1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.a += s.spd * s.dir;
      if (s.a >= 1 || s.a <= 0) s.dir *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,210,255,${s.a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
})();

// ── Space rendering ────────────────────────────────────────
const grid = document.getElementById('spaces-grid');
const liveBadge = document.getElementById('live-count-badge');

function renderSpaces(spaces) {
  if (!grid) return;
  if (!spaces || spaces.length === 0) {
    grid.innerHTML = '<div class="lp-no-spaces">No spaces configured yet.<br/><br/>Check back soon! 🌷</div>';
    return;
  }

  const liveCount = spaces.filter(s => s.live).length;
  if (liveBadge) {
    if (liveCount > 0) {
      liveBadge.textContent = liveCount + ' LIVE';
      liveBadge.classList.remove('hidden');
    } else {
      liveBadge.classList.add('hidden');
    }
  }

  grid.innerHTML = spaces.map(space => {
    const isLive   = !!space.live;
    const cls      = isLive ? 'live' : 'offline';
    const badge    = isLive ? '<span class="room-live-badge live">🔴 LIVE</span>' : '<span class="room-live-badge offline">OFFLINE</span>';
    const viewers  = isLive
      ? '<span class="room-viewer-count">👁 ' + space.viewerCount + '</span>'
      : '<span class="room-viewer-count hidden"></span>';
    const title    = space.streamTitle
      ? '<div class="room-card-stream-title">"' + esc(space.streamTitle) + '"</div>'
      : (isLive ? '' : '<div class="room-card-stream-title" style="color:#555">Not streaming right now</div>');
    const game     = space.gameName ? '<div class="room-card-game">🎮 ' + esc(space.gameName) + '</div>' : '';
    const players  = '<div class="room-card-players">👥 ' + (space.playersOnline || 0) + ' ' + (space.playersOnline === 1 ? 'person' : 'people') + ' in the space</div>';
    const defaultIcon   = space.theme === 'cafe' ? '☕' : '🌷';
    const bannerContent = space.creatorAvatar
      ? `<img src="${esc(space.creatorAvatar)}" alt="" class="room-banner-avatar" />`
      : `<span class="room-banner-icon">${defaultIcon}</span>`;
    const enterBtn = isLive
      ? `<a href="${esc(space.roomPath)}" class="room-enter-btn" onclick="event.stopPropagation()">Enter Space →</a>`
      : `<a href="${esc(space.roomPath)}" class="room-enter-btn room-enter-offline" onclick="event.stopPropagation()">Enter Space (Offline)</a>`;

    return `
      <div class="room-card ${cls}" onclick="enterSpace('${esc(space.roomPath)}')">
        <div class="room-card-banner">
          ${bannerContent}
          ${badge}
          ${viewers}
        </div>
        <div class="room-card-body">
          <div class="room-card-name">${esc(space.name)}</div>
          <div class="room-card-streamer">@${esc(space.twitchLogin || space.id)}</div>
          ${title}
          ${game}
          ${players}
          ${enterBtn}
        </div>
      </div>`;
  }).join('');
}

/**
 * enterSpace — called when user clicks a room card.
 * Sequential flow:
 *   1. No session → sign-in prompt
 *   2. Has session but no appearance → appearance prompt
 *   3. All set → navigate
 */
function enterSpace(path) {
  const session = _getSession();
  if (!session) {
    _showSignInPrompt(path);
    return;
  }
  if (!session.gender) {
    // Auto-assign appearance from name — no prompt needed
    try {
      const sess = JSON.parse(localStorage.getItem('cc_session') || '{}');
      sess.gender = 'auto'; sess.shirtColor = 'auto';
      localStorage.setItem('cc_session', JSON.stringify(sess));
    } catch(_) {}
  }
  window.location.href = path;
}

/**
 * Step 1 — Sign-in method selection.
 * Twitch/Google save targetPath to sessionStorage then redirect to OAuth.
 * Guest proceeds directly to appearance prompt.
 */
function _showSignInPrompt(targetPath) {
  // Remove any existing modal
  document.getElementById('signin-prompt-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'signin-prompt-modal';
  modal.className = 'lp-modal-overlay';
  modal.innerHTML = `
    <div class="lp-modal-box signin-prompt-box">
      <h2 class="lp-modal-title">JOIN THE SPACE</h2>
      <p class="lp-modal-sub">Sign in to save your coins, tasks, and friends.</p>
      <button class="lp-twitch-signin-btn" id="sp-twitch-btn" style="display:block;width:100%;text-align:center;margin-bottom:10px;border:none;cursor:pointer;font-family:var(--font)">🟣 Sign in with Twitch</button>
      <button class="lp-google-signin-btn" id="sp-google-btn" style="display:block;width:100%;text-align:center;margin-bottom:16px;border:none;cursor:pointer;font-family:var(--font)">🔵 Sign in with Google</button>

      <div style="text-align:center">
        <a href="#" class="lp-guest-link" id="sp-guest-link">Continue as guest →</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#sp-twitch-btn')?.addEventListener('click', () => {
    modal.remove();
    _startOAuthSignIn('twitch', targetPath);
  });
  modal.querySelector('#sp-google-btn')?.addEventListener('click', () => {
    modal.remove();
    _startOAuthSignIn('google', targetPath);
  });
  modal.querySelector('#sp-guest-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal.remove();
    _showGuestNamePrompt(targetPath);
  });
}

/**
 * Saves targetPath to sessionStorage and redirects to OAuth provider.
 * After OAuth completes and psid is consumed, _consumePsid will auto-show
 * the appearance prompt using the saved path.
 */
function _startOAuthSignIn(provider, targetPath) {
  if (targetPath) {
    sessionStorage.setItem('cc_pending_room', targetPath);
  }
  if (provider === 'twitch') {
    window.location.href = '/auth/twitch?role=player';
  } else {
    window.location.href = '/auth/google';
  }
}

/**
 * Step 2 (OAuth path) — Appearance picker for Twitch/Google users.
 * Name comes from OAuth so only gender + color are needed.
 * On save: updates cc_session, then navigates to targetPath (or stays if null).
 */
function _showAppearancePrompt(targetPath) {
  // Auto-assign appearance from name — no user picker needed
  const raw = localStorage.getItem('cc_session');
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      sess.gender = 'auto'; sess.shirtColor = 'auto';
      localStorage.setItem('cc_session', JSON.stringify(sess));
    } catch(_) {}
  }
  if (targetPath) {
    window.location.href = targetPath;
  } else {
    _updateLandingHeader();
    document.getElementById('spaces-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Step 2 (Guest path) — Name + appearance picker.
 * Saves guest session and stays on landing page (no navigation).
 * If a session already exists (from another tab or earlier visit), don't re-prompt.
 */
function _showGuestNamePrompt(targetPath) {
  // Block creating a second identity if any session (guest or OAuth) already active
  const existing = _getSession();
  if (existing && existing.name) {
    if (targetPath) window.location.href = targetPath;
    else document.getElementById('spaces-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  document.getElementById('guest-name-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'guest-name-modal';
  modal.className = 'lp-modal-overlay';
  modal.innerHTML = `
    <div class="lp-modal-box signin-prompt-box">
      <h2 class="lp-modal-title">ENTER THE SPACE</h2>
      <p class="lp-modal-sub">Your character is auto-generated from your name.</p>

      <input type="text" id="guest-name-input" class="lp-name-input" placeholder="Enter your name…" maxlength="20" autocomplete="off" />
      <p id="guest-name-error" style="color:#ff6b6b;font-size:7px;min-height:14px;margin:4px 0 0;text-align:left"></p>
      <button id="guest-name-submit" class="lp-twitch-signin-btn" style="display:block;width:100%;margin-top:8px;border:none;cursor:pointer;font-family:var(--font)">✔ Enter</button>
      <div style="text-align:center;margin-top:12px">
        <a href="#" id="guest-back-to-signin" class="lp-guest-link">← Back to sign in options</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  const input  = modal.querySelector('#guest-name-input');
  const errEl  = modal.querySelector('#guest-name-error');
  const submit = modal.querySelector('#guest-name-submit');
  setTimeout(() => input?.focus(), 60);

  function doEnter() {
    const name = input?.value.trim();
    if (!name) { if (errEl) errEl.textContent = 'Please enter a name!'; input?.focus(); return; }
    // Save guest session — stay on landing so they can click the room card themselves
    localStorage.setItem('cc_session', JSON.stringify({
      name, twitchLogin: null, googleEmail: null, profilePic: null,
      authType: 'guest', gender: 'auto', shirtColor: 'auto',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }));
    _updateLandingHeader();
    modal.remove();
    // Scroll room cards into view so user can click to enter
    document.getElementById('spaces-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  submit?.addEventListener('click', doEnter);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doEnter(); });
  modal.querySelector('#guest-back-to-signin')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal.remove();
    _showSignInPrompt(targetPath);
  });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Fetch spaces on load ───────────────────────────────────
async function loadSpaces() {
  try {
    const res  = await fetch('/api/spaces');
    const data = await res.json();
    renderSpaces(data);
  } catch (e) {
    if (grid) grid.innerHTML = '<div class="lp-no-spaces">Could not load spaces. Please try again. 🌷</div>';
  }
}

loadSpaces();

(function() {
  const _p = new URLSearchParams(location.search);
  if (_p.get('showInterest') === '1') {
    history.replaceState({}, '', '/');
    setTimeout(() => openCreatorModal(), 400);
  }
  if (_p.get('msg') === 'offline') {
    const banner = document.createElement('div');
    banner.className = 'lp-offline-banner';
    banner.innerHTML = '⚠️ That space is offline right now. Check back when Derby goes live!';
    const main = document.querySelector('.lp-main');
    if (main) main.prepend(banner);
    history.replaceState({}, '', '/');
  }
})();

// ── Real-time updates via Socket.io ───────────────────────
try {
  const socket = io();
  socket.on('spaceStatus', () => loadSpaces());  // re-fetch on any live status change
} catch(e) {}

// Update header on load
_updateLandingHeader();

function openCreatorModal() {
  const modal = document.getElementById('creator-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  // Pre-fill from current session if signed in
  const session = _getSession();
  if (session) {
    const nameEl   = document.getElementById('interest-name');
    const emailEl  = document.getElementById('interest-email');
    const twitchEl = document.getElementById('interest-twitch');
    if (nameEl   && !nameEl.value   && session.name)        nameEl.value   = session.name;
    if (emailEl  && !emailEl.value  && (session.twitchEmail || session.googleEmail))
      emailEl.value = session.twitchEmail || session.googleEmail;
    if (twitchEl && !twitchEl.value && session.twitchLogin) twitchEl.value = '@' + session.twitchLogin;
  }
  setTimeout(() => document.getElementById('interest-name')?.focus(), 50);
}
function closeCreatorModal() {
  document.getElementById('creator-modal')?.classList.add('hidden');
}

document.getElementById('interest-submit')?.addEventListener('click', async () => {
  const name     = document.getElementById('interest-name')?.value.trim();
  const email    = document.getElementById('interest-email')?.value.trim();
  const twitch   = document.getElementById('interest-twitch')?.value.trim();
  const spaceFor = document.querySelector('input[name="spaceFor"]:checked')?.value || null;
  const message  = document.getElementById('interest-message')?.value.trim();
  const errEl    = document.getElementById('interest-error');
  const succEl   = document.getElementById('interest-success');
  if (errEl) errEl.textContent = '';
  if (!email) { if (errEl) errEl.textContent = 'Please enter your email address.'; return; }
  if (!spaceFor) { if (errEl) errEl.textContent = 'Please tell us who the space is for.'; return; }
  const btn = document.getElementById('interest-submit');
  if (btn) btn.disabled = true;
  try {
    const res  = await fetch('/api/streamer-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, twitchHandle: twitch, spaceFor, message }),
    });
    const data = await res.json();
    if (data.ok) {
      if (succEl) succEl.classList.remove('hidden');
      if (btn) btn.style.display = 'none';
    } else {
      if (errEl) errEl.textContent = data.error || 'Something went wrong. Try again.';
      if (btn) btn.disabled = false;
    }
  } catch(e) {
    if (errEl) errEl.textContent = 'Network error. Try again.';
    if (btn) btn.disabled = false;
  }
});

// ── Create a Room modal ───────────────────────────────────────────────────────
function openCreateRoomModal() {
  const modal = document.getElementById('create-room-modal');
  if (!modal) return;
  // Reset state
  document.getElementById('cr-error').textContent = '';
  document.getElementById('cr-code-input').value = '';
  document.getElementById('cr-success').classList.add('hidden');
  document.getElementById('cr-code-form').classList.remove('hidden');
  document.getElementById('cr-not-signed-in').classList.add('hidden');

  const session = _getSession();
  const hasTwitch = !!(session?.twitchLogin);
  if (!hasTwitch) {
    document.getElementById('cr-not-signed-in').classList.remove('hidden');
    document.getElementById('cr-code-form').classList.add('hidden');
  }
  modal.classList.remove('hidden');
  if (hasTwitch) setTimeout(() => document.getElementById('cr-code-input')?.focus(), 50);
}

function closeCreateRoomModal() {
  document.getElementById('create-room-modal')?.classList.add('hidden');
}

async function submitCreateRoom() {
  const code  = document.getElementById('cr-code-input')?.value.trim().toUpperCase();
  const errEl = document.getElementById('cr-error');
  const btn   = document.getElementById('cr-submit');
  const session = _getSession();

  errEl.textContent = '';
  if (!code) { errEl.textContent = 'Please enter your invite code.'; return; }
  if (!session?.twitchLogin) { errEl.textContent = 'Sign in with Twitch first.'; return; }

  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const res  = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, twitchLogin: session.twitchLogin, twitchDisplayName: session.name }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('cr-code-form').classList.add('hidden');
      const succ    = document.getElementById('cr-success');
      const msg     = document.getElementById('cr-success-msg');
      const enterBtn = document.getElementById('cr-enter-btn');
      const displayUrl = 'belonghere.cc' + data.roomPath;
      msg.innerHTML = data.alreadyExists
        ? `You already have a room! It lives at <strong>${displayUrl}</strong>`
        : `🎉 Your room is ready at <strong>${displayUrl}</strong> — go make it cozy!`;
      enterBtn.href = data.roomPath;
      succ.classList.remove('hidden');
    } else {
      errEl.textContent = data.error || 'Invalid code.';
      btn.disabled = false;
      btn.textContent = '🚀 Create My Room';
    }
  } catch(e) {
    errEl.textContent = 'Network error. Try again.';
    btn.disabled = false;
    btn.textContent = '🚀 Create My Room';
  }
}

// Close modals on backdrop click
document.addEventListener('click', e => {
  if (e.target.id === 'create-room-modal') closeCreateRoomModal();
});
