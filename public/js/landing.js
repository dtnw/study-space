/**
 * landing.js — Cozy Corner lobby page
 * Fetches available study spaces and renders room cards.
 * Uses Socket.io for real-time live-status updates.
 */

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
    grid.innerHTML = '<div class="lp-no-spaces">No spaces configured yet.<br/><br/>Check back soon! 🌸</div>';
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
    const btnLabel = isLive ? 'Enter Space →' : 'View Room →';

    return `
      <div class="room-card ${cls}" onclick="enterSpace('${esc(space.roomPath)}')">
        <div class="room-card-banner">
          <span class="room-banner-icon">🌸</span>
          ${badge}
          ${viewers}
        </div>
        <div class="room-card-body">
          <div class="room-card-name">${esc(space.name)}</div>
          <div class="room-card-streamer">@${esc(space.twitchLogin || space.id)}</div>
          ${title}
          ${game}
          ${players}
          <a href="${esc(space.roomPath)}" class="room-enter-btn" onclick="event.stopPropagation()">${btnLabel}</a>
        </div>
      </div>`;
  }).join('');
}

function enterSpace(path) {
  window.location.href = path;
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
    if (grid) grid.innerHTML = '<div class="lp-no-spaces">Could not load spaces. Please try again. 🌸</div>';
  }
}

loadSpaces();

// ── Real-time updates via Socket.io ───────────────────────
try {
  const socket = io();
  socket.on('spaceStatus', () => loadSpaces());  // re-fetch on any live status change
} catch(e) {}
