/**
 * PixelSprites.js
 * Generates all player textures using Phaser canvas textures.
 *
 * Sprite size: 16 × 24 logical pixels @ 2 px/pixel = 32 × 48 display pixels.
 * Chibi style: big head (~10 rows), short body (~14 rows).
 *
 * Texture keys:
 *   player_male_down_0   player_male_down_1
 *   player_male_up_0     player_male_up_1
 *   player_male_right_0  player_male_right_1   (left = setFlipX)
 *   player_male_sit
 *   player_female_down_0 …  (same pattern)
 *   icon_book            icon_coffee           (8 × 8 @ 2 px)
 *   icon_pause                                 (8 × 8 @ 2 px)
 */

(function () {
  const SCALE = 2;   // logical → display px
  const W = 16, H = 24;
  const DW = W * SCALE, DH = H * SCALE;

  // ── Colour palette ──────────────────────────────────────────────────────

  // Shared skin / hair
  const SKIN  = '#FFCBA4';
  const SKIN2 = '#E8A07A';   // blush / shadow
  const EYE   = '#1A1A2E';
  const WHITE = '#FFFFFF';

  // Hair – brown (male default)
  const HAIR_D = '#3A1F0A';   // dark
  const HAIR_M = '#5C3317';   // mid
  const HAIR_L = '#8B5E3C';   // highlight

  // Hair – black (female)
  const FHAIR_D = '#1A1A1A';
  const FHAIR_M = '#3A3A3A';
  const FHAIR_L = '#5A5A5A';

  // Male outfit – shirt colours (blue default, swappable)
  let SHIRT_D = '#5070B0';
  let SHIRT_M = '#7890D0';
  let SHIRT_L = '#98B0F0';

  const PANTS_D = '#2C4050';
  const PANTS_M = '#3D5A6B';
  const SHOES   = '#3D2B1F';

  // Female outfit – pink top, skirt
  let DRESS_D = '#B04060';
  let DRESS_M = '#D06080';
  let DRESS_L = '#F090A8';
  const SKIRT_D = '#8A3055';
  const SKIRT_M = '#B04070';

  // Accessories
  const BOW_D  = '#C02050';
  const BOW_M  = '#E04070';
  const BOW_L  = '#F87090';

  // Shirt/dress color presets
  const SHIRT_PRESETS = {
    blue:   { d: '#5070B0', m: '#7890D0', l: '#98B0F0' },
    red:    { d: '#A03030', m: '#D05050', l: '#F07070' },
    green:  { d: '#307840', m: '#50A060', l: '#70C080' },
    purple: { d: '#6840A0', m: '#9060C0', l: '#B080E0' },
  };

  let _currentShirtColor = 'blue';

  function _applyShirtColor(preset) {
    const p = SHIRT_PRESETS[preset] || SHIRT_PRESETS.blue;
    SHIRT_D = p.d;
    SHIRT_M = p.m;
    SHIRT_L = p.l;
    // Female uses dress colours tied to shirt selection
    DRESS_D = p.d;
    DRESS_M = p.m;
    DRESS_L = p.l;
  }

  // ── Draw helper ─────────────────────────────────────────────────────────

  /** Draw one logical pixel at (lx, ly) with colour `c` on a 2D context. */
  function px(ctx, lx, ly, c) {
    if (!c || c === '.' || c === ' ') return;
    ctx.fillStyle = c;
    ctx.fillRect(lx * SCALE, ly * SCALE, SCALE, SCALE);
  }

  /** Draw a row from a colour array (length must equal W). */
  function row(ctx, ly, cols) {
    for (let i = 0; i < cols.length; i++) px(ctx, i, ly, cols[i]);
  }

  // ── Male down frames ─────────────────────────────────────────────────────

  function drawMaleDown(ctx, frame) {
    // Row 0-9 = head (chibi large head)
    const _ = null;

    // Hair top
    row(ctx, 0, [_,_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_,_,_]);
    row(ctx, 1, [_,_,_,_,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_,_]);
    row(ctx, 2, [_,_,_,HAIR_D,HAIR_M,HAIR_L,HAIR_M,HAIR_M,HAIR_M,HAIR_L,HAIR_M,HAIR_M,HAIR_D,_,_,_]);
    row(ctx, 3, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    // Eyes — big cute 2×2 with white highlight
    row(ctx, 4, [_,_,_,HAIR_D,SKIN,WHITE,EYE,SKIN,SKIN,WHITE,EYE,SKIN,HAIR_D,_,_,_]);
    row(ctx, 5, [_,_,_,HAIR_D,SKIN,EYE, EYE,SKIN,SKIN,EYE, EYE,SKIN,HAIR_D,_,_,_]);
    row(ctx, 6, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    // Blush / mouth
    row(ctx, 7, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 8, [_,_,_,_,HAIR_D,SKIN2,SKIN,SKIN2,SKIN2,SKIN,SKIN2,HAIR_D,_,_,_,_]);
    row(ctx, 9, [_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_,_]);

    // Neck
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);

    // Shirt (rows 11-16)
    row(ctx, 11, [_,_,_,SHIRT_D,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_D,_,_,_,_]);
    row(ctx, 12, [_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_]);
    row(ctx, 13, [_,SHIRT_D,SHIRT_M,SHIRT_L,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_L,SHIRT_M,SHIRT_M,SHIRT_D,_,_]);
    row(ctx, 14, [_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_]);
    row(ctx, 15, [_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_]);
    row(ctx, 16, [_,_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_]);

    // Pants — just 1 row (very chibi short legs)
    row(ctx, 17, [_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_D,_,_,PANTS_D,PANTS_M,PANTS_D,_,_,_,_]);

    // Shoes immediately below (no extended pant rows)
    if (frame === 0) {
      row(ctx, 18, [_,_,_,_,SHOES,SHOES,_,_,_,_,SHOES,SHOES,_,_,_,_]);
      row(ctx, 19, [_,_,_,_,SHOES,SHOES,_,_,_,_,SHOES,SHOES,_,_,_,_]);
    } else {
      row(ctx, 18, [_,_,_,_,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,_,_,_]);
      row(ctx, 19, [_,_,_,SHOES,SHOES,SHOES,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
    }
    row(ctx, 20, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Male up frames ───────────────────────────────────────────────────────

  function drawMaleUp(ctx, frame) {
    const _ = null;
    // Back of head
    row(ctx, 0, [_,_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_,_,_]);
    row(ctx, 1, [_,_,_,_,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_,_]);
    row(ctx, 2, [_,_,_,HAIR_D,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_]);
    row(ctx, 3, [_,_,_,HAIR_D,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_]);
    row(ctx, 4, [_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_]);
    row(ctx, 5, [_,_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 6, [_,_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 7, [_,_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 8, [_,_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 9, [_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_]);
    // Neck
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);
    // Shirt back (rows 11-16)
    row(ctx, 11, [_,_,_,SHIRT_D,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_D,_,_,_,_]);
    row(ctx, 12, [_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_]);
    row(ctx, 13, [_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_]);
    row(ctx, 14, [_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_D,_,_]);
    row(ctx, 15, [_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_]);
    row(ctx, 16, [_,_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_]);
    // Pants — 1 row (chibi short)
    row(ctx, 17, [_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_D,_,_,PANTS_D,PANTS_M,PANTS_D,_,_,_,_]);
    if (frame === 0) {
      row(ctx, 18, [_,_,_,_,SHOES,SHOES,_,_,_,_,SHOES,SHOES,_,_,_,_]);
      row(ctx, 19, [_,_,_,_,SHOES,SHOES,_,_,_,_,SHOES,SHOES,_,_,_,_]);
    } else {
      row(ctx, 18, [_,_,_,_,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,_,_,_]);
      row(ctx, 19, [_,_,_,SHOES,SHOES,SHOES,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
    }
    row(ctx, 20, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Male right frames ────────────────────────────────────────────────────

  function drawMaleRight(ctx, frame) {
    const _ = null;
    // Hair flows back left — full-width side profile
    row(ctx, 0, [HAIR_D,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_,_,_,_,_,_,_]);
    row(ctx, 1, [HAIR_D,HAIR_M,HAIR_L,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_,_,_,_,_,_]);
    row(ctx, 2, [HAIR_D,HAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_M,HAIR_D,_,_,_,_,_,_,_]);
    row(ctx, 3, [_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_,_,_,_,_]);
    // Eye — 2×2 with white highlight (cols 5-6, near front/nose side)
    row(ctx, 4, [_,HAIR_D,SKIN,SKIN,SKIN,WHITE,EYE,SKIN,HAIR_D,_,_,_,_,_,_,_]);
    row(ctx, 5, [_,HAIR_D,SKIN,SKIN,SKIN,EYE,EYE,SKIN,HAIR_D,_,_,_,_,_,_,_]);
    // Nose hint
    row(ctx, 6, [_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN2,_,_,_,_,_,_,_,_]);
    // Blush / chin
    row(ctx, 7, [_,HAIR_D,SKIN2,SKIN,SKIN2,SKIN,SKIN,HAIR_D,_,_,_,_,_,_,_,_]);
    row(ctx, 8, [_,_,HAIR_D,SKIN,SKIN,SKIN,HAIR_D,_,_,_,_,_,_,_,_,_]);
    row(ctx, 9, [_,_,_,HAIR_D,HAIR_D,HAIR_D,_,_,_,_,_,_,_,_,_,_]);
    // Neck
    row(ctx, 10, [_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_,_,_,_,_]);
    // Shirt — back arm (left) + torso + front arm (right), full 10-col width
    row(ctx, 11, [SHIRT_D,SHIRT_M,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_M,SHIRT_D,_,_,_,_,_,_,_]);
    row(ctx, 12, [SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_,_,_]);
    row(ctx, 13, [SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_,_,_]);
    row(ctx, 14, [SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_,_,_,_]);
    row(ctx, 15, [_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_,_,_,_,_,_]);
    row(ctx, 16, [_,_,SHIRT_D,PANTS_D,PANTS_M,PANTS_M,PANTS_D,SHIRT_D,_,_,_,_,_,_,_,_]);
    // Pants — 1 row (chibi)
    row(ctx, 17, [_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_D,_,_,_,_,_,_,_,_,_]);
    if (frame === 0) {
      row(ctx, 18, [_,_,_,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_]);
      row(ctx, 19, [_,_,_,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_]);
    } else {
      row(ctx, 18, [_,_,_,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_,_]);
      row(ctx, 19, [_,_,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_]);
    }
    row(ctx, 20, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Male sit ─────────────────────────────────────────────────────────────

  function drawMaleSit(ctx) {
    const _ = null;
    // Head (same as down but shifted up slightly)
    row(ctx, 0, [_,_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_,_,_]);
    row(ctx, 1, [_,_,_,_,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_M,HAIR_D,_,_,_,_]);
    row(ctx, 2, [_,_,_,HAIR_D,HAIR_M,HAIR_L,HAIR_M,HAIR_M,HAIR_M,HAIR_L,HAIR_M,HAIR_M,HAIR_D,_,_,_]);
    row(ctx, 3, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    // Eyes — big cute 2×2 with white highlight
    row(ctx, 4, [_,_,_,HAIR_D,SKIN,WHITE,EYE,SKIN,SKIN,WHITE,EYE,SKIN,HAIR_D,_,_,_]);
    row(ctx, 5, [_,_,_,HAIR_D,SKIN,EYE,EYE,SKIN,SKIN,EYE,EYE,SKIN,HAIR_D,_,_,_]);
    row(ctx, 6, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 7, [_,_,_,HAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,HAIR_D,_,_,_]);
    row(ctx, 8, [_,_,_,_,HAIR_D,SKIN2,SKIN,SKIN2,SKIN2,SKIN,SKIN2,HAIR_D,_,_,_,_]);
    row(ctx, 9, [_,_,_,_,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,HAIR_D,_,_,_,_]);
    // Neck
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);
    // Shirt (sitting hunched, arms on desk implied)
    row(ctx, 11, [_,_,_,SHIRT_D,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,SHIRT_D,_,_,_,_]);
    row(ctx, 12, [_,_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_,_]);
    row(ctx, 13, [SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_]);
    row(ctx, 14, [SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_]);
    row(ctx, 15, [_,SHIRT_D,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_M,SHIRT_D,_,_]);
    // Sitting legs (horizontal)
    row(ctx, 16, [_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_D,_,_,_,_,_]);
    row(ctx, 17, [_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_D,_,_,_,_]);
    row(ctx, 18, [_,_,_,_,PANTS_D,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_M,PANTS_D,_,_,_]);
    row(ctx, 19, [_,_,_,_,_,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,PANTS_D,_,_]);
    row(ctx, 20, [_,_,_,_,_,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,_,_]);
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Female down frames ──────────────────────────────────────────────────

  function drawFemaleDown(ctx, frame) {
    const _ = null;
    // Hair – black with bow, long flowing sides
    row(ctx, 0, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_]);
    row(ctx, 1, [_,_,_,FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_,_]);
    row(ctx, 2, [_,_,FHAIR_D,FHAIR_M,FHAIR_L,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_L,FHAIR_M,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 3, [_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    // Eyes — big cute 2×2 with white highlight
    row(ctx, 4, [_,_,FHAIR_D,SKIN,SKIN,WHITE,EYE,SKIN,SKIN,WHITE,EYE,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 5, [_,_,FHAIR_D,SKIN,SKIN,EYE,EYE,SKIN,SKIN,EYE,EYE,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 6, [_,_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 7, [_,_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 8, [_,_,_,FHAIR_D,FHAIR_M,SKIN2,SKIN,SKIN2,SKIN2,SKIN,SKIN2,FHAIR_M,FHAIR_D,_,_,_]);
    row(ctx, 9, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_]);
    // Bow at top-right
    px(ctx, 12, 0, BOW_D); px(ctx, 13, 0, BOW_M); px(ctx, 14, 0, BOW_D);
    px(ctx, 12, 1, BOW_M); px(ctx, 13, 1, BOW_L); px(ctx, 14, 1, BOW_M);
    px(ctx, 12, 2, BOW_D); px(ctx, 13, 2, BOW_D); px(ctx, 14, 2, BOW_D);

    // Neck
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);
    // Dress top (rows 11-14)
    row(ctx, 11, [_,_,_,DRESS_D,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,DRESS_D,_,_,_,_]);
    row(ctx, 12, [_,_,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_]);
    row(ctx, 13, [_,DRESS_D,DRESS_M,DRESS_L,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_L,DRESS_M,DRESS_M,DRESS_D,_,_]);
    row(ctx, 14, [_,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_]);
    // Long hair sides — 2px wide, extends to row 16
    px(ctx, 0, 11, FHAIR_D); px(ctx, 1, 11, FHAIR_M);
    px(ctx, 0, 12, FHAIR_D); px(ctx, 1, 12, FHAIR_M);
    px(ctx, 0, 13, FHAIR_D); px(ctx, 1, 13, FHAIR_D);
    px(ctx, 0, 14, FHAIR_D); px(ctx, 1, 14, FHAIR_D);
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 14, 11, FHAIR_M); px(ctx, 15, 11, FHAIR_D);
    px(ctx, 14, 12, FHAIR_M); px(ctx, 15, 12, FHAIR_D);
    px(ctx, 14, 13, FHAIR_D); px(ctx, 15, 13, FHAIR_D);
    px(ctx, 14, 14, FHAIR_D); px(ctx, 15, 14, FHAIR_D);
    px(ctx, 14, 15, FHAIR_D); px(ctx, 15, 15, FHAIR_D);
    // Skirt flare
    row(ctx, 15, [_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_]);
    row(ctx, 16, [SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_]);
    row(ctx, 17, [SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_,_,_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_]);
    // Long hair — extends past skirt on both sides (overwrite skirt at outer cols)
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 14, 15, FHAIR_D); px(ctx, 15, 15, FHAIR_D);
    px(ctx, 0, 16, FHAIR_D); px(ctx, 1, 16, FHAIR_D);
    px(ctx, 14, 16, FHAIR_D); px(ctx, 15, 16, FHAIR_D);
    px(ctx, 0, 17, FHAIR_D); px(ctx, 1, 17, FHAIR_D);
    px(ctx, 14, 17, FHAIR_D);
    // Legs — 1 row (very chibi under skirt)
    row(ctx, 18, [_,SKIRT_D,SKIN,SKIN,SKIN,_,_,_,_,_,SKIN,SKIN,SKIN,SKIRT_D,_,_]);
    // Shoes right below
    if (frame === 0) {
      row(ctx, 19, [_,_,SHOES,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
      row(ctx, 20, [_,_,SHOES,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
    } else {
      row(ctx, 19, [_,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,SHOES,SHOES,SHOES,_,_]);
      row(ctx, 20, [_,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,SHOES,SHOES,SHOES,_,_]);
    }
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Female up frames ────────────────────────────────────────────────────

  function drawFemaleUp(ctx, frame) {
    const _ = null;
    row(ctx, 0, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_]);
    row(ctx, 1, [_,_,_,FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_,_]);
    row(ctx, 2, [_,_,FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 3, [_,_,FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 4, [_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_]);
    row(ctx, 5, [_,_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 6, [_,_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 7, [_,_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 8, [_,_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 9, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_]);
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);
    // Dress back (rows 11-14)
    row(ctx, 11, [_,_,_,DRESS_D,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,DRESS_D,_,_,_,_]);
    row(ctx, 12, [_,_,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_]);
    row(ctx, 13, [_,DRESS_D,DRESS_M,DRESS_M,DRESS_D,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_D,DRESS_D,DRESS_M,DRESS_M,DRESS_D,_,_]);
    row(ctx, 14, [_,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_]);
    // Long hair — wide block down the back overlaying dress (rows 11-17, cols 2-13)
    for (let r = 11; r <= 17; r++) {
      px(ctx, 2,  r, FHAIR_D); px(ctx, 3,  r, FHAIR_M);
      px(ctx, 4,  r, FHAIR_M); px(ctx, 5,  r, FHAIR_M);
      px(ctx, 6,  r, FHAIR_L); px(ctx, 7,  r, FHAIR_M);
      px(ctx, 8,  r, FHAIR_M); px(ctx, 9,  r, FHAIR_L);
      px(ctx, 10, r, FHAIR_M); px(ctx, 11, r, FHAIR_M);
      px(ctx, 12, r, FHAIR_M); px(ctx, 13, r, FHAIR_D);
    }
    // Side hair strands at edges
    px(ctx, 0, 11, FHAIR_D); px(ctx, 1, 11, FHAIR_M);
    px(ctx, 0, 12, FHAIR_D); px(ctx, 1, 12, FHAIR_M);
    px(ctx, 0, 13, FHAIR_D); px(ctx, 1, 13, FHAIR_D);
    px(ctx, 0, 14, FHAIR_D); px(ctx, 1, 14, FHAIR_D);
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 14, 11, FHAIR_M); px(ctx, 15, 11, FHAIR_D);
    px(ctx, 14, 12, FHAIR_M); px(ctx, 15, 12, FHAIR_D);
    px(ctx, 14, 13, FHAIR_D); px(ctx, 15, 13, FHAIR_D);
    px(ctx, 14, 14, FHAIR_D); px(ctx, 15, 14, FHAIR_D);
    px(ctx, 14, 15, FHAIR_D); px(ctx, 15, 15, FHAIR_D);
    // Hair extends past skirt on both sides
    px(ctx, 0, 16, FHAIR_D); px(ctx, 1, 16, FHAIR_D);
    px(ctx, 14, 16, FHAIR_D); px(ctx, 15, 16, FHAIR_D);
    px(ctx, 0, 17, FHAIR_D); px(ctx, 1, 17, FHAIR_D);
    px(ctx, 14, 17, FHAIR_D);
    // Legs — 1 row
    row(ctx, 18, [_,SKIRT_D,SKIN,SKIN,SKIN,_,_,_,_,_,SKIN,SKIN,SKIN,SKIRT_D,_,_]);
    if (frame === 0) {
      row(ctx, 19, [_,_,SHOES,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
      row(ctx, 20, [_,_,SHOES,SHOES,SHOES,_,_,_,_,_,SHOES,SHOES,SHOES,_,_,_]);
    } else {
      row(ctx, 19, [_,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,SHOES,SHOES,SHOES,_,_]);
      row(ctx, 20, [_,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,SHOES,SHOES,SHOES,_,_]);
    }
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Female right frames ──────────────────────────────────────────────────

  function drawFemaleRight(ctx, frame) {
    const _ = null;
    // Long hair flows back left — full-width side profile
    row(ctx, 0, [FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_,_,_,_,_,_,_,_]);
    row(ctx, 1, [FHAIR_D,FHAIR_M,FHAIR_L,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_,_,_,_,_,_,_]);
    row(ctx, 2, [FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_,_,_,_,_,_]);
    row(ctx, 3, [_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_D,_,_,_,_,_,_,_]);
    // Eye — 2×2 with white highlight (cols 5-6, near front/nose side)
    row(ctx, 4, [_,FHAIR_D,SKIN,SKIN,SKIN,WHITE,EYE,SKIN,FHAIR_D,_,_,_,_,_,_,_]);
    row(ctx, 5, [_,FHAIR_D,SKIN,SKIN,SKIN,EYE,EYE,SKIN,FHAIR_D,_,_,_,_,_,_,_]);
    // Nose hint
    row(ctx, 6, [_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN2,_,_,_,_,_,_,_,_]);
    // Blush / chin
    row(ctx, 7, [_,FHAIR_D,SKIN2,SKIN,SKIN2,SKIN,SKIN,FHAIR_D,_,_,_,_,_,_,_,_]);
    row(ctx, 8, [_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,FHAIR_D,_,_,_,_,_,_,_,_,_]);
    row(ctx, 9, [_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_,_,_,_,_,_,_]);
    // Bow at top-right of head
    px(ctx, 6, 0, BOW_D); px(ctx, 7, 0, BOW_M); px(ctx, 8, 0, BOW_D);
    px(ctx, 6, 1, BOW_M); px(ctx, 7, 1, BOW_L); px(ctx, 8, 1, BOW_M);
    // Neck
    row(ctx, 10, [_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_,_,_,_,_]);
    // Dress — back arm (left) + torso + front arm (right), full 10-col width
    row(ctx, 11, [DRESS_D,DRESS_M,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_D,DRESS_M,DRESS_D,_,_,_,_,_,_,_]);
    row(ctx, 12, [DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_,_,_,_]);
    row(ctx, 13, [DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_,_,_,_]);
    row(ctx, 14, [DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_,_,_,_,_]);
    // Long hair flowing down behind body (overwrites dress on left)
    px(ctx, 0, 11, FHAIR_D); px(ctx, 1, 11, FHAIR_M);
    px(ctx, 0, 12, FHAIR_D); px(ctx, 1, 12, FHAIR_M);
    px(ctx, 0, 13, FHAIR_D); px(ctx, 1, 13, FHAIR_D);
    px(ctx, 0, 14, FHAIR_D); px(ctx, 1, 14, FHAIR_D);
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 0, 16, FHAIR_D); px(ctx, 1, 16, FHAIR_D);
    px(ctx, 0, 17, FHAIR_D); px(ctx, 1, 17, FHAIR_D);
    // Skirt
    row(ctx, 15, [_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_,_,_,_,_]);
    row(ctx, 16, [SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_,_,_,_]);
    row(ctx, 17, [SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_,_,_,_,_]);
    // Hair overdraws left side of skirt
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 0, 16, FHAIR_D); px(ctx, 1, 16, FHAIR_D);
    px(ctx, 0, 17, FHAIR_D); px(ctx, 1, 17, FHAIR_D);
    // Legs
    row(ctx, 18, [_,SKIRT_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIRT_D,_,_,_,_,_,_,_,_]);
    if (frame === 0) {
      row(ctx, 19, [_,_,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_]);
      row(ctx, 20, [_,_,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_]);
    } else {
      row(ctx, 19, [_,_,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_,_]);
      row(ctx, 20, [_,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_,_,_,_,_,_,_]);
    }
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Female sit ───────────────────────────────────────────────────────────

  function drawFemaleSit(ctx) {
    const _ = null;
    row(ctx, 0, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_]);
    row(ctx, 1, [_,_,_,FHAIR_D,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_M,FHAIR_D,_,_,_]);
    row(ctx, 2, [_,_,FHAIR_D,FHAIR_M,FHAIR_L,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_L,FHAIR_M,FHAIR_M,FHAIR_D,_,_]);
    row(ctx, 3, [_,_,FHAIR_D,FHAIR_M,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_M,FHAIR_D,_,_]);
    // Eyes — big cute 2×2 with white highlight
    row(ctx, 4, [_,_,FHAIR_D,SKIN,SKIN,WHITE,EYE,SKIN,SKIN,WHITE,EYE,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 5, [_,_,FHAIR_D,SKIN,SKIN,EYE,EYE,SKIN,SKIN,EYE,EYE,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 6, [_,_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 7, [_,_,FHAIR_D,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,SKIN,FHAIR_D,_,_]);
    row(ctx, 8, [_,_,_,FHAIR_D,FHAIR_M,SKIN2,SKIN,SKIN2,SKIN2,SKIN,SKIN2,FHAIR_M,FHAIR_D,_,_,_]);
    row(ctx, 9, [_,_,_,_,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,FHAIR_D,_,_,_,_]);
    // Bow
    px(ctx, 12, 0, BOW_D); px(ctx, 13, 0, BOW_M); px(ctx, 14, 0, BOW_D);
    px(ctx, 12, 1, BOW_M); px(ctx, 13, 1, BOW_L); px(ctx, 14, 1, BOW_M);
    row(ctx, 10, [_,_,_,_,_,_,SKIN,SKIN,SKIN,SKIN,_,_,_,_,_,_]);
    row(ctx, 11, [_,_,_,DRESS_D,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,DRESS_D,_,_,_,_]);
    row(ctx, 12, [_,_,DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_,_,_]);
    row(ctx, 13, [DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_]);
    row(ctx, 14, [DRESS_D,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_M,DRESS_D,_]);
    // Long hair sides (sitting) — 2px wide strands
    px(ctx, 0, 11, FHAIR_D); px(ctx, 1, 11, FHAIR_M);
    px(ctx, 0, 12, FHAIR_D); px(ctx, 1, 12, FHAIR_M);
    px(ctx, 0, 13, FHAIR_D); px(ctx, 1, 13, FHAIR_D);
    px(ctx, 0, 14, FHAIR_D); px(ctx, 1, 14, FHAIR_D);
    px(ctx, 14, 11, FHAIR_M); px(ctx, 15, 11, FHAIR_D);
    px(ctx, 14, 12, FHAIR_M); px(ctx, 15, 12, FHAIR_D);
    px(ctx, 14, 13, FHAIR_D); px(ctx, 15, 13, FHAIR_D);
    px(ctx, 14, 14, FHAIR_D); px(ctx, 15, 14, FHAIR_D);
    row(ctx, 15, [_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_]);
    row(ctx, 16, [_,_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_]);
    row(ctx, 17, [_,_,_,SKIRT_D,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_M,SKIRT_D,_,_,_,_]);
    // Long hair — extends past skirt on outer columns
    px(ctx, 0, 15, FHAIR_D); px(ctx, 1, 15, FHAIR_D);
    px(ctx, 14, 15, FHAIR_D); px(ctx, 15, 15, FHAIR_D);
    px(ctx, 0, 16, FHAIR_D); px(ctx, 1, 16, FHAIR_D);
    px(ctx, 14, 16, FHAIR_D); px(ctx, 15, 16, FHAIR_D);
    px(ctx, 0, 17, FHAIR_D); px(ctx, 1, 17, FHAIR_D);
    px(ctx, 14, 17, FHAIR_D); px(ctx, 15, 17, FHAIR_D);
    row(ctx, 18, [_,_,_,_,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_]);
    row(ctx, 19, [_,_,_,_,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,SHOES,_,_,_,_]);
    row(ctx, 20, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 21, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 22, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
    row(ctx, 23, [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_]);
  }

  // ── Status icons ─────────────────────────────────────────────────────────

  function drawIconBook(ctx) {
    // Open book icon — two pages spread with a spine down the middle
    // 8 × 8 logical @ 2px = 16 × 16 display
    const S  = 2;
    const B  = '#3D2B1F';   // cover / spine (dark brown)
    const P  = '#F5E6C8';   // page (cream)
    const L  = '#9080C0';   // text lines (purple)
    const _  = null;

    // Layout (8 cols × 8 rows):
    //   col 0-2 = left page, col 3 = spine, col 4-6 = right page, col 7 = empty
    const grid = [
      [_,B,B,B,B,B,B,_],   // row 0 – top binding arc
      [B,P,P,B,B,P,P,B],   // row 1 – page tops
      [B,P,L,B,B,L,P,B],   // row 2 – text line
      [B,P,L,B,B,L,P,B],   // row 3 – text line
      [B,P,P,B,B,P,P,B],   // row 4 – page middle
      [B,P,L,B,B,L,P,B],   // row 5 – text line
      [_,B,B,B,B,B,B,_],   // row 6 – bottom cover
      [_,_,B,_,_,B,_,_],   // row 7 – feet of spine
    ];
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        if (grid[r][col]) {
          ctx.fillStyle = grid[r][col];
          ctx.fillRect(col * S, r * S, S, S);
        }
      }
    }
  }

  function drawIconCoffee(ctx) {
    const S = 2;
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
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        if (c[r][col]) {
          ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
          ctx.fillRect(col * S, r * S, S, S);
        }
      }
    }
  }

  function drawIconPause(ctx) {
    const S = 2;
    // Cloud + pause bars icon (8x8 @ 2px = 16x16 display)
    const CLOUD = 0xB0A8C8;
    const BAR   = 0x2A2040;
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
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        if (c[r][col]) {
          ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
          ctx.fillRect(col * S, r * S, S, S);
        }
      }
    }
  }

  function drawIconFork(ctx) {
    const S = 2;
    // Fork + knife icon (8x8 @ 2px = 16x16 display)
    const METAL = 0xD0C8A0;
    const DARK  = 0x706840;
    const c = [
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
      [null,METAL,null,null,null,DARK, null,null],
      [null,METAL,null,null,DARK, DARK, null,null],
      [METAL,METAL,METAL,null,null,METAL,null,null],
      [null,METAL,null,null,null,METAL,null,null],
    ];
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        if (c[r][col]) {
          ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
          ctx.fillRect(col * S, r * S, S, S);
        }
      }
    }
  }

  function drawIconFire(ctx) {
    const S = 2;
    // Flame icon (8x8 @ 2px = 16x16 display)
    const OUTER = 0xE05820;
    const MID   = 0xF0A020;
    const INNER = 0xFFE040;
    const c = [
      [null,null,null,MID,  null,null,null,null],
      [null,null,MID, MID,  OUTER,null,null,null],
      [null,OUTER,MID,INNER,MID, OUTER,null,null],
      [null,OUTER,MID,INNER,INNER,MID, OUTER,null],
      [OUTER,MID,INNER,INNER,INNER,INNER,MID,OUTER],
      [OUTER,MID,INNER,INNER,INNER,INNER,MID,OUTER],
      [null,OUTER,MID,INNER,INNER,MID,OUTER,null],
      [null,null,OUTER,MID, MID, OUTER,null,null],
    ];
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        if (c[r][col]) {
          ctx.fillStyle = '#' + c[r][col].toString(16).padStart(6, '0');
          ctx.fillRect(col * S, r * S, S, S);
        }
      }
    }
  }

  function drawIconRelax(ctx) {
    const S = 2;
    // Zzz icon — three stacked Z shapes in lilac/purple (8×8 @ 2px)
    const Z1 = 0xC090F0;  // large Z (top-right)
    const Z2 = 0xA070D0;  // medium Z (middle)
    const Z3 = 0x8050B0;  // small Z (bottom-left)
    // Large Z rows 0-2, cols 3-7
    ctx.fillStyle = '#' + Z1.toString(16);
    ctx.fillRect(3*S, 0,   5*S, S);   // top bar
    ctx.fillRect(6*S, S,   2*S, S);   // diagonal
    ctx.fillRect(3*S, 2*S, 5*S, S);   // bottom bar
    // Medium Z rows 3-5, cols 1-5
    ctx.fillStyle = '#' + Z2.toString(16);
    ctx.fillRect(1*S, 3*S, 5*S, S);
    ctx.fillRect(4*S, 4*S, 2*S, S);
    ctx.fillRect(1*S, 5*S, 5*S, S);
    // Small Z rows 6-7, cols 0-3
    ctx.fillStyle = '#' + Z3.toString(16);
    ctx.fillRect(0,   6*S, 4*S, S);
    ctx.fillRect(2*S, 7*S, 2*S, S);   // (single pixel diagonal stand-in)
  }

  function drawIconLaundry(ctx) {
    const S = 2;
    // Water-drop + bubbles icon in blue (8×8 @ 2px)
    const BUBBLE = 0x60C0F0;
    const WATER  = 0x3090D0;
    const SHINE  = 0xB0E8FF;
    // Main water drop (rows 2-7, cols 2-5)
    ctx.fillStyle = '#' + WATER.toString(16);
    ctx.fillRect(3*S, 1*S, 2*S, S);   // tip
    ctx.fillRect(2*S, 2*S, 4*S, S);
    ctx.fillRect(1*S, 3*S, 6*S, S);
    ctx.fillRect(1*S, 4*S, 6*S, S);
    ctx.fillRect(2*S, 5*S, 4*S, S);
    ctx.fillRect(3*S, 6*S, 2*S, S);   // bottom
    // Shine
    ctx.fillStyle = '#' + SHINE.toString(16);
    ctx.fillRect(2*S, 3*S, S, S);
    // Small bubble top-right
    ctx.fillStyle = '#' + BUBBLE.toString(16);
    ctx.fillRect(6*S, 0,   2*S, S);
    ctx.fillRect(5*S, S,   4*S, S);
    ctx.fillRect(6*S, 2*S, 2*S, S);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function makeTexture(scene, key, w, h, drawFn) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const ct = scene.textures.createCanvas(key, w, h);
    const ctx = ct.getContext();
    ctx.clearRect(0, 0, w, h);
    drawFn(ctx);
    ct.refresh();
  }

  window.PixelSprites = {
    setShirtColor(preset) {
      _currentShirtColor = preset || 'blue';
      _applyShirtColor(_currentShirtColor);
    },

    // Creates color-specific textures for a player (e.g. player_male_green_down_0).
    // Only creates if they don't already exist, so other players' textures are preserved.
    createPlayerTextures(scene, gender, shirtColor) {
      const prefix = `player_${gender}_${shirtColor}`;
      if (scene.textures.exists(prefix + '_down_0')) return;
      const saved = _currentShirtColor;
      _applyShirtColor(shirtColor || 'blue');
      if (gender === 'male') {
        makeTexture(scene, prefix + '_down_0',  DW, DH, (c) => drawMaleDown(c, 0));
        makeTexture(scene, prefix + '_down_1',  DW, DH, (c) => drawMaleDown(c, 1));
        makeTexture(scene, prefix + '_up_0',    DW, DH, (c) => drawMaleUp(c, 0));
        makeTexture(scene, prefix + '_up_1',    DW, DH, (c) => drawMaleUp(c, 1));
        makeTexture(scene, prefix + '_right_0', DW, DH, (c) => drawMaleRight(c, 0));
        makeTexture(scene, prefix + '_right_1', DW, DH, (c) => drawMaleRight(c, 1));
        makeTexture(scene, prefix + '_sit',     DW, DH, drawMaleSit);
      } else {
        makeTexture(scene, prefix + '_down_0',  DW, DH, (c) => drawFemaleDown(c, 0));
        makeTexture(scene, prefix + '_down_1',  DW, DH, (c) => drawFemaleDown(c, 1));
        makeTexture(scene, prefix + '_up_0',    DW, DH, (c) => drawFemaleUp(c, 0));
        makeTexture(scene, prefix + '_up_1',    DW, DH, (c) => drawFemaleUp(c, 1));
        makeTexture(scene, prefix + '_right_0', DW, DH, (c) => drawFemaleRight(c, 0));
        makeTexture(scene, prefix + '_right_1', DW, DH, (c) => drawFemaleRight(c, 1));
        makeTexture(scene, prefix + '_sit',     DW, DH, drawFemaleSit);
      }
      _applyShirtColor(saved);
    },

    createAllTextures(scene) {
      // Apply current shirt colour before drawing
      _applyShirtColor(_currentShirtColor);

      // Male
      makeTexture(scene, 'player_male_down_0',  DW, DH, (c) => drawMaleDown(c, 0));
      makeTexture(scene, 'player_male_down_1',  DW, DH, (c) => drawMaleDown(c, 1));
      makeTexture(scene, 'player_male_up_0',    DW, DH, (c) => drawMaleUp(c, 0));
      makeTexture(scene, 'player_male_up_1',    DW, DH, (c) => drawMaleUp(c, 1));
      makeTexture(scene, 'player_male_right_0', DW, DH, (c) => drawMaleRight(c, 0));
      makeTexture(scene, 'player_male_right_1', DW, DH, (c) => drawMaleRight(c, 1));
      makeTexture(scene, 'player_male_sit',     DW, DH, drawMaleSit);

      // Female
      makeTexture(scene, 'player_female_down_0',  DW, DH, (c) => drawFemaleDown(c, 0));
      makeTexture(scene, 'player_female_down_1',  DW, DH, (c) => drawFemaleDown(c, 1));
      makeTexture(scene, 'player_female_up_0',    DW, DH, (c) => drawFemaleUp(c, 0));
      makeTexture(scene, 'player_female_up_1',    DW, DH, (c) => drawFemaleUp(c, 1));
      makeTexture(scene, 'player_female_right_0', DW, DH, (c) => drawFemaleRight(c, 0));
      makeTexture(scene, 'player_female_right_1', DW, DH, (c) => drawFemaleRight(c, 1));
      makeTexture(scene, 'player_female_sit',     DW, DH, drawFemaleSit);

      // Status icons
      makeTexture(scene, 'icon_book',    16, 16, drawIconBook);
      makeTexture(scene, 'icon_coffee',  16, 16, drawIconCoffee);
      makeTexture(scene, 'icon_pause',   16, 16, drawIconPause);
      makeTexture(scene, 'icon_fork',    16, 16, drawIconFork);
      makeTexture(scene, 'icon_fire',    16, 16, drawIconFire);
      makeTexture(scene, 'icon_relax',   16, 16, drawIconRelax);
      makeTexture(scene, 'icon_laundry', 16, 16, drawIconLaundry);
    },
  };
})();
