/**
 * PixelSprites.js
 * Supports all 20 premade characters (01–20). Each player gets a randomly
 * assigned character (persisted in localStorage). Textures for the local player
 * use the prefix "player_"; other players use "char_{nn}_".
 *
 * Sprite sheet layout (each animation block = 2 rows × 32px = 64px tall):
 *   r1-2   y=0    Profile stills: left|back|right|front (cols 0-3)
 *   r3-4   y=64   Idle (front-facing)
 *   r5-6   y=128  Walk: left(c0-5)|back(c6-11)|right(c12-17)|front(c18-23)
 *   r7-8   y=192  Sleep
 *   r9-10  y=256  Sit with legs: left(c0-5)|back(c6-11)|right(c12-17)|front(c18-23)
 *   r11-12 y=320  Sit no-legs:   left(c0-5)|back(c6-11)|right(c12-17)|front(c18-23)
 *   r13-14 y=384  Phone loop
 *   r15-16 y=448  Reading books (6-frame loop)
 */

(function () {

  const FRAME_W = 32, FRAME_H = 64;

  // Each multi-directional block: left(c0) | back(c6) | right(c12) | front(c18)
  const FRAMES = {
    up_0:            { x:  32, y:   0 },  // back still (idle facing up)
    front_still:     { x:  96, y:   0 },  // front still (col 3 in profile row)
    idle:            { x:   0, y:  64 },  // idle front-facing
    // Idle back-facing (r3-4 y=64, columns c6-11 same layout as walk)
    idle_back_0:     { x: 192, y:  64 },
    idle_back_1:     { x: 224, y:  64 },
    idle_back_2:     { x: 256, y:  64 },
    idle_back_3:     { x: 288, y:  64 },
    idle_back_4:     { x: 320, y:  64 },
    idle_back_5:     { x: 352, y:  64 },
    // Walk
    walk_0:          { x:   0, y: 128 },  // side walk f0 (left/right)
    walk_1:          { x:  32, y: 128 },  // side walk f1
    walk_2:          { x:  64, y: 128 },  // side walk f2
    walk_3:          { x:  96, y: 128 },  // side walk f3
    walk_back_0:     { x: 192, y: 128 },  // back walk f0
    walk_back_1:     { x: 224, y: 128 },
    walk_back_2:     { x: 256, y: 128 },
    walk_back_3:     { x: 288, y: 128 },
    walk_front_0:    { x: 576, y: 128 },  // front walk f0
    walk_front_1:    { x: 608, y: 128 },
    walk_front_2:    { x: 640, y: 128 },
    walk_front_3:    { x: 672, y: 128 },
    // Sit with legs (r9-10)
    sit_side:        { x:   0, y: 256 },  // right-facing sit frame 0; flip for west
    sit_side_1:      { x:  32, y: 256 },  // right-facing sit frame 1
    sit_side_2:      { x:  64, y: 256 },  // right-facing sit frame 2
    sit_side_3:      { x:  96, y: 256 },  // right-facing sit frame 3
    sit_side_4:      { x: 128, y: 256 },  // right-facing sit frame 4
    sit_side_5:      { x: 160, y: 256 },  // right-facing sit frame 5
    sit_back:        { x: 192, y: 256 },  // left-facing (west sit row only has east+west frames)
    sit_front:       { x: 576, y: 256 },  // front-facing (south) — may be blank; see _sitDown fallback
    // Sit no-legs (r11-12)
    sit_desk_side:   { x:   0, y: 320 },  // right-facing (east); flip for west
    sit_desk_back:   { x: 192, y: 320 },  // left-facing (west sit row only has east+west frames)
    sit_desk_front:  { x: 576, y: 320 },  // front-facing (south) — may be blank
    // Reading (r15-16) — front-facing (c0-5) and back-facing (c6-11)
    read_0:          { x:   0, y: 448 },
    read_1:          { x:  32, y: 448 },
    read_2:          { x:  64, y: 448 },
    read_3:          { x:  96, y: 448 },
    read_4:          { x: 128, y: 448 },
    read_5:          { x: 160, y: 448 },
    read_back_0:     { x: 192, y: 448 },
    read_back_1:     { x: 224, y: 448 },
    read_back_2:     { x: 256, y: 448 },
    read_back_3:     { x: 288, y: 448 },
    read_back_4:     { x: 320, y: 448 },
    read_back_5:     { x: 352, y: 448 },
    read_front_0:    { x: 576, y: 448 },
    read_front_1:    { x: 608, y: 448 },
    read_front_2:    { x: 640, y: 448 },
    read_front_3:    { x: 672, y: 448 },
    read_front_4:    { x: 704, y: 448 },
    read_front_5:    { x: 736, y: 448 },
  };

  function sheetKey(nn) { return `premade_char_${nn}`; }

  function extractFrame(scene, srcX, srcY, destKey, sheet) {
    if (scene.textures.exists(destKey)) scene.textures.remove(destKey);
    const source = scene.textures.get(sheet).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = FRAME_W; cv.height = FRAME_H;
    cv.getContext('2d').drawImage(source, srcX, srcY, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
    scene.textures.addCanvas(destKey, cv);
  }

  function buildCharTextures(scene, nn, prefix) {
    const sheet = sheetKey(nn);
    if (!scene.textures.exists(sheet)) return;
    for (const [pose, { x, y }] of Object.entries(FRAMES)) {
      extractFrame(scene, x, y, `${prefix}_${pose}`, sheet);
    }
  }

  // ── Status icon helpers ────────────────────────────────────────────────────

  const SCALE = 2;

  function makeIconTexture(scene, key, w, h, drawFn) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const ct = scene.textures.createCanvas(key, w, h);
    const ctx = ct.getContext();
    ctx.clearRect(0, 0, w, h);
    drawFn(ctx);
    ct.refresh();
  }

  function _drawGrid(ctx, S, grid) {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        if (grid[r][c]) { ctx.fillStyle = grid[r][c]; ctx.fillRect(c*S, r*S, S, S); }
  }

  // Book flip animation — 6 frames at 24×24px (8×8 grid at S=3)
  // B=border, P=page, L=text line, W=page-in-flight, _=transparent
  const _BS = 3; // book icon scale
  const _BB = '#3D2B1F', _BP = '#F5E6C8', _BL = '#8070B0', _BW = '#FFFEF0';

  // Frame 0 — both pages flat (pause frame, used twice in animation)
  function drawIconBook(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [_,B,B,B,B,B,B,_],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  // Frame 1 — right page corner peels up
  function drawIconBook1(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [_,B,B,B,B,B,W,_],
      [B,P,P,B,B,P,B,_],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  // Frame 2 — page arcing high (right side shrinks, wide arc above spine)
  function drawIconBook2(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [_,B,W,W,W,W,_,_],
      [B,P,P,B,B,_,_,_],
      [B,P,L,B,B,P,B,_],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  // Frame 3 — page at peak, spanning the full width above the book
  function drawIconBook3(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [W,W,W,W,W,W,W,W],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  // Frame 4 — page descending on left side, right page now exposes more
  function drawIconBook4(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [_,_,W,W,W,W,B,_],
      [_,_,_,B,B,P,P,B],
      [_,B,P,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  // Frame 5 — page just landed on left side
  function drawIconBook5(ctx) {
    const [B,P,L,W,_] = [_BB,_BP,_BL,_BW,null];
    _drawGrid(ctx, _BS, [
      [_,W,B,B,B,B,B,_],
      [_,B,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [B,P,L,B,B,L,P,B],
      [B,P,P,B,B,P,P,B],
      [_,B,B,B,B,B,B,_],
      [_,_,B,_,_,B,_,_],
    ]);
  }

  function drawIconCoffee(ctx) {
    const S = SCALE;
    const c = [
      [null,null,0xC87820,null,null,null,null,null],
      [null,null,null,0xC87820,0xC87820,null,null,null],
      [null,0x8B5E3C,0x8B5E3C,0x8B5E3C,0x8B5E3C,0x8B5E3C,null,null],
      [null,0x8B5E3C,0xC87820,0xC87820,0xC87820,0x8B5E3C,0x6B4A2E,null],
      [null,0x8B5E3C,0xE8A020,0xD09030,0xE8A020,0x8B5E3C,0x6B4A2E,null],
      [null,0x8B5E3C,0x8B5E3C,0x8B5E3C,0x8B5E3C,0x8B5E3C,null,null],
      [null,null,0x6B4A2E,0x6B4A2E,0x6B4A2E,0x6B4A2E,null,null],
      [null,null,null,null,null,null,null,null],
    ];
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      if (c[r][col]) {
        ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
        ctx.fillRect(col*S, r*S, S, S);
      }
    }
  }

  function drawIconPause(ctx) {
    const S = SCALE, CLOUD = 0xB0A8C8, BAR = 0x2A2040;
    const c = [
      [null,null,CLOUD,CLOUD,CLOUD,CLOUD,null,null],
      [null,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,null],
      [CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD],
      [CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD],
      [null,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,CLOUD,null],
      [null,null,BAR,BAR,BAR,BAR,null,null],
      [null,null,BAR,null,null,BAR,null,null],
      [null,null,BAR,null,null,BAR,null,null],
    ];
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      if (c[r][col]) {
        ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
        ctx.fillRect(col*S, r*S, S, S);
      }
    }
  }

  function drawIconFork(ctx) {
    const S = SCALE, METAL = 0xD0C8A0, DARK = 0x706840;
    const c = [
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,DARK,null,null],
      [null,METAL,null,null,DARK,DARK,null,null],
      [METAL,METAL,METAL,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
    ];
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      if (c[r][col]) {
        ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
        ctx.fillRect(col*S, r*S, S, S);
      }
    }
  }

  function drawIconFire(ctx) {
    const S = SCALE, OUTER = 0xE05820, MID = 0xF0A020, INNER = 0xFFE040;
    const c = [
      [null,null,null,MID,null,null,null,null],
      [null,null,MID,MID,OUTER,null,null,null],
      [null,OUTER,MID,INNER,MID,OUTER,null,null],
      [null,OUTER,MID,INNER,INNER,MID,OUTER,null],
      [OUTER,MID,INNER,INNER,INNER,INNER,MID,OUTER],
      [OUTER,MID,INNER,INNER,INNER,INNER,MID,OUTER],
      [null,OUTER,MID,INNER,INNER,MID,OUTER,null],
      [null,null,OUTER,MID,MID,OUTER,null,null],
    ];
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      if (c[r][col]) {
        ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
        ctx.fillRect(col*S, r*S, S, S);
      }
    }
  }

  function drawIconRelax(ctx) {
    const S = SCALE;
    const Z1 = 0xC090F0, Z2 = 0xA070D0, Z3 = 0x8050B0;
    ctx.fillStyle = '#' + Z1.toString(16); ctx.fillRect(3*S,0,5*S,S); ctx.fillRect(6*S,S,2*S,S); ctx.fillRect(3*S,2*S,5*S,S);
    ctx.fillStyle = '#' + Z2.toString(16); ctx.fillRect(1*S,3*S,5*S,S); ctx.fillRect(4*S,4*S,2*S,S); ctx.fillRect(1*S,5*S,5*S,S);
    ctx.fillStyle = '#' + Z3.toString(16); ctx.fillRect(0,6*S,4*S,S); ctx.fillRect(2*S,7*S,2*S,S);
  }

  function drawIconLaundry(ctx) {
    const S = SCALE, BUBBLE = 0x60C0F0, WATER = 0x3090D0, SHINE = 0xB0E8FF;
    ctx.fillStyle = '#' + WATER.toString(16);
    ctx.fillRect(3*S,1*S,2*S,S); ctx.fillRect(2*S,2*S,4*S,S); ctx.fillRect(1*S,3*S,6*S,S);
    ctx.fillRect(1*S,4*S,6*S,S); ctx.fillRect(2*S,5*S,4*S,S); ctx.fillRect(3*S,6*S,2*S,S);
    ctx.fillStyle = '#' + SHINE.toString(16); ctx.fillRect(2*S,3*S,S,S);
    ctx.fillStyle = '#' + BUBBLE.toString(16);
    ctx.fillRect(6*S,0,2*S,S); ctx.fillRect(5*S,S,4*S,S); ctx.fillRect(6*S,2*S,2*S,S);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.PixelSprites = {

    /** Pick or retrieve a persistent random charNum (01–20) for the local player.
     *  Stored in cc_session so it follows the user's login across browsers/tabs. */
    getOrAssignCharNum() {
      // 1. Prefer charNum saved inside the login session (consistent across devices)
      try {
        const sess = JSON.parse(localStorage.getItem('cc_session') || '{}');
        if (sess.charNum && /^\d{2}$/.test(sess.charNum) &&
            parseInt(sess.charNum) >= 1 && parseInt(sess.charNum) <= 20) {
          return sess.charNum;
        }
      } catch(e) {}

      // 2. Fall back to the bare localStorage key
      let nn = localStorage.getItem('studyspace_charNum');
      if (!nn || !/^\d{2}$/.test(nn) || parseInt(nn) < 1 || parseInt(nn) > 20) {
        nn = String(Math.floor(Math.random() * 20) + 1).padStart(2, '0');
        localStorage.setItem('studyspace_charNum', nn);
      }

      // 3. Persist into cc_session so future sessions (and other browsers) match
      try {
        const sess = JSON.parse(localStorage.getItem('cc_session') || '{}');
        if (sess && typeof sess === 'object') {
          sess.charNum = nn;
          localStorage.setItem('cc_session', JSON.stringify(sess));
        }
      } catch(e) {}

      return nn;
    },

    /** Build player_* textures from the local player's assigned char sheet. */
    createAllTextures(scene, nn) {
      buildCharTextures(scene, nn, 'player');

      makeIconTexture(scene, 'icon_book',    24, 24, drawIconBook);
      makeIconTexture(scene, 'icon_book_0',  24, 24, drawIconBook);
      makeIconTexture(scene, 'icon_book_1',  24, 24, drawIconBook1);
      makeIconTexture(scene, 'icon_book_2',  24, 24, drawIconBook2);
      makeIconTexture(scene, 'icon_book_3',  24, 24, drawIconBook3);
      makeIconTexture(scene, 'icon_book_4',  24, 24, drawIconBook4);
      makeIconTexture(scene, 'icon_book_5',  24, 24, drawIconBook5);
      makeIconTexture(scene, 'icon_coffee',  16, 16, drawIconCoffee);
      makeIconTexture(scene, 'icon_pause',   16, 16, drawIconPause);
      makeIconTexture(scene, 'icon_fork',    16, 16, drawIconFork);
      makeIconTexture(scene, 'icon_fire',    16, 16, drawIconFire);
      makeIconTexture(scene, 'icon_relax',   16, 16, drawIconRelax);
      makeIconTexture(scene, 'icon_laundry', 16, 16, drawIconLaundry);
    },

    /**
     * Ensure char_{nn}_* textures exist for an other-player's character.
     * Returns the prefix string to use (e.g. "char_07").
     */
    ensureCharTextures(scene, nn) {
      const prefix = `char_${nn}`;
      if (!scene.textures.exists(`${prefix}_idle`)) {
        buildCharTextures(scene, nn, prefix);
      }
      return prefix;
    },

    /** Legacy shims. */
    nameToCharIdx() { return 1; },
    charNum()       { return '01'; },
    createPlayerTextures(scene) {
      if (!scene.textures.exists('player_idle')) {
        buildCharTextures(scene, this.getOrAssignCharNum(), 'player');
      }
    },
    setShirtColor() {},
  };
})();
