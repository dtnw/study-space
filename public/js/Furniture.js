/**
 * Furniture.js – OOP furniture system for the study room.
 * Each class draws its own pixel-art graphics and registers a static physics collider.
 *
 * Japanese café aesthetic: warm wood tones, sage-green cushions, terracotta pots.
 */

(function () {

  // ── Base ──────────────────────────────────────────────────────────────────

  class FurnitureBase {
    constructor(scene, x, y) {
      this.scene    = scene;
      this.x        = x;
      this.y        = y;
      this.collider = null;   // Phaser rectangle with static physics body
    }

    /** Create an invisible static-physics rectangle for collision. */
    _addCollider(cx, cy, cw, ch) {
      const rect = this.scene.add.rectangle(cx, cy, cw, ch);
      rect.setVisible(false);
      this.scene.physics.add.existing(rect, true);
      this.collider = rect;
    }
  }

  // ── Chair ─────────────────────────────────────────────────────────────────
  // Japanese café style: wooden frame (warm oak) + sage-green cushion.
  // `side` = 'north' | 'south'  (which side of the desk the chair faces).

  class Chair extends FurnitureBase {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x        – left edge of the chair (32 px wide)
     * @param {number} y        – top edge of the chair (36 px tall)
     * @param {'north'|'south'} side
     */
    constructor(scene, x, y, side = 'south') {
      super(scene, x, y);
      this.side    = side;           // which side of the desk
      this.seatCX  = x + 16;        // centre-x for player to sit at
      // seatCY is the y the PLAYER stands/sits at, set per-side in GameScene
      this.seatCY  = side === 'north' ? y + 28 : y + 8;
      this._draw(x, y, side);
    }

    _draw(x, y, side) {
      const g = this.scene.add.graphics();

      const WOOD_DARK   = 0x6B3D1E;   // dark oak frame
      const WOOD_MID    = 0x8B5E3C;   // mid oak
      const WOOD_LIGHT  = 0xA87850;   // highlight
      const CUSHION     = 0xB5C9B0;   // sage green cushion
      const CUSHION_SHD = 0x8FA08A;   // cushion shadow

      if (side === 'south') {
        // ── South-facing chair (player sits with back to camera) ──────────
        // Legs (4 px wide, 8 px tall) at corners
        g.fillStyle(WOOD_DARK);
        g.fillRect(x + 2,  y + 28, 4, 8);   // left leg
        g.fillRect(x + 26, y + 28, 4, 8);   // right leg

        // Seat frame
        g.fillStyle(WOOD_MID);
        g.fillRect(x + 2,  y + 16, 28, 12); // seat body

        // Seat highlight strip
        g.fillStyle(WOOD_LIGHT);
        g.fillRect(x + 4,  y + 16, 24, 2);  // top edge highlight

        // Cushion
        g.fillStyle(CUSHION);
        g.fillRect(x + 4,  y + 18, 24, 8);
        g.fillStyle(CUSHION_SHD);
        g.fillRect(x + 4,  y + 24, 24, 2);  // cushion shadow edge

        // Backrest slats
        g.fillStyle(WOOD_DARK);
        g.fillRect(x + 2,  y,      28, 4);  // top rail
        g.fillRect(x + 2,  y + 12, 28, 4);  // bottom rail

        // Slat verticals (3 slats)
        g.fillStyle(WOOD_MID);
        g.fillRect(x + 6,  y + 4,  4, 8);
        g.fillRect(x + 14, y + 4,  4, 8);
        g.fillRect(x + 22, y + 4,  4, 8);

        // Wood grain on rails
        g.fillStyle(WOOD_LIGHT);
        g.fillRect(x + 4,  y,      20, 1);
        g.fillRect(x + 4,  y + 12, 20, 1);

      } else {
        // ── North-facing chair (player sits facing camera) ────────────────
        // Legs
        g.fillStyle(WOOD_DARK);
        g.fillRect(x + 2,  y,      4, 8);   // left leg (top since flipped)
        g.fillRect(x + 26, y,      4, 8);   // right leg

        // Seat frame
        g.fillStyle(WOOD_MID);
        g.fillRect(x + 2,  y + 8,  28, 12);

        // Seat highlight
        g.fillStyle(WOOD_LIGHT);
        g.fillRect(x + 4,  y + 8,  24, 2);

        // Cushion
        g.fillStyle(CUSHION);
        g.fillRect(x + 4,  y + 10, 24, 8);
        g.fillStyle(CUSHION_SHD);
        g.fillRect(x + 4,  y + 16, 24, 2);

        // Backrest slats (at bottom for north chairs)
        g.fillStyle(WOOD_DARK);
        g.fillRect(x + 2,  y + 20, 28, 4);  // top rail
        g.fillRect(x + 2,  y + 32, 28, 4);  // bottom rail

        // Slats
        g.fillStyle(WOOD_MID);
        g.fillRect(x + 6,  y + 24, 4, 8);
        g.fillRect(x + 14, y + 24, 4, 8);
        g.fillRect(x + 22, y + 24, 4, 8);

        // Wood grain
        g.fillStyle(WOOD_LIGHT);
        g.fillRect(x + 4,  y + 20, 20, 1);
        g.fillRect(x + 4,  y + 32, 20, 1);
      }

      this.graphics = g;
      // No physics collider on chairs — player walks through them and sits
    }
  }

  // ── Desk ──────────────────────────────────────────────────────────────────
  // Medium oak, 6-seater, 240 × 64 px. Physics collider slightly taller for reliability.

  class Desk extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 192;
      this.h = 56;
      this._draw(x, y);
      this._addCollider(x + this.w / 2, y + this.h / 2, this.w, this.h + 16);
    }

    _draw(x, y) {
      const W = this.w, H = this.h;
      const g = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.18);
      shadow.fillRect(x + 6, y + H + 4, W - 2, 8);
      const DESK_TOP   = 0xC8924A;
      const DESK_FRONT = 0xA07030;
      const DESK_DARK  = 0x7A5020;
      const DESK_HIGH  = 0xDFAD6A;
      const GRAIN      = 0xB07830;
      g.fillStyle(DESK_DARK);
      g.fillRect(x + 8, y + H - 4, 16, 8);
      g.fillRect(x + W - 24, y + H - 4, 16, 8);
      g.fillStyle(DESK_DARK);
      g.fillRect(x, y + H - 10, W, 10);
      g.fillStyle(DESK_TOP);
      g.fillRect(x, y, W, H - 10);
      g.fillStyle(DESK_HIGH);
      g.fillRect(x + 2, y + 2, W - 4, 4);
      g.fillStyle(GRAIN);
      for (let gy = 12; gy < H - 14; gy += 8) {
        g.fillRect(x + 4, y + gy, W - 8, 1);
      }
      g.fillStyle(DESK_FRONT);
      g.fillRect(x + 2, y + H - 20, W - 4, 10);
      g.fillStyle(DESK_HIGH);
      g.fillRect(x + 4, y + H - 20, W - 8, 2);
      g.fillStyle(DESK_DARK);
      g.fillRect(x + 8, y + H - 10, 14, 12);
      g.fillRect(x + W - 22, y + H - 10, 14, 12);
      g.fillStyle(GRAIN);
      g.fillRect(x + 10, y + H - 10, 4, 10);
      g.fillRect(x + W - 20, y + H - 10, 4, 10);
      this.graphics = [shadow, g];
    }
  }

  // ── DeskSolo ───────────────────────────────────────────────────────────────
  // Single-person compact desk, 64 × 48 px.

  class DeskSolo extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 64;
      this.h = 48;
      this._draw(x, y);
      this._addCollider(x + 32, y + 24, 64, 56);
    }

    _draw(x, y) {
      const W = 64, H = 48;
      const g = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.15);
      shadow.fillRect(x + 4, y + H + 2, W - 4, 6);
      const TOP   = 0xD4A05A;
      const FRONT = 0xAA7838;
      const DARK  = 0x7A5020;
      const HIGH  = 0xEAC07A;
      const GRAIN = 0xBE8A42;
      // Legs
      g.fillStyle(DARK);
      g.fillRect(x + 4,  y + H - 8, 10, 10);
      g.fillRect(x + W - 14, y + H - 8, 10, 10);
      // Apron
      g.fillStyle(DARK);
      g.fillRect(x, y + H - 9, W, 9);
      // Top surface
      g.fillStyle(TOP);
      g.fillRect(x, y, W, H - 9);
      // Highlight
      g.fillStyle(HIGH);
      g.fillRect(x + 2, y + 2, W - 4, 3);
      // Grain
      g.fillStyle(GRAIN);
      for (let gy = 10; gy < H - 12; gy += 7) {
        g.fillRect(x + 3, y + gy, W - 6, 1);
      }
      // Front face
      g.fillStyle(FRONT);
      g.fillRect(x + 2, y + H - 17, W - 4, 8);
      g.fillStyle(HIGH);
      g.fillRect(x + 4, y + H - 17, W - 8, 2);
      this.graphics = [shadow, g];
    }
  }

  // ── DeskTwo ────────────────────────────────────────────────────────────────
  // 2-person table, 96 × 48 px — one chair each side.

  class DeskTwo extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 96;
      this.h = 48;
      this._draw(x, y);
      this._addCollider(x + 48, y + 24, 96, 60);
    }

    _draw(x, y) {
      const W = 96, H = 48;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.18);
      shadow.fillRect(x + 6, y + H + 4, W - 2, 8);
      const TOP   = 0xC8924A;
      const FRONT = 0xA07030;
      const DARK  = 0x7A5020;
      const HIGH  = 0xDFAD6A;
      const GRAIN = 0xB07830;
      // Legs
      g.fillStyle(DARK);
      g.fillRect(x + 6,      y + H - 4, 12, 8);
      g.fillRect(x + W - 18, y + H - 4, 12, 8);
      // Apron
      g.fillStyle(DARK);
      g.fillRect(x, y + H - 10, W, 10);
      // Top surface
      g.fillStyle(TOP);
      g.fillRect(x, y, W, H - 10);
      // Highlight
      g.fillStyle(HIGH);
      g.fillRect(x + 2, y + 2, W - 4, 4);
      // Grain lines
      g.fillStyle(GRAIN);
      for (let gy = 12; gy < H - 14; gy += 8) {
        g.fillRect(x + 4, y + gy, W - 8, 1);
      }
      // Front face
      g.fillStyle(FRONT);
      g.fillRect(x + 2, y + H - 20, W - 4, 10);
      g.fillStyle(HIGH);
      g.fillRect(x + 4, y + H - 20, W - 8, 2);
      // Leg details
      g.fillStyle(DARK);
      g.fillRect(x + 6,      y + H - 10, 10, 12);
      g.fillRect(x + W - 16, y + H - 10, 10, 12);
      g.fillStyle(GRAIN);
      g.fillRect(x + 8,      y + H - 10, 3, 10);
      g.fillRect(x + W - 14, y + H - 10, 3, 10);
      this.graphics = [shadow, g];
    }
  }

  // ── DeskFour ───────────────────────────────────────────────────────────────
  // 4-person table, 160 × 72 px.

  class DeskFour extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 160;
      this.h = 72;
      this._draw(x, y);
      this._addCollider(x + 80, y + 36, 160, 88);
    }

    _draw(x, y) {
      const W = 160, H = 72;
      const g = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.18);
      shadow.fillRect(x + 6, y + H + 4, W - 2, 8);
      const DESK_TOP   = 0xC8924A;
      const DESK_FRONT = 0xA07030;
      const DESK_DARK  = 0x7A5020;
      const DESK_HIGH  = 0xDFAD6A;
      const GRAIN      = 0xB07830;
      g.fillStyle(DESK_DARK);
      g.fillRect(x + 8, y + H - 4, 14, 8);
      g.fillRect(x + W - 22, y + H - 4, 14, 8);
      g.fillStyle(DESK_DARK);
      g.fillRect(x, y + H - 10, W, 10);
      g.fillStyle(DESK_TOP);
      g.fillRect(x, y, W, H - 10);
      g.fillStyle(DESK_HIGH);
      g.fillRect(x + 2, y + 2, W - 4, 4);
      g.fillStyle(GRAIN);
      for (let gy = 12; gy < H - 14; gy += 9) {
        g.fillRect(x + 4, y + gy, W - 8, 1);
      }
      g.fillStyle(DESK_FRONT);
      g.fillRect(x + 2, y + H - 20, W - 4, 10);
      g.fillStyle(DESK_HIGH);
      g.fillRect(x + 4, y + H - 20, W - 8, 2);
      g.fillStyle(DESK_DARK);
      g.fillRect(x + 8, y + H - 10, 12, 12);
      g.fillRect(x + W - 20, y + H - 10, 12, 12);
      g.fillStyle(GRAIN);
      g.fillRect(x + 10, y + H - 10, 4, 10);
      g.fillRect(x + W - 18, y + H - 10, 4, 10);
      this.graphics = [shadow, g];
    }
  }

  // ── Plant ─────────────────────────────────────────────────────────────────
  // Small terracotta pot with leafy plant. 32 × 48 px.

  class Plant extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this._draw(x, y);
      // Collider: small pot base only
      this._addCollider(x + 16, y + 40, 22, 16);
    }

    _draw(x, y) {
      const g = this.scene.add.graphics();

      // Terracotta pot
      const POT_MID  = 0xC26A3A;
      const POT_DARK = 0x8B3E1F;
      const POT_HIGH = 0xDF8A5A;
      const SOIL     = 0x4A2E1A;
      // Leaves (3 shades of green)
      const LEAF_D   = 0x3A6B35;
      const LEAF_M   = 0x52944A;
      const LEAF_L   = 0x6EC062;

      // Pot body
      g.fillStyle(POT_MID);
      g.fillRect(x + 5, y + 30, 22, 18);

      // Pot rim
      g.fillStyle(POT_DARK);
      g.fillRect(x + 3, y + 28, 26, 4);

      // Pot highlight
      g.fillStyle(POT_HIGH);
      g.fillRect(x + 7, y + 30, 5, 12);

      // Pot shadow side
      g.fillStyle(POT_DARK);
      g.fillRect(x + 22, y + 30, 4, 16);

      // Soil
      g.fillStyle(SOIL);
      g.fillRect(x + 5, y + 28, 22, 4);

      // Leaves – dark background blobs
      g.fillStyle(LEAF_D);
      g.fillRect(x + 8,  y + 6,  16, 16);
      g.fillRect(x + 2,  y + 12, 12, 14);
      g.fillRect(x + 18, y + 10, 12, 14);

      // Mid-tone leaf fill
      g.fillStyle(LEAF_M);
      g.fillRect(x + 10, y + 4,  12, 14);
      g.fillRect(x + 4,  y + 14, 10, 10);
      g.fillRect(x + 18, y + 12, 10, 10);

      // Leaf highlights
      g.fillStyle(LEAF_L);
      g.fillRect(x + 12, y + 6,  6, 6);
      g.fillRect(x + 6,  y + 16, 4, 4);
      g.fillRect(x + 20, y + 14, 4, 4);

      this.graphics = g;
    }
  }

  // ── Bookshelf ─────────────────────────────────────────────────────────────
  // Tall bookshelf (48 × 96 px) with colourful pixel-art book spines.

  class Bookshelf extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this._draw(x, y);
      this._addCollider(x + 24, y + 48, 48, 96);
    }

    _draw(x, y) {
      const g = this.scene.add.graphics();
      const W = 48, H = 96;

      // Shelf frame – dark wood
      const FRAME     = 0x4A2E1A;
      const FRAME_MID = 0x6B4A2E;
      const FRAME_LT  = 0x8B6A4E;

      // Back panel
      g.fillStyle(FRAME);
      g.fillRect(x, y, W, H);

      // Frame sides
      g.fillStyle(FRAME_MID);
      g.fillRect(x, y, 4, H);          // left
      g.fillRect(x + W - 4, y, 4, H); // right
      g.fillRect(x, y, W, 4);          // top
      g.fillRect(x, y + H - 4, W, 4); // bottom

      // Shelf boards at y+32 and y+64
      g.fillStyle(FRAME_MID);
      g.fillRect(x + 2, y + 30, W - 4, 6);
      g.fillRect(x + 2, y + 62, W - 4, 6);

      g.fillStyle(FRAME_LT);
      g.fillRect(x + 2, y + 30, W - 4, 2);
      g.fillRect(x + 2, y + 62, W - 4, 2);

      // Books – row 1 (y+6 to y+30)
      const books1 = [
        { w: 7,  c: 0x7090D0, h: 0x90B0F0 },
        { w: 5,  c: 0xD07050, h: 0xF09070 },
        { w: 8,  c: 0x60A870, h: 0x80C890 },
        { w: 6,  c: 0xD0B040, h: 0xF0D060 },
        { w: 7,  c: 0xA060C0, h: 0xC080E0 },
      ];
      let bx = x + 4;
      for (const b of books1) {
        g.fillStyle(b.c);
        g.fillRect(bx, y + 6, b.w, 24);
        g.fillStyle(b.h);
        g.fillRect(bx, y + 6, 2, 24);
        bx += b.w + 1;
      }

      // Books – row 2 (y+38 to y+62)
      const books2 = [
        { w: 6,  c: 0xD06060, h: 0xF08080 },
        { w: 8,  c: 0x5080C0, h: 0x70A0E0 },
        { w: 5,  c: 0x70C070, h: 0x90E090 },
        { w: 9,  c: 0xC09040, h: 0xE0B060 },
        { w: 6,  c: 0x8060D0, h: 0xA080F0 },
      ];
      bx = x + 4;
      for (const b of books2) {
        g.fillStyle(b.c);
        g.fillRect(bx, y + 38, b.w, 24);
        g.fillStyle(b.h);
        g.fillRect(bx, y + 38, 2, 24);
        bx += b.w + 1;
      }

      // Books – row 3 (y+70 to y+92)
      const books3 = [
        { w: 8,  c: 0xC04060, h: 0xE06080 },
        { w: 6,  c: 0x4090B0, h: 0x60B0D0 },
        { w: 7,  c: 0x80B040, h: 0xA0D060 },
        { w: 8,  c: 0xB06030, h: 0xD08050 },
        { w: 5,  c: 0x6060C0, h: 0x8080E0 },
      ];
      bx = x + 4;
      for (const b of books3) {
        g.fillStyle(b.c);
        g.fillRect(bx, y + 70, b.w, 22);
        g.fillStyle(b.h);
        g.fillRect(bx, y + 70, 2, 22);
        bx += b.w + 1;
      }

      this.graphics = g;
    }
  }

  // ── Window decoration ─────────────────────────────────────────────────────
  // A wall-mounted window with curtains (no physics — it's on the wall).

  class WindowDecor extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this._draw(x, y);
    }

    _draw(x, y) {
      const g = this.scene.add.graphics();
      const W = 80, H = 64;

      // Outer frame
      g.fillStyle(0x4A3020);
      g.fillRect(x, y, W, H);

      // Sky / glass
      g.fillStyle(0x87CEEB);
      g.fillRect(x + 6, y + 6, W - 12, H - 12);

      // Cloud puffs
      g.fillStyle(0xFFFFFF);
      g.fillRect(x + 10, y + 14, 18, 8);
      g.fillRect(x + 12, y + 10, 14, 6);
      g.fillRect(x + 36, y + 20, 14, 6);
      g.fillRect(x + 38, y + 16, 10, 6);

      // Cross divider
      g.fillStyle(0x4A3020);
      g.fillRect(x + 6,       y + (H / 2) - 2, W - 12, 4);
      g.fillRect(x + (W / 2) - 2, y + 6,       4, H - 12);

      // Curtain left (purple-ish)
      g.fillStyle(0x7B5EAE);
      g.fillRect(x,      y,     14, H);
      g.fillStyle(0x9B7ECE);
      g.fillRect(x + 2,  y,     6,  H);

      // Curtain right
      g.fillStyle(0x7B5EAE);
      g.fillRect(x + W - 14, y, 14, H);
      g.fillStyle(0x9B7ECE);
      g.fillRect(x + W - 8,  y, 6,  H);

      // Curtain rod
      g.fillStyle(0xC0A050);
      g.fillRect(x - 2, y - 4, W + 4, 6);

      this.graphics = g;
    }
  }

  // ── KitchenTable ──────────────────────────────────────────────────────────
  // Light cream/oak dining table, 128 × 48 px.

  class KitchenTable extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 128; this.h = 48;
      this._draw(x, y);
      this._addCollider(x + 64, y + 24, 128, 60);
    }
    _draw(x, y) {
      const W = 128, H = 48;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.14);
      shadow.fillRect(x + 4, y + H + 2, W - 4, 6);
      const TOP   = 0xF0E4C4; const FRONT = 0xCEC0A0;
      const DARK  = 0x8B7355; const HIGH  = 0xFFF8E8;
      const GRAIN = 0xDED0A8;
      g.fillStyle(DARK);  g.fillRect(x + 6, y + H - 4, 10, 8);
      g.fillRect(x + W - 16, y + H - 4, 10, 8);
      g.fillStyle(DARK);  g.fillRect(x, y + H - 10, W, 10);
      g.fillStyle(TOP);   g.fillRect(x, y, W, H - 10);
      g.fillStyle(HIGH);  g.fillRect(x + 2, y + 2, W - 4, 3);
      g.fillStyle(GRAIN);
      for (let gy = 9; gy < H - 13; gy += 7) g.fillRect(x + 4, y + gy, W - 8, 1);
      g.fillStyle(FRONT); g.fillRect(x + 2, y + H - 19, W - 4, 9);
      g.fillStyle(HIGH);  g.fillRect(x + 4, y + H - 19, W - 8, 2);
      g.fillStyle(DARK);
      g.fillRect(x + 6, y + H - 10, 8, 12);
      g.fillRect(x + W - 14, y + H - 10, 8, 12);
      this.graphics = [shadow, g];
    }
  }

  // ── Stove ─────────────────────────────────────────────────────────────────
  // Pixel-art cooking stove, 64 × 56 px.

  class Stove extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 64; this.h = 56;
      this._draw(x, y);
      this._addCollider(x + 32, y + 28, 64, 60);
    }
    _draw(x, y) {
      const W = 64, H = 56;
      const g = this.scene.add.graphics();
      // Body
      g.fillStyle(0x5A5A6A); g.fillRect(x, y + 14, W, H - 14);
      g.fillStyle(0x7A7A8A); g.fillRect(x + 2, y + 16, W - 4, H - 20);
      // Top surface
      g.fillStyle(0x3A3A4A); g.fillRect(x, y, W, 16);
      // Burners
      g.fillStyle(0x2A2A3A); g.fillRect(x + 6,  y + 2, 22, 11);
      g.fillStyle(0x2A2A3A); g.fillRect(x + 36, y + 2, 22, 11);
      // Hot centers
      g.fillStyle(0xE05820); g.fillRect(x + 12, y + 4, 10, 7);
      g.fillStyle(0xE05820); g.fillRect(x + 42, y + 4, 10, 7);
      g.fillStyle(0x1A1A2A); g.fillRect(x + 16, y + 5, 2, 5);
      g.fillStyle(0x1A1A2A); g.fillRect(x + 46, y + 5, 2, 5);
      // Oven door
      g.fillStyle(0x4A4A5A); g.fillRect(x + 6, y + 20, W - 12, H - 30);
      g.fillStyle(0x6A6A7A); g.fillRect(x + 8, y + 22, W - 16, H - 38);
      // Oven window
      g.fillStyle(0x222230); g.fillRect(x + 12, y + 26, W - 24, H - 48);
      // Handle bar
      g.fillStyle(0x3A3A4A); g.fillRect(x + 8, y + 18, W - 16, 3);
      // Knobs
      g.fillStyle(0xC0C0C0); g.fillRect(x + 10, y + 2, 6, 4);
      g.fillStyle(0xC0C0C0); g.fillRect(x + 48, y + 2, 6, 4);
      this.graphics = g;
    }
  }

  // ── Fridge ────────────────────────────────────────────────────────────────
  // Retro-style fridge, 48 × 80 px.

  class Fridge extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 48; this.h = 80;
      this._draw(x, y);
      this._addCollider(x + 24, y + 40, 48, 80);
    }
    _draw(x, y) {
      const W = 48, H = 80;
      const g = this.scene.add.graphics();
      // Outer shell
      g.fillStyle(0x6088A0); g.fillRect(x, y, W, H);
      // Main body face
      g.fillStyle(0xD8E8F0); g.fillRect(x + 2, y + 2, W - 4, H - 4);
      // Freezer divider line
      g.fillStyle(0x8AACBC); g.fillRect(x + 2, y + H / 3, W - 4, 4);
      // Depth shading on right
      g.fillStyle(0xA8C8D8); g.fillRect(x + W - 8, y + 2, 6, H - 4);
      // Freezer handle
      g.fillStyle(0x5078A0); g.fillRect(x + 4, y + 8,  4, 16);
      g.fillStyle(0x80A8C8); g.fillRect(x + 5, y + 9,  2, 14);
      // Fridge handle
      g.fillStyle(0x5078A0); g.fillRect(x + 4, y + H / 3 + 10, 4, 24);
      g.fillStyle(0x80A8C8); g.fillRect(x + 5, y + H / 3 + 11, 2, 22);
      // Highlight lines on freezer door
      g.fillStyle(0xB8D0E0); g.fillRect(x + 12, y + 6, W - 22, 2);
      g.fillStyle(0xB8D0E0); g.fillRect(x + 12, y + 10, W - 22, 2);
      this.graphics = g;
    }
  }

  // ── KitchenBench ──────────────────────────────────────────────────────────
  // Decorative kitchen counter/bench unit, 64 × 48 px.

  class KitchenBench extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 64; this.h = 48;
      this._draw(x, y);
      this._addCollider(x + 32, y + 24, 64, 48);
    }
    _draw(x, y) {
      const W = 64, H = 48;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.13);
      shadow.fillRect(x + 3, y + H + 2, W - 2, 5);
      g.fillStyle(0xD8E4EC); g.fillRect(x, y, W, H - 10);
      g.fillStyle(0xEEF4FA); g.fillRect(x + 2, y + 2, W - 4, 5);
      g.fillStyle(0xA0B8C4); g.fillRect(x, y + H - 10, W, 10);
      g.fillStyle(0x88A0B0); g.fillRect(x + W / 2 - 1, y + 8, 2, H - 18);
      g.fillStyle(0x607080); g.fillRect(x + W / 4 - 5,     y + H - 7, 10, 2);
      g.fillStyle(0x607080); g.fillRect(x + 3 * W / 4 - 5, y + H - 7, 10, 2);
      g.fillStyle(0x7090A0); g.fillRect(x, y, 3, H - 10);
      this.graphics = [shadow, g];
    }
  }

  // ── CoffeeMachine ─────────────────────────────────────────────────────────
  // Small espresso-style coffee machine, 32 × 40 px.

  class CoffeeMachine extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 32; this.h = 40;
      this._draw(x, y);
      this._addCollider(x + 16, y + 20, 32, 40);
    }
    _draw(x, y) {
      const W = 32, H = 40;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.15);
      shadow.fillRect(x + 3, y + H + 2, W - 2, 4);
      g.fillStyle(0x2A1A10); g.fillRect(x, y, W, H);
      g.fillStyle(0x3A2520); g.fillRect(x + 2, y + 2, W - 4, H - 4);
      g.fillStyle(0x30C050); g.fillRect(x + 8, y + 6, 16, 6);
      g.fillStyle(0x50E070); g.fillRect(x + 9, y + 7, 14, 4);
      g.fillStyle(0x1A0E08); g.fillRect(x + 8,  y + 18, 16, 10);
      g.fillStyle(0x2A1A10); g.fillRect(x + 10, y + 20, 12, 7);
      g.fillStyle(0x504030); g.fillRect(x + 4,  y + 29, W - 8, 4);
      g.fillStyle(0xFF6040); g.fillRect(x + 6,  y + 35, 6, 4);
      g.fillStyle(0x4080FF); g.fillRect(x + 14, y + 35, 6, 4);
      g.fillStyle(0x6A4A3A); g.fillRect(x + 2, y + 2, 3, H - 4);
      this.graphics = [shadow, g];
    }
  }

  // ── BeanBag ───────────────────────────────────────────────────────────────
  // Cosy rounded bean bag seat, 36 × 28 px.  colorScheme: 'teal' | 'purple' | 'coral'

  class BeanBag extends FurnitureBase {
    constructor(scene, x, y, colorScheme = 'teal') {
      super(scene, x, y);
      this.w = 36; this.h = 28;
      this._draw(x, y, colorScheme);
      this._addCollider(x + 18, y + 14, 36, 28);
    }
    _draw(x, y, scheme) {
      const W = 36, H = 28;
      const palettes = {
        teal:   { shad: 0x1A5858, base: 0x2A9090, mid: 0x40B0B0, hi: 0x70D8D8 },
        purple: { shad: 0x341860, base: 0x5A3090, mid: 0x7848B8, hi: 0xA070D0 },
        coral:  { shad: 0x783030, base: 0xC05040, mid: 0xD87060, hi: 0xF09080 },
      };
      const c      = palettes[scheme] || palettes.teal;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.2);
      shadow.fillEllipse(x + W / 2 + 2, y + H + 3, W - 6, 8);
      g.fillStyle(c.shad); g.fillEllipse(x + W / 2,     y + H / 2 + 2,  W,     H);
      g.fillStyle(c.base); g.fillEllipse(x + W / 2,     y + H / 2,      W,     H - 4);
      g.fillStyle(c.mid);  g.fillEllipse(x + W / 2,     y + H / 2,      W - 6, H - 8);
      g.fillStyle(c.hi);   g.fillEllipse(x + W / 2 - 4, y + H / 2 - 5, 10,    6);
      this.graphics = [shadow, g];
    }
  }

  // ── WashingMachine ────────────────────────────────────────────────────────
  // Front-loading washing machine, 48 × 56 px.

  class WashingMachine extends FurnitureBase {
    constructor(scene, x, y) {
      super(scene, x, y);
      this.w = 48; this.h = 56;
      this._draw(x, y);
      this._addCollider(x + 24, y + 28, 48, 56);
    }
    _draw(x, y) {
      const W = 48, H = 56;
      const g      = this.scene.add.graphics();
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.13);
      shadow.fillRect(x + 3, y + H + 2, W - 2, 5);
      g.fillStyle(0xE8EEF2); g.fillRect(x, y, W, H);
      g.fillStyle(0xF2F6FA); g.fillRect(x, y, W, 10);
      g.fillStyle(0xC8D4DC); g.fillRect(x + 2, y + 2, W - 4, 6);
      g.fillStyle(0x6080A0); g.fillEllipse(x + 8, y + 5, 6, 6);
      g.fillStyle(0x80A0C0); g.fillEllipse(x + 8, y + 4, 4, 4);
      g.fillStyle(0x204060); g.fillRect(x + 16, y + 3,  14, 5);
      g.fillStyle(0x40A0E0); g.fillRect(x + 17, y + 4,  12, 3);
      g.fillStyle(0x9AB0C0); g.fillEllipse(x + W / 2, y + H / 2 + 6, 30, 30);
      g.fillStyle(0x2040A0); g.fillEllipse(x + W / 2, y + H / 2 + 6, 26, 26);
      g.fillStyle(0x4060C0); g.fillEllipse(x + W / 2, y + H / 2 + 6, 22, 22);
      g.fillStyle(0x80B0D0); g.fillEllipse(x + W / 2, y + H / 2 + 6, 18, 18);
      g.fillStyle(0xFFFFFF); g.fillRect(x + W / 2 - 6, y + H / 2 + 2, 4, 3);
      g.fillStyle(0xF0C050); g.fillRect(x + W / 2 + 1, y + H / 2 + 8, 4, 3);
      g.fillStyle(0x8090A0); g.fillRect(x + W / 2 + 13, y + H / 2 + 4, 4, 8);
      g.fillStyle(0xC0CCD4); g.fillRect(x, y + H - 6, W, 6);
      g.fillStyle(0xA0B0B8); g.fillRect(x, y, 3, H);
      this.graphics = [shadow, g];
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  window.Furniture = {
    FurnitureBase, Chair, Desk, DeskSolo, DeskTwo, DeskFour,
    Plant, Bookshelf, WindowDecor,
    KitchenTable, Stove, Fridge,
    KitchenBench, CoffeeMachine, BeanBag, WashingMachine,
  };

})();
