/**
 * GameScene.js
 * Main Phaser 3 scene: room, furniture, player, interaction system.
 *
 * Room layout (1100 × 800 canvas):
 *   TOP ROW  (y=32-312): Gym (x=32-460) | Bath (x=492-680) | Laundry (x=712-1068)
 *   HORIZONTAL PARTITION (y=312-344)
 *   BOTTOM ROW (y=344-764): Study (x=32-768) | Kitchen (x=800-1068)
 */

const DIY_DEFS = {
  // Furniture
  'chair':          { w: 32,  h: 36,  color: 0x8B5E3C, label: 'CHAIR'         },
  'bean-bag':       { w: 36,  h: 28,  color: 0x2A9090, label: 'BEAN BAG'      },
  'desk-solo':      { w: 64,  h: 48,  color: 0xC8924A, label: 'SOLO DESK'     },
  'desk-two':       { w: 96,  h: 48,  color: 0xC8924A, label: '2P TABLE'      },
  'desk-four':      { w: 160, h: 72,  color: 0xA07030, label: '4P TABLE'      },
  'desk-six':       { w: 192, h: 56,  color: 0xC8924A, label: '6P DESK'       },
  // Decoration
  'plant':          { w: 32,  h: 48,  color: 0x52944A, label: 'PLANT'         },
  'shelf':          { w: 48,  h: 96,  color: 0x4A2E1A, label: 'SHELF'         },
  // Kitchen
  'kitchen-table':  { w: 128, h: 48,  color: 0xF0E4C4, label: 'DINING TABLE'  },
  'kitchen-bench':  { w: 64,  h: 48,  color: 0xD8E4EC, label: 'KITCHEN BENCH' },
  'stove':          { w: 64,  h: 56,  color: 0x222230, label: 'STOVE'         },
  'fridge':         { w: 48,  h: 80,  color: 0xC8E0F0, label: 'FRIDGE'        },
  'coffee-machine': { w: 32,  h: 40,  color: 0x2A1A10, label: 'COFFEE MACH.'  },
};

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Phaser lifecycle ──────────────────────────────────────────────────────

  create() {
    // ── State ──────────────────────────────────────────────
    this.isSitting      = false;
    this.nearestChair   = null;
    this.currentChair   = null;
    this.chairs         = [];
    this.furnitureItems = [];
    this.lastDir        = 'down';

    // DIY state
    this.diyMode        = false;
    this.diyType        = null;
    this.diyRotation    = 0;
    this.diyGhost       = null;
    this.diyPlaced      = [];
    this.diyObjects     = [];
    this.diyCreatorMode = false;
    this.diySelectedObj = null;
    this._diyHoverG       = null;
    this._diyGhostContent = [];
    this._diyGhostOverlay = null;
    this._inlineButtons   = null;
    this._diySelectedChair = null;
    this._diyColliding    = false;
    this._isDragPlacing   = false;
    this.isAtStove         = false;
    this._nearStove        = false;
    this._kitchenStoveZone = null;
    this._nearCoffeeMachine  = false;
    this._coffeeMachineZone  = null;
    this._coffeeTimeout      = null;
    this.isAtWashingMachine  = false;
    this._nearWashingMachine = false;
    this._laundryZone        = null;

    // Workout state (Feature 6)
    this._nearTreadmill  = false;
    this._treadmillZones = [];
    this.isWorkingOut    = false;

    // Bathroom state (Feature 3 + 6)
    this._nearSink   = false;
    this.isWashingUp = false;

    // ── Social / multiplayer state ─────────────────────────
    this.otherPlayers    = {};   // socketId → { sprite, nameTag, chatBubble, data }
    this._isMuted        = false;
    this._isDeaf         = false;
    this._chatPreference = 'sociable';
    this._chatOpen       = false;
    this._nearestOther   = null;  // socketId of nearest eligible player
    this._posLastSent    = 0;
    this._selfChatBubble = null;

    const gender = window.PlayerClass ? window.PlayerClass.getGender() : 'male';
    this._gender = gender;

    // ── Room (draw order = z depth) ────────────────────────
    this._createFloor();
    this._createRug();
    this._createFurniture();
    this._buildGym();
    this._buildBathroom();
    this._buildLaundry();
    this._buildHorizontalPartition();
    this._buildKitchen();
    this._createWalls();
    this._createWallDecor();

    // ── Player ─────────────────────────────────────────────
    window.PixelSprites.createAllTextures(this);
    this._setupAnimations(gender);
    this._createPlayer(gender);

    // ── Input ──────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,S,A,D', false);
    this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
    this.eKey.on('down', () => this._handleInteract());
    this.input.keyboard.removeCapture(32);

    // ── Physics world bounds ──
    this.physics.world.setBounds(32, 32, 1036, 732);

    // ── DIY placement system ────────────────────────────────
    const rKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R, false);
    const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
    rKey.on('down',   () => { if (this.diyMode) this._diyRotate(); });
    escKey.on('down', () => { if (this.diyMode) this.exitDIYPlacement(); });

    this.input.on('pointermove', (ptr) => { if (this.diyMode) this._diyMoveGhost(ptr); });
    this.input.on('pointerdown', (ptr) => {
      if (this.diyMode) {
        if (!this._isDragPlacing) this._diyClick(ptr);
      } else if (this.diyCreatorMode && ptr.button === 0) {
        if (this._checkInlineCtrlClick(ptr.worldX, ptr.worldY)) return;
        const hit = this._diyObjectAtPoint(ptr.worldX, ptr.worldY);
        if (hit) {
          this._diySelectObject(hit);
        } else {
          const chairHit = this._diyChairAtPoint(ptr.worldX, ptr.worldY);
          if (chairHit) this._diySelectChair(chairHit);
          else          this._diyDeselect();
        }
      }
    });

    this.input.on('pointerup', (ptr) => {
      if (this.diyMode && this._isDragPlacing && ptr.button === 0) {
        this._isDragPlacing = false;
        this._diyClick(ptr, true);
      }
    });

    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._loadDIYLayout();

    // ── T key → proximity chat (sociable players only) ──────
    const tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T, false);
    tKey.on('down', () => {
      if (this.isSitting || this._chatOpen) return;
      // Check if nearest player is locked in
      let nearestOp = null, nearestDist = Infinity;
      Object.values(this.otherPlayers).forEach(op => {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, op.data.x, op.data.y);
        if (d < 100 && d < nearestDist) { nearestDist = d; nearestOp = op; }
      });
      if (!nearestOp) return;
      if (nearestOp.data.chatPreference === 'lockedin') {
        window.showToast?.(nearestOp.data.name + ' is locked in to focus mode! Messages cannot be sent right now.');
        return;
      }
      if (this._nearestOther) this._openChat();
    });

    // ── Expose to other managers ───────────────────────────
    window.gameScene = this;

    // Flush any players that arrived before the scene was ready
    (window._pendingPlayers || []).forEach(p => this._spawnOtherPlayer(p));
    window._pendingPlayers = [];
  }

  update() {
    this._movePlayer();
    this._checkChairProximity();
    this._updateNameTag();
    this._updateStatusIcon();
    this._updatePrompts();
    if (this.diyCreatorMode && !this.diyMode) this._diyUpdateHover();
    this._checkKitchenZones();
    this._checkLaundryZones();
    this._checkGymZones();
    this._checkBathroomZones();
    // Dynamic depth sorting (Feature 4)
    this.player.setDepth(this.player.y);
    // ── Social update ──────────────────────────────────────
    this._checkProximityChat();
    this._broadcastPosition();
    if (this._selfChatBubble && this._selfChatBubble.active) {
      this._selfChatBubble.setPosition(this.player.x, this.player.y - 72).setDepth(this.player.y + 40);
    }
  }

  // ── Animations ───────────────────────────────────────────────────────────

  _setupAnimations(gender) {
    const g = gender;
    const fps = 6;

    const dirs = [
      { key: 'walk_down',  base: `player_${g}_down`  },
      { key: 'walk_up',    base: `player_${g}_up`    },
      { key: 'walk_right', base: `player_${g}_right` },
      { key: 'walk_left',  base: `player_${g}_right` },
    ];

    dirs.forEach(({ key, base }) => {
      if (this.anims.exists(key)) this.anims.remove(key);
      this.anims.create({
        key,
        frames: [
          { key: `${base}_0` },
          { key: `${base}_1` },
        ],
        frameRate: fps,
        repeat: -1,
      });
    });
  }

  // ── Room construction ─────────────────────────────────────────────────────

  _createFloor() {
    // Feature 1: solid single-colour floor for study
    const g = this.add.graphics();
    g.fillStyle(0xC49A6C);
    g.fillRect(32, 344, 736, 420);
    g.setDepth(0);
  }

  _createRug() {
    // Rug in study — updated coordinates (Feature 2)
    const g = this.add.graphics();
    const rx = 240, ry = 502, rw = 320, rh = 180;
    g.fillStyle(0x5B3080); g.fillRect(rx, ry, rw, rh);
    g.fillStyle(0x7040A0); g.fillRect(rx + 8, ry + 8, rw - 16, rh - 16);
    g.fillStyle(0x8050B8); g.fillRect(rx + 16, ry + 16, rw - 32, rh - 32);
    g.fillStyle(0xD4A040);
    g.fillRect(rx + 4, ry + 4, rw - 8, 4);
    g.fillRect(rx + 4, ry + rh - 8, rw - 8, 4);
    g.fillRect(rx + 4, ry + 4, 4, rh - 8);
    g.fillRect(rx + rw - 8, ry + 4, 4, rh - 8);
    for (const [cx, cy] of [
      [rx + 14, ry + 14], [rx + rw - 14, ry + 14],
      [rx + 14, ry + rh - 14], [rx + rw - 14, ry + rh - 14]
    ]) {
      g.fillStyle(0xD4A040);
      g.fillRect(cx - 2, cy - 6, 4, 12);
      g.fillRect(cx - 6, cy - 2, 12, 4);
    }
    g.setDepth(1);
  }

  _createFurniture() {
    let _hiddenStatics = [];
    try { _hiddenStatics = JSON.parse(localStorage.getItem('studyspace_hidden_statics') || '[]'); } catch (_) {}
    const isHidden = (type, cx, cy) =>
      _hiddenStatics.some(h => h.type === type && h.cx === cx && h.cy === cy);

    // ── Compact 6-seat desk (192×56) — updated coords (Feature 2) ───────────
    const DX = 304, DY = 550;
    const deskCX = DX + 96, deskCY = DY + 28;

    if (!isHidden('desk-six', deskCX, deskCY)) {
      const desk = new Furniture.Desk(this, DX, DY);
      desk.graphics.forEach ? desk.graphics.forEach(g => g.setDepth(DY + 56)) : desk.graphics.setDepth(DY + 56);
      this.furnitureItems.push(desk);

      const northY  = DY - 38;
      const southY  = DY + 58;
      const chairXs = [DX + 16, DX + 80, DX + 144];

      const chairGfx = [], chairIds = [];
      chairXs.forEach((cx, i) => {
        const nc = new Furniture.Chair(this, cx, northY, 'north');
        nc.graphics.setDepth(northY + 36);
        chairGfx.push(nc.graphics);
        const nId = `static-n${i}`;
        this.chairs.push({ id: nId, seatX: cx + 16, seatY: northY + 12, side: 'north', occupied: false });
        chairIds.push(nId);

        const sc = new Furniture.Chair(this, cx, southY, 'south');
        sc.graphics.setDepth(southY + 36);
        chairGfx.push(sc.graphics);
        const sId = `static-s${i}`;
        this.chairs.push({ id: sId, seatX: cx + 16, seatY: southY + 20, side: 'south', occupied: false });
        chairIds.push(sId);
      });

      this._registerStaticItem('desk-six', deskCX, deskCY, 0, {
        rawGraphics: [...(Array.isArray(desk.graphics) ? desk.graphics : [desk.graphics]), ...chairGfx],
        rawCollider: desk.collider,
        chairIds,
        furnitureRef: desk,
      });
    }

    // ── Corner plants — updated coords (Feature 2) ────────────────────────
    [[52, 392], [720, 392], [52, 752], [720, 752]].forEach(([px, py]) => {
      const pcx = px + 16, pcy = py + 24;
      if (isHidden('plant', pcx, pcy)) return;
      const plant = new Furniture.Plant(this, px, py);
      plant.graphics.setDepth(py + 48);
      this.furnitureItems.push(plant);
      this._registerStaticItem('plant', pcx, pcy, 0, {
        rawGraphics: [plant.graphics],
        rawCollider: plant.collider,
        furnitureRef: plant,
      });
    });

    // ── Bookshelf (left wall) — updated coords (Feature 2) ──────────────────
    const shelfCX = 44 + 24, shelfCY = 392 + 48;
    if (!isHidden('shelf', shelfCX, shelfCY)) {
      const shelf = new Furniture.Bookshelf(this, 44, 392);
      shelf.graphics.setDepth(392 + 96);
      this.furnitureItems.push(shelf);
      this._registerStaticItem('shelf', shelfCX, shelfCY, 0, {
        rawGraphics: [shelf.graphics],
        rawCollider: shelf.collider,
        furnitureRef: shelf,
      });
    }

    // ── Bean bags — updated coords (Feature 2) ────────────────────────────
    [{ x: 108, y: 488, scheme: 'teal', id: 'beanbag-0' },
     { x: 158, y: 476, scheme: 'purple', id: 'beanbag-1' }].forEach(({ x, y, scheme, id }) => {
      const bb = new Furniture.BeanBag(this, x, y, scheme);
      [bb.graphics].flat().forEach(g => g?.setDepth?.(y + 28));
      this.furnitureItems.push(bb);
      this.chairs.push({
        id,
        seatX: x + 18,
        seatY: y + 14,
        side: 'north',
        occupied: false,
        type: 'beanbag',
      });
    });
  }

  /** Register a scene-built (non-DIY) furniture item so creator mode can select it. */
  _registerStaticItem(type, cx, cy, rotation, extra = {}) {
    const def = DIY_DEFS[type];
    if (!def) return;
    const swapped = rotation === 1 || rotation === 3;
    const obj = {
      type, cx, cy, rotation,
      halfW: (swapped ? def.h : def.w) / 2,
      halfH: (swapped ? def.w : def.h) / 2,
      containers: [],
      colliders:    extra.rawCollider ? [extra.rawCollider] : [],
      chairIds:     extra.chairIds    || [],
      rawGraphics:  extra.rawGraphics || [],
      furnitureRef: extra.furnitureRef || null,
      isStatic: true,
    };
    this.diyObjects.push(obj);
  }

  _createWalls() {
    const g = this.add.graphics();
    const wallColor  = 0x4A3520;
    const wallFront  = 0x6B5030;
    const baseboard  = 0x3A2815;
    const wallStripe = 0x8B6540;

    // South external wall (study bottom at y=764)
    g.fillStyle(wallColor);
    g.fillRect(0, 764, 768, 36);

    // West external wall — full height
    g.fillStyle(wallColor);
    g.fillRect(0, 32, 32, 732);

    // East wall of study column (x=768-800) — study portion only (y=344-764)
    g.fillStyle(wallColor);
    g.fillRect(768, 344, 32, 420);

    // Study north face at y=344-360
    g.fillStyle(wallFront);
    g.fillRect(32, 344, 736, 16);
    g.setDepth(3);

    // Decorative stripe
    g.fillStyle(wallStripe);
    g.fillRect(32, 360, 736, 3);

    // Baseboards
    g.fillStyle(baseboard);
    g.fillRect(32, 756, 736, 8);
    g.fillRect(32, 360, 8, 396);
    g.fillRect(760, 360, 8, 396);
    g.setDepth(2);
  }

  _createWallDecor() {
    // Window (right wall area) — updated coords (Feature 2)
    new Furniture.WindowDecor(this, 650, 364);

    // Notice board — updated coords (Feature 2)
    const g = this.add.graphics();
    const nx = 360, ny = 364;
    g.fillStyle(0x8B6040); g.fillRect(nx, ny + 18, 80, 22);
    g.fillStyle(0xD4B070); g.fillRect(nx + 2, ny + 20, 76, 18);
    g.fillStyle(0x4A2C0A);
    g.fillRect(nx - 2, ny + 16, 84, 4);
    g.fillRect(nx - 2, ny + 40, 84, 4);
    g.fillRect(nx - 2, ny + 16, 4, 28);
    g.fillRect(nx + 78, ny + 16, 4, 28);
    g.fillStyle(0xF0F0E0); g.fillRect(nx + 6,  ny + 22, 16, 12);
    g.fillStyle(0xFFE0A0); g.fillRect(nx + 26, ny + 22, 16, 12);
    g.fillStyle(0xE0F0E0); g.fillRect(nx + 46, ny + 22, 16, 12);
    g.setDepth(3);
  }

  // ── Player ────────────────────────────────────────────────────────────────

  _createPlayer(gender) {
    const startTex = `player_${gender}_down_0`;
    this.player = this.physics.add.sprite(400, 560, startTex);
    this.player.setCollideWorldBounds(true);
    // NOTE: depth is set dynamically in update() — Feature 4
    this.player.setOrigin(0.5, 1);

    this.player.body.setSize(18, 10);
    this.player.body.setOffset(7, 38);

    this.furnitureItems.forEach((item) => {
      if (item.collider) {
        this.physics.add.collider(this.player, item.collider);
      }
    });

    const name = window.gameState?.playerName || window.PlayerClass?.getName() || 'Player';
    this.nameTag = this.add.text(0, 0, name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '7px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#1a0b2e',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setVisible(false);

    this.hoverHighlight = this.add.graphics().setVisible(false);
    this.hoverHighlight.lineStyle(2, 0x9B6BDB, 1);
    this.hoverHighlight.strokeRect(-18, -48, 36, 48);

    this.player.setInteractive(
      new Phaser.Geom.Rectangle(-18, -48, 36, 48),
      Phaser.Geom.Rectangle.Contains
    );
    this.player.on('pointerover',  () => {
      this.nameTag.setVisible(true);
      this.hoverHighlight.setVisible(true);
    });
    this.player.on('pointerout',   () => {
      this.nameTag.setVisible(false);
      this.hoverHighlight.setVisible(false);
    });

    this.statusIcon = this.add.image(0, 0, 'icon_book')
      .setVisible(false).setOrigin(0.5, 1);
    this._iconYOffset = 0;
    this._iconTween   = null;
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  _movePlayer() {
    if (this.isSitting) {
      this.player.setVelocity(0, 0);
      return;
    }

    const focused = document.activeElement;
    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
      this.player.setVelocity(0, 0);
      return;
    }

    const speed = 130;
    let vx = 0, vy = 0;

    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    if (left)  vx = -speed;
    if (right) vx =  speed;
    if (up)    vy = -speed;
    if (down)  vy =  speed;

    if (vx !== 0 && vy !== 0) {
      const s = 1 / Math.SQRT2;
      vx *= s; vy *= s;
    }

    this.player.setVelocity(vx, vy);

    const isMoving = vx !== 0 || vy !== 0;

    if (isMoving) {
      if (left) {
        this.lastDir = 'left';
        this.player.setFlipX(true);
        this.player.play('walk_right', true);
      } else if (right) {
        this.lastDir = 'right';
        this.player.setFlipX(false);
        this.player.play('walk_right', true);
      } else if (up) {
        this.lastDir = 'up';
        this.player.setFlipX(false);
        this.player.play('walk_up', true);
      } else if (down) {
        this.lastDir = 'down';
        this.player.setFlipX(false);
        this.player.play('walk_down', true);
      }
    } else {
      this.player.anims.stop();
      const flipX = (this.lastDir === 'left');
      const dirKey = (this.lastDir === 'left') ? 'right' : this.lastDir;
      this.player.setTexture(`player_${this._gender}_${dirKey}_0`);
      this.player.setFlipX(flipX);
    }
  }

  _updateNameTag() {
    const px = this.player.x;
    const py = this.player.y;
    this.nameTag.setPosition(px, py - 52);
    this.nameTag.setDepth(this.player.y + 35);
    this.hoverHighlight.setPosition(px, py);
    this.hoverHighlight.setDepth(this.player.y - 1);
  }

  _updateStatusIcon() {
    if (!this.statusIcon || !this.statusIcon.visible) return;
    const bob = Math.sin(this.time.now / 300) * 2;
    this.statusIcon.setPosition(this.player.x, this.player.y - 54 + bob);
    this.statusIcon.setDepth(this.player.y + 30);
  }

  // Show/hide status icon above player's head
  setStatusIcon(type) {
    if (!this.statusIcon) return;
    if (this._iconTween) { this._iconTween.stop(); this._iconTween = null; }
    this._iconYOffset = 0;

    if (!type) {
      this.statusIcon.setVisible(false);
      return;
    }

    let texKey;
    if (type === 'focus')        texKey = 'icon_book';
    else if (type === 'break')   texKey = 'icon_coffee';
    else if (type === 'pause')   texKey = 'icon_pause';
    else if (type === 'eating')  texKey = 'icon_fork';
    else if (type === 'cooking') texKey = 'icon_fire';
    else if (type === 'relax')   texKey = 'icon_relax';
    else if (type === 'laundry') texKey = 'icon_laundry';
    else if (type === 'coffee')  texKey = 'icon_coffee';
    else if (type === 'workout') texKey = 'icon_fire';
    else                         texKey = 'icon_book';

    this.statusIcon.setTexture(texKey).setVisible(true);
  }

  // ── Chair proximity ───────────────────────────────────────────────────────

  _checkChairProximity() {
    if (this.isSitting) {
      this.nearestChair = null;
      return;
    }

    const otherPos = Object.values(this.otherPlayers).map(op => ({ x: op.data.x, y: op.data.y }));
    let nearest = null, nearestDist = Infinity;
    this.chairs.forEach((chair) => {
      if (chair.occupied) return;
      // Block if another player is sitting at this chair position
      if (otherPos.some(p => Phaser.Math.Distance.Between(p.x, p.y, chair.seatX, chair.seatY) < 25)) return;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        chair.seatX, chair.seatY
      );
      if (d < 60 && d < nearestDist) {
        nearestDist = d;
        nearest = chair;
      }
    });
    this.nearestChair = nearest;
  }

  // ── Prompt visibility (called each frame) ─────────────────────────────────

  _updatePrompts() {
    const sitEl     = document.getElementById('interaction-prompt');
    const standEl   = document.getElementById('stand-prompt');
    const cookEl    = document.getElementById('cook-prompt');
    const coffeeEl  = document.getElementById('coffee-prompt');
    const laundryEl = document.getElementById('laundry-prompt');
    const workoutEl = document.getElementById('workout-prompt');
    const washupEl  = document.getElementById('washup-prompt');
    if (!sitEl || !standEl) return;

    const busyZone  = this._nearStove || this.isAtStove || this._nearCoffeeMachine
                      || this._nearWashingMachine || this.isAtWashingMachine
                      || this._nearTreadmill || this.isWorkingOut
                      || this._nearSink || this.isWashingUp;
    const wantCook    = this._nearStove && !this.isSitting && !this.isAtStove;
    const wantStop    = this.isAtStove;
    const wantCoffee  = this._nearCoffeeMachine && !this.isSitting && !busyZone;
    const wantLaundry = this._nearWashingMachine && !this.isSitting && !this.isAtWashingMachine;
    const wantStopLaundry = this.isAtWashingMachine;
    const wantWorkout = this._nearTreadmill && !this.isSitting && !this.isWorkingOut;
    const wantStopWorkout = this.isWorkingOut;
    const wantWashUp = this._nearSink && !this.isSitting && !this.isWashingUp;
    const wantStopWashUp = this.isWashingUp;
    const wantSit     = !this.isSitting && !busyZone && !!this.nearestChair;
    const wantStand   = this.isSitting;

    if (wantSit && this.nearestChair?.type === 'dining') {
      sitEl.textContent = '[E] Sit & Eat';
    } else if (wantSit && this.nearestChair?.type === 'beanbag') {
      sitEl.textContent = '[E] Chill Out';
    } else if (wantSit) {
      sitEl.textContent = '[E] Sit Down';
    }

    if (cookEl) {
      cookEl.textContent = wantStop ? '[E] Stop Cooking' : '[E] Start Cooking';
      const showCook = wantCook || wantStop;
      const cookShown = !cookEl.classList.contains('hidden');
      if (showCook !== cookShown) cookEl.classList.toggle('hidden', !showCook);
    }

    if (coffeeEl) {
      const coffeeShown = !coffeeEl.classList.contains('hidden');
      if (wantCoffee !== coffeeShown) coffeeEl.classList.toggle('hidden', !wantCoffee);
    }

    if (laundryEl) {
      laundryEl.textContent = wantStopLaundry ? '[E] Stop Laundry' : '[E] Start Laundry';
      const showLaundry = wantLaundry || wantStopLaundry;
      const laundryShown = !laundryEl.classList.contains('hidden');
      if (showLaundry !== laundryShown) laundryEl.classList.toggle('hidden', !showLaundry);
    }

    if (workoutEl) {
      workoutEl.textContent = wantStopWorkout ? '[E] Stop Working Out' : '[E] Work Out';
      const showWorkout = wantWorkout || wantStopWorkout;
      const workoutShown = !workoutEl.classList.contains('hidden');
      if (showWorkout !== workoutShown) workoutEl.classList.toggle('hidden', !showWorkout);
    }

    if (washupEl) {
      washupEl.textContent = wantStopWashUp ? '[E] Stop Washing Up' : '[E] Wash Up';
      const showWashUp = wantWashUp || wantStopWashUp;
      const washupShown = !washupEl.classList.contains('hidden');
      if (showWashUp !== washupShown) washupEl.classList.toggle('hidden', !showWashUp);
    }

    const sitShown   = !sitEl.classList.contains('hidden');
    const standShown = !standEl.classList.contains('hidden');

    if (wantSit !== sitShown) {
      sitEl.classList.toggle('hidden', !wantSit);
      if (wantSit) {
        sitEl.classList.add('is-appearing');
        setTimeout(() => sitEl.classList.remove('is-appearing'), 220);
      }
    }

    if (wantStand !== standShown) {
      standEl.classList.toggle('hidden', !wantStand);
    }
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  _handleInteract() {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    if (this.isWorkingOut)                              { this._stopWorkout();    return; }
    if (this._nearTreadmill && !this.isSitting)         { this._startWorkout();   return; }
    if (this.isWashingUp)                               { this._stopWashUp();     return; }
    if (this._nearSink && !this.isSitting)              { this._startWashUp();    return; }
    if (this.isAtStove)                                 { this._stopCooking();    return; }
    if (this._nearStove && !this.isSitting)             { this._startCooking();   return; }
    if (this.isAtWashingMachine)                        { this._stopLaundry();    return; }
    if (this._nearWashingMachine && !this.isSitting)    { this._startLaundry();   return; }
    if (this._nearCoffeeMachine && !this.isSitting)     { this._grabCoffee();     return; }
    if (!this.isSitting && this.nearestChair)           { this._sitDown(this.nearestChair); return; }
    if (this.isSitting)                                 { this.standUp();         return; }
  }

  _sitDown(chair) {
    if (chair.occupied) return;
    chair.occupied    = true;
    this.isSitting    = true;
    this.currentChair = chair;

    SoundManager.play('sit');
    this.player.body.setVelocity(0, 0);

    this.tweens.add({
      targets:  this.player,
      x:        chair.seatX,
      y:        chair.seatY,
      duration: 220,
      ease:     'Power2',
      onComplete: () => {
        this.player.body.moves = false;
        this.player.body.setVelocity(0, 0);

        const sitTex = chair.side === 'north'
          ? `player_${this._gender}_sit`
          : `player_${this._gender}_up_0`;
        this.player.setTexture(sitTex);
        this.player.setFlipX(false);

        this._updatePrompts();

        if (chair.type === 'dining') {
          this.setStatusIcon('eating');
          const si = document.getElementById('status-indicator');
          if (si) { si.textContent = '● EATING'; si.className = 'status-idle'; }
          const eatModal = document.getElementById('eat-modal');
          if (eatModal) { eatModal.classList.remove('hidden'); eatModal.classList.add('active'); }
        } else if (chair.type === 'beanbag') {
          this.setStatusIcon('relax');
          const si = document.getElementById('status-indicator');
          if (si) { si.textContent = '● RELAXING'; si.className = 'status-idle'; }
          const relaxModal = document.getElementById('relax-modal');
          if (relaxModal) { relaxModal.classList.remove('hidden'); relaxModal.classList.add('active'); }
        } else {
          const si = document.getElementById('status-indicator');
          if (si) { si.textContent = '● AT DESK'; si.className = 'status-idle'; }
          const pModal = document.getElementById('pomodoro-modal');
          if (pModal) {
            pModal.classList.remove('hidden');
            pModal.classList.add('active');
          }
        }
      },
    });
  }

  standUp() {
    if (!this.isSitting) return;

    if (this.currentChair?.type === 'dining' || this.currentChair?.type === 'beanbag') {
      this._doStandUp();
      return;
    }

    if (window.PomodoroManager && window.PomodoroManager.isRunning()) {
      const msgEl = document.getElementById('stop-confirm-msg');
      if (msgEl) msgEl.textContent = 'Standing up will stop your timer. Are you sure?';
      window.PomodoroManager.requestStop(() => this._doStandUp());
      return;
    }

    this._doStandUp();
  }

  _doStandUp() {
    if (!this.isSitting) return;

    SoundManager.play('standup');
    if (window.ActivityTimer?.isRunning()) window.ActivityTimer.stop();

    const pModal = document.getElementById('pomodoro-modal');
    if (pModal) {
      pModal.classList.add('hidden');
      pModal.classList.remove('active');
    }

    if (window.PomodoroManager) window.PomodoroManager.stop();

    const side = this.currentChair ? this.currentChair.side : 'south';
    const offset = side === 'north' ? -60 : 60;

    if (this.currentChair) this.currentChair.occupied = false;
    this.isSitting    = false;
    this.currentChair = null;

    const newX = this.player.x;
    const newY = this.player.y + offset;
    this.player.body.moves  = true;
    this.player.body.enable = true;
    this.player.body.reset(newX, newY);

    const dirKey = side === 'north' ? 'up' : 'down';
    this.lastDir  = dirKey;
    this.player.setTexture(`player_${this._gender}_${dirKey}_0`);
    this.player.setFlipX(false);

    this.setStatusIcon(null);

    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
  }

  standUpAfterTimer() {
    this._doStandUp();
  }

  // ── DIY Placement system ──────────────────────────────────────────────────

  enterDIYPlacement(type) {
    this._diyDeselect();
    if (this.diyMode) this.exitDIYPlacement();
    this.diyMode          = true;
    this.diyType          = type;
    this.diyRotation      = 0;
    this._diyGhostContent = [];

    this.diyGhost  = this.add.container(400, 300).setDepth(100);
    this.diyGhostT = this.add.text(0, -56, '', {
      fontFamily: '"Press Start 2P", monospace', fontSize: '7px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000080', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1);
    this.diyGhost.add(this.diyGhostT);
    this._diyRefreshGhost();

    this._diyShowControls('place');
    const lbl = document.getElementById('diy-placing-label');
    if (lbl) lbl.textContent = `Placing: ${DIY_DEFS[type]?.label || type}`;
  }

  exitDIYPlacement() {
    this.diyMode = false;
    this.diyType = null;
    if (this.diyGhost) { this.diyGhost.destroy(true); this.diyGhost = null; }
    this._diyGhostContent = [];
    document.querySelectorAll('.diy-item-btn').forEach(b => b.classList.remove('active'));
    this._diyShowControls('none');
  }

  _diyRotate() {
    this.diyRotation = (this.diyRotation + 1) % 4;
    this._diyRefreshGhost();
  }

  _diyRefreshGhost() {
    if (!this.diyGhost) return;
    const def = DIY_DEFS[this.diyType];
    if (!def) return;

    if (this._diyGhostContent) {
      this._diyGhostContent.forEach(g => { if (g && g.active) g.destroy(); });
    }
    this._diyGhostContent = [];

    const rot = this.diyRotation;

    let fi = null;
    switch (this.diyType) {
      case 'chair':          fi = new Furniture.Chair(this, 0, 0, 'south');   break;
      case 'bean-bag':       fi = new Furniture.BeanBag(this, 0, 0, 'teal');  break;
      case 'plant':          fi = new Furniture.Plant(this, 0, 0);            break;
      case 'shelf':          fi = new Furniture.Bookshelf(this, 0, 0);        break;
      case 'desk-solo':      fi = new Furniture.DeskSolo(this, 0, 0);         break;
      case 'desk-two':       fi = new Furniture.DeskTwo(this, 0, 0);          break;
      case 'desk-four':      fi = new Furniture.DeskFour(this, 0, 0);         break;
      case 'desk-six':       fi = new Furniture.Desk(this, 0, 0);             break;
      case 'kitchen-table':  fi = new Furniture.KitchenTable(this, 0, 0);     break;
      case 'kitchen-bench':  fi = new Furniture.KitchenBench(this, 0, 0);     break;
      case 'stove':          fi = new Furniture.Stove(this, 0, 0);            break;
      case 'fridge':         fi = new Furniture.Fridge(this, 0, 0);           break;
      case 'coffee-machine': fi = new Furniture.CoffeeMachine(this, 0, 0);    break;
    }

    if (fi) {
      if (fi.collider) { fi.collider.destroy(); fi.collider = null; }
      const gfxList = Array.isArray(fi.graphics) ? fi.graphics : [fi.graphics];
      gfxList.forEach(g => {
        if (!g || !g.active) return;
        g.x     = -def.w / 2;
        g.y     = -def.h / 2;
        g.alpha = 0.55;
        this.diyGhost.add(g);
        this._diyGhostContent.push(g);
      });
    } else {
      const swapped = rot === 1 || rot === 3;
      const w = swapped ? def.h : def.w;
      const h = swapped ? def.w : def.h;
      const r = this.add.graphics();
      r.fillStyle(def.color, 0.5);
      r.fillRect(-w / 2, -h / 2, w, h);
      r.lineStyle(2, 0xffffff, 0.8);
      r.strokeRect(-w / 2, -h / 2, w, h);
      this.diyGhost.add(r);
      this._diyGhostContent.push(r);
    }

    const chairLayouts = {
      'desk-solo':     [{ side: 'south', lx: 0,           ly:  def.h / 2 + 30 }],
      'desk-two':      [{ side: 'north', lx: 0,           ly: -(def.h / 2 + 30) },
                        { side: 'south', lx: 0,           ly:  def.h / 2 + 30 }],
      'desk-four':     [{ side: 'north', lx: -def.w / 4,  ly: -(def.h / 2 + 32) },
                        { side: 'north', lx:  def.w / 4,  ly: -(def.h / 2 + 32) },
                        { side: 'south', lx: -def.w / 4,  ly:  def.h / 2 + 32 },
                        { side: 'south', lx:  def.w / 4,  ly:  def.h / 2 + 32 }],
      'desk-six':      [...[-64, 0, 64].map(lx => ({ side: 'north', lx, ly: -(def.h / 2 + 24) })),
                        ...[-64, 0, 64].map(lx => ({ side: 'south', lx, ly:  def.h / 2 + 24 }))],
      'kitchen-table': [{ side: 'north', lx: -32, ly: -(def.h / 2 + 30) },
                        { side: 'north', lx:  32, ly: -(def.h / 2 + 30) },
                        { side: 'south', lx: -32, ly:  def.h / 2 + 30 },
                        { side: 'south', lx:  32, ly:  def.h / 2 + 30 }],
    };
    (chairLayouts[this.diyType] || []).forEach(({ side, lx, ly }) => {
      const ch = new Furniture.Chair(this, 0, 0, side);
      if (ch.collider) { ch.collider.destroy(); ch.collider = null; }
      ch.graphics.x = lx - 16;
      ch.graphics.y = ly - 18;
      ch.graphics.alpha = 0.45;
      this.diyGhost.add(ch.graphics);
      this._diyGhostContent.push(ch.graphics);
    });

    this._diyGhostOverlay = this.add.graphics();
    this.diyGhost.add(this._diyGhostOverlay);

    this.diyGhost.setAngle(rot * 90);

    const angles = ['0°', '90°', '180°', '270°'];
    if (this.diyGhostT) this.diyGhostT.setText(`${def.label}  ${angles[rot]}`);
  }

  _diyMoveGhost(ptr) {
    if (!this.diyGhost) return;
    const x = Math.round(ptr.worldX / 16) * 16;
    const y = Math.round(ptr.worldY / 16) * 16;
    this.diyGhost.setPosition(x, y);
    // Updated room coordinates (Feature 2)
    const inStudy   = x >= 64  && x <= 736  && y >= 360 && y <= 748;
    const inKitchen = x >= 832 && x <= 1052 && y >= 360 && y <= 748;
    const inLaundry = x >= 744 && x <= 1052 && y >= 48  && y <= 296;
    const inGym     = x >= 64  && x <= 444  && y >= 48  && y <= 296;
    const inBath    = x >= 508 && x <= 668  && y >= 48  && y <= 296;
    const inRoom    = inStudy || inKitchen || inLaundry || inGym || inBath;
    this._diyColliding = inRoom && this._diyCheckCollision(x, y);
    this.diyGhost.alpha = inRoom ? 1 : 0.3;

    if (this._diyGhostOverlay) {
      const def = DIY_DEFS[this.diyType];
      this._diyGhostOverlay.clear();
      if (def) {
        const col  = (!inRoom || this._diyColliding) ? 0xff3333 : 0x00ff88;
        const alf  = (!inRoom || this._diyColliding) ? 0.9 : 0.5;
        this._diyGhostOverlay.lineStyle(2, col, alf);
        this._diyGhostOverlay.strokeRect(-def.w / 2, -def.h / 2, def.w, def.h);
      }
    }
  }

  _diyClick(ptr, fromDrag = false) {
    if (ptr.button === 2) { this.exitDIYPlacement(); return; }
    const x = Math.round(ptr.worldX / 16) * 16;
    const y = Math.round(ptr.worldY / 16) * 16;
    // Updated room coordinates (Feature 2)
    const inStudy   = x >= 64  && x <= 736  && y >= 360 && y <= 748;
    const inKitchen = x >= 832 && x <= 1052 && y >= 360 && y <= 748;
    const inLaundry = x >= 744 && x <= 1052 && y >= 48  && y <= 296;
    const inGym     = x >= 64  && x <= 444  && y >= 48  && y <= 296;
    const inBath    = x >= 508 && x <= 668  && y >= 48  && y <= 296;
    if (!inStudy && !inKitchen && !inLaundry && !inGym && !inBath) return;
    if (this._diyColliding) return;
    this._diyCreateItem(this.diyType, x, y, this.diyRotation);
    this._saveDIYLayout();
    this.exitDIYPlacement();
  }

  _diyLocalToWorld(cx, cy, lx, ly, rotation) {
    const a   = rotation * (Math.PI / 2);
    const cos = Math.round(Math.cos(a));
    const sin = Math.round(Math.sin(a));
    return { x: cx + cos * lx - sin * ly, y: cy + sin * lx + cos * ly };
  }

  _diyWrapContainer(furnitureItem, cx, cy, halfW, halfH, angleDeg) {
    const graphics = Array.isArray(furnitureItem.graphics)
      ? furnitureItem.graphics : [furnitureItem.graphics];
    const container = this.add.container(cx, cy).setDepth(10);
    graphics.forEach(g => {
      if (!g) return;
      g.x = -halfW;
      g.y = -halfH;
      container.add(g);
    });
    container.setAngle(angleDeg);
    return container;
  }

  _diyAddCollider(cx, cy, cw, ch) {
    const rect = this.add.rectangle(cx, cy, cw, ch).setVisible(false);
    this.physics.add.existing(rect, true);
    rect._arcadeCollider = this.physics.add.collider(this.player, rect);
    return rect;
  }

  _diyCreateItem(type, cx, cy, rotation) {
    const def = DIY_DEFS[type];
    if (!def) return;
    const angleDeg = rotation * 90;
    const swapped  = rotation === 1 || rotation === 3;
    const colW     = swapped ? def.h : def.w;
    const colH     = swapped ? def.w : def.h;

    const obj = {
      type, cx, cy, rotation,
      halfW: colW / 2, halfH: colH / 2,
      containers: [], colliders: [], chairIds: [], chairDetails: [],
    };

    const wrapC = (fi, x, y, hw, hh) => {
      const c = this._diyWrapContainer(fi, x, y, hw, hh, angleDeg);
      obj.containers.push(c);
      return c;
    };
    const addCol = (x, y, w, h) => {
      const r = this._diyAddCollider(x, y, w, h);
      obj.colliders.push(r);
      return r;
    };
    const addChair = (side, wx, wy, type = undefined) => {
      const ch = new Furniture.Chair(this, 0, 0, side);
      const c  = wrapC(ch, wx, wy, 16, 18);
      const id = `diy-ch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const entry = { id, seatX: wx, seatY: wy, side, occupied: false };
      if (type) entry.type = type;
      this.chairs.push(entry);
      obj.chairIds.push(id);
      obj.chairDetails.push({ id, container: c, seatX: wx, seatY: wy });
    };

    switch (type) {
      case 'chair': {
        const side = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        const ch   = new Furniture.Chair(this, 0, 0, side);
        wrapC(ch, cx, cy, def.w / 2, def.h / 2);
        const id = `diy-ch-${Date.now()}`;
        this.chairs.push({ id, seatX: cx, seatY: cy, side, occupied: false });
        obj.chairIds.push(id);
        break;
      }

      case 'plant': {
        const pl = new Furniture.Plant(this, 0, 0);
        if (pl.collider) { pl.collider.destroy(); pl.collider = null; }
        wrapC(pl, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'shelf': {
        const sh = new Furniture.Bookshelf(this, 0, 0);
        if (sh.collider) { sh.collider.destroy(); sh.collider = null; }
        wrapC(sh, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'desk-solo': {
        const ds = new Furniture.DeskSolo(this, 0, 0);
        if (ds.collider) { ds.collider.destroy(); ds.collider = null; }
        wrapC(ds, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH + 8);
        const gap = 30;
        const sSide = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        const sPos  = this._diyLocalToWorld(cx, cy, 0, def.h / 2 + gap, rotation);
        addChair(sSide, sPos.x, sPos.y);
        break;
      }

      case 'desk-two': {
        const dt = new Furniture.DeskTwo(this, 0, 0);
        if (dt.collider) { dt.collider.destroy(); dt.collider = null; }
        wrapC(dt, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH + 8);
        const gap2   = 30;
        const nSide2 = (rotation === 2 || rotation === 3) ? 'south' : 'north';
        const sSide2 = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        addChair(nSide2, ...Object.values(this._diyLocalToWorld(cx, cy, 0, -(def.h / 2 + gap2), rotation)));
        addChair(sSide2, ...Object.values(this._diyLocalToWorld(cx, cy, 0,  (def.h / 2 + gap2), rotation)));
        break;
      }

      case 'desk-four': {
        const df = new Furniture.DeskFour(this, 0, 0);
        if (df.collider) { df.collider.destroy(); df.collider = null; }
        wrapC(df, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH + 16);
        const gap4   = 32;
        const nSide4 = (rotation === 2 || rotation === 3) ? 'south' : 'north';
        const sSide4 = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        for (let i = 0; i < 2; i++) {
          const lx = -def.w / 4 + i * (def.w / 2);
          addChair(nSide4, ...Object.values(this._diyLocalToWorld(cx, cy, lx, -(def.h / 2 + gap4), rotation)));
          addChair(sSide4, ...Object.values(this._diyLocalToWorld(cx, cy, lx,  (def.h / 2 + gap4), rotation)));
        }
        break;
      }

      case 'desk-six': {
        const d6 = new Furniture.Desk(this, 0, 0);
        if (d6.collider) { d6.collider.destroy(); d6.collider = null; }
        wrapC(d6, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH + 16);
        const gap6   = 24;
        const nSide6 = (rotation === 2 || rotation === 3) ? 'south' : 'north';
        const sSide6 = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        [-64, 0, 64].forEach(lx => {
          addChair(nSide6, ...Object.values(this._diyLocalToWorld(cx, cy, lx, -(def.h / 2 + gap6), rotation)));
          addChair(sSide6, ...Object.values(this._diyLocalToWorld(cx, cy, lx,  (def.h / 2 + gap6), rotation)));
        });
        break;
      }

      case 'kitchen-table': {
        const kt = new Furniture.KitchenTable(this, 0, 0);
        if (kt.collider) { kt.collider.destroy(); kt.collider = null; }
        wrapC(kt, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH + 8);
        const gapKT = 30;
        const nKT = (rotation === 2 || rotation === 3) ? 'south' : 'north';
        const sKT = (rotation === 2 || rotation === 3) ? 'north' : 'south';
        [-32, 32].forEach(lx => {
          addChair(nKT, ...Object.values(this._diyLocalToWorld(cx, cy, lx, -(def.h / 2 + gapKT), rotation)), 'dining');
          addChair(sKT, ...Object.values(this._diyLocalToWorld(cx, cy, lx,  (def.h / 2 + gapKT), rotation)), 'dining');
        });
        break;
      }

      case 'kitchen-bench': {
        const kb = new Furniture.KitchenBench(this, 0, 0);
        if (kb.collider) { kb.collider.destroy(); kb.collider = null; }
        wrapC(kb, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'stove': {
        const sv = new Furniture.Stove(this, 0, 0);
        if (sv.collider) { sv.collider.destroy(); sv.collider = null; }
        wrapC(sv, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'fridge': {
        const fr = new Furniture.Fridge(this, 0, 0);
        if (fr.collider) { fr.collider.destroy(); fr.collider = null; }
        wrapC(fr, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'coffee-machine': {
        const cmD = new Furniture.CoffeeMachine(this, 0, 0);
        if (cmD.collider) { cmD.collider.destroy(); cmD.collider = null; }
        wrapC(cmD, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        break;
      }

      case 'bean-bag': {
        const bbD = new Furniture.BeanBag(this, 0, 0, 'teal');
        if (bbD.collider) { bbD.collider.destroy(); bbD.collider = null; }
        wrapC(bbD, cx, cy, def.w / 2, def.h / 2);
        addCol(cx, cy, colW, colH);
        const bbId = `diy-bb-${Date.now()}`;
        this.chairs.push({ id: bbId, seatX: cx, seatY: cy, side: 'north', occupied: false, type: 'beanbag' });
        obj.chairIds.push(bbId);
        break;
      }
    }

    this.diyPlaced.push({ type, cx, cy, rotation });
    this.diyObjects.push(obj);
  }

  _saveDIYLayout() {
    try { localStorage.setItem('studyspace_diy', JSON.stringify(this.diyPlaced)); } catch (_) {}
  }

  _loadDIYLayout() {
    try {
      const raw = localStorage.getItem('studyspace_diy');
      if (!raw) return;
      JSON.parse(raw).forEach(({ type, cx, cy, rotation }) => {
        this._diyCreateItem(type, cx, cy, rotation);
      });
    } catch (_) {}
  }

  // ── DIY Creator mode ──────────────────────────────────────────────────────

  enterCreatorMode() {
    this.diyCreatorMode = true;
    if (!this._diyHoverG) this._diyHoverG = this.add.graphics().setDepth(50);
    this._diyShowControls('none');
  }

  exitCreatorMode() {
    this.diyCreatorMode = false;
    this._diyDeselect();
    if (this.diyMode) this.exitDIYPlacement();
    if (this._diyHoverG) this._diyHoverG.clear();
    this.game.canvas.style.cursor = 'default';
  }

  _diyShowControls(mode) {
    document.getElementById('diy-idle-hint')?.classList.toggle('hidden', mode !== 'none');
    document.getElementById('diy-place-controls')?.classList.toggle('hidden', mode !== 'place');
    document.getElementById('diy-select-controls')?.classList.toggle('hidden', mode !== 'select');
  }

  _diyObjectAtPoint(x, y) {
    for (const obj of this.diyObjects) {
      if (x >= obj.cx - obj.halfW && x <= obj.cx + obj.halfW &&
          y >= obj.cy - obj.halfH && y <= obj.cy + obj.halfH) {
        return obj;
      }
    }
    return null;
  }

  _diyUpdateHover() {
    if (!this._diyHoverG) return;
    const ptr     = this.input.activePointer;
    const hovered = this._diyObjectAtPoint(ptr.worldX, ptr.worldY);

    this.game.canvas.style.cursor =
      (hovered || this.diySelectedObj) ? 'pointer' : 'crosshair';

    this._diyHoverG.clear();

    if (this.diySelectedObj) {
      const s = this.diySelectedObj;
      this._diyHoverG.lineStyle(2, 0x00e5ff, 1);
      this._diyHoverG.strokeRect(s.cx - s.halfW - 3, s.cy - s.halfH - 3,
                                  s.halfW * 2 + 6, s.halfH * 2 + 6);
    }

    if (hovered && hovered !== this.diySelectedObj) {
      this._diyHoverG.lineStyle(2, 0xffee00, 0.85);
      this._diyHoverG.strokeRect(hovered.cx - hovered.halfW - 2,
                                   hovered.cy - hovered.halfH - 2,
                                   hovered.halfW * 2 + 4,
                                   hovered.halfH * 2 + 4);
    }
  }

  _diySelectObject(obj) {
    this._hideInlineControls();
    this.diySelectedObj = obj;
    this._showInlineControls(obj);
    this._diyShowControls('none');
  }

  _diyDeselect() {
    this._hideInlineControls();
    this.diySelectedObj    = null;
    this._diySelectedChair = null;
    if (this.diyCreatorMode) this._diyShowControls('none');
    if (this._diyHoverG) this._diyHoverG.clear();
  }

  _diyDestroyObj(obj) {
    obj.containers.forEach(c => c.destroy(true));
    obj.colliders.forEach(r => {
      if (r._arcadeCollider) r._arcadeCollider.destroy();
      r.destroy();
    });
    (obj.rawGraphics || []).forEach(g => { if (g && g.active) g.destroy(); });
    obj.chairIds.forEach(id => {
      const idx = this.chairs.findIndex(c => c.id === id);
      if (idx !== -1) this.chairs.splice(idx, 1);
    });
    if (obj.furnitureRef) {
      const fi = this.furnitureItems.indexOf(obj.furnitureRef);
      if (fi !== -1) this.furnitureItems.splice(fi, 1);
    }
  }

  _persistHideStatic(type, cx, cy) {
    try {
      const hidden = JSON.parse(localStorage.getItem('studyspace_hidden_statics') || '[]');
      if (!hidden.some(h => h.type === type && h.cx === cx && h.cy === cy)) {
        hidden.push({ type, cx, cy });
        localStorage.setItem('studyspace_hidden_statics', JSON.stringify(hidden));
      }
    } catch (_) {}
  }

  _diyDeleteSelected() {
    const obj = this.diySelectedObj;
    if (!obj) return;

    this._hideInlineControls();
    this._diyDestroyObj(obj);

    if (obj.isStatic) {
      this._persistHideStatic(obj.type, obj.cx, obj.cy);
    } else {
      const pi = this.diyPlaced.findIndex(
        p => p.type === obj.type && p.cx === obj.cx && p.cy === obj.cy && p.rotation === obj.rotation
      );
      if (pi !== -1) this.diyPlaced.splice(pi, 1);
      this._saveDIYLayout();
    }

    const oi = this.diyObjects.indexOf(obj);
    if (oi !== -1) this.diyObjects.splice(oi, 1);

    this.diySelectedObj = null;
    this._diyShowControls('none');
    if (this._diyHoverG) this._diyHoverG.clear();
  }

  _diyRotateSelected(dir) {
    const obj = this.diySelectedObj;
    if (!obj) return;
    const { type, cx, cy, rotation } = obj;
    const newRot = ((rotation + dir) % 4 + 4) % 4;

    this._hideInlineControls();
    this._diyDestroyObj(obj);

    if (obj.isStatic) {
      this._persistHideStatic(type, cx, cy);
    } else {
      const pi = this.diyPlaced.findIndex(
        p => p.type === type && p.cx === cx && p.cy === cy && p.rotation === rotation
      );
      if (pi !== -1) this.diyPlaced.splice(pi, 1);
    }

    const oi = this.diyObjects.indexOf(obj);
    if (oi !== -1) this.diyObjects.splice(oi, 1);

    this.diySelectedObj = null;

    this._diyCreateItem(type, cx, cy, newRot);
    this._diySelectObject(this.diyObjects[this.diyObjects.length - 1]);
    this._saveDIYLayout();
  }

  // ── Inline creator controls ────────────────────────────────────────────────

  _showInlineControls(obj) {
    this._hideInlineControls();
    const x = obj.cx;
    const y = obj.cy - obj.halfH - 14;
    const style = {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      backgroundColor: '#1a0b2eDD',
      padding: { x: 5, y: 3 },
    };
    const btns = [
      { icon: '↺', dx: -32, action: () => this._diyRotateSelected(-1) },
      { icon: '↻', dx:   0, action: () => this._diyRotateSelected( 1) },
      { icon: '🗑', dx:  32, action: () => this._diyDeleteSelected()   },
    ];
    this._inlineButtons = btns.map(({ icon, dx, action }) => {
      const tx = x + dx;
      const t  = this.add.text(tx, y, icon, style).setOrigin(0.5, 1).setDepth(60);
      return { x: tx, y: y - 10, action, text: t };
    });
  }

  _hideInlineControls() {
    if (!this._inlineButtons) return;
    this._inlineButtons.forEach(b => { if (b.text && b.text.active) b.text.destroy(); });
    this._inlineButtons = null;
  }

  _checkInlineCtrlClick(worldX, worldY) {
    if (!this._inlineButtons) return false;
    for (const btn of this._inlineButtons) {
      if (Math.abs(worldX - btn.x) <= 18 && Math.abs(worldY - btn.y) <= 14) {
        btn.action();
        return true;
      }
    }
    return false;
  }

  // ── DIY collision check ───────────────────────────────────────────────────

  _diyCheckCollision(cx, cy) {
    const def = DIY_DEFS[this.diyType];
    if (!def) return false;
    const swapped = this.diyRotation === 1 || this.diyRotation === 3;
    const halfW = (swapped ? def.h : def.w) / 2;
    const halfH = (swapped ? def.w : def.h) / 2;
    return this.diyObjects.some(obj =>
      cx - halfW < obj.cx + obj.halfW &&
      cx + halfW > obj.cx - obj.halfW &&
      cy - halfH < obj.cy + obj.halfH &&
      cy + halfH > obj.cy - obj.halfH
    );
  }

  // ── Individual chair selection / deletion ─────────────────────────────────

  _diyChairAtPoint(x, y) {
    for (const obj of this.diyObjects) {
      if (!obj.chairDetails) continue;
      for (const detail of obj.chairDetails) {
        if (Math.abs(x - detail.seatX) < 22 && Math.abs(y - detail.seatY) < 22) {
          return { ownerObj: obj, detail };
        }
      }
    }
    return null;
  }

  _diySelectChair(chairInfo) {
    this._hideInlineControls();
    this.diySelectedObj    = null;
    this._diySelectedChair = chairInfo;
    if (this._diyHoverG) {
      const s = chairInfo.ownerObj;
      this._diyHoverG.clear();
      this._diyHoverG.lineStyle(2, 0x00e5ff, 1);
      this._diyHoverG.strokeRect(s.cx - s.halfW - 3, s.cy - s.halfH - 3,
                                  s.halfW * 2 + 6, s.halfH * 2 + 6);
    }
    const { seatX, seatY } = chairInfo.detail;
    const y = seatY - 28;
    const style = {
      fontFamily: '"Press Start 2P", monospace', fontSize: '11px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      backgroundColor: '#1a0b2eDD', padding: { x: 5, y: 3 },
    };
    const t = this.add.text(seatX, y, '🗑', style).setOrigin(0.5, 1).setDepth(60);
    this._inlineButtons = [{ x: seatX, y: y - 10, action: () => this._diyDeleteChair(chairInfo), text: t }];
  }

  _diyDeleteChair(chairInfo) {
    const { ownerObj, detail } = chairInfo;
    if (detail.container) {
      const ci = ownerObj.containers.indexOf(detail.container);
      if (ci !== -1) ownerObj.containers.splice(ci, 1);
      detail.container.destroy(true);
    }
    const idx = this.chairs.findIndex(c => c.id === detail.id);
    if (idx !== -1) this.chairs.splice(idx, 1);
    const cidx = ownerObj.chairIds.indexOf(detail.id);
    if (cidx !== -1) ownerObj.chairIds.splice(cidx, 1);
    const didx = ownerObj.chairDetails.findIndex(d => d.id === detail.id);
    if (didx !== -1) ownerObj.chairDetails.splice(didx, 1);

    this._hideInlineControls();
    this._diySelectedChair = null;
    if (this._diyHoverG) this._diyHoverG.clear();
  }

  // ── Kitchen zones ─────────────────────────────────────────────────────────

  _checkKitchenZones() {
    if (this.isSitting) {
      this._nearStove = false;
      this._nearCoffeeMachine = false;
      return;
    }
    if (this._kitchenStoveZone) {
      const z = this._kitchenStoveZone;
      this._nearStove = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, z.x, z.y) < z.r;
    }
    if (this._coffeeMachineZone) {
      const z = this._coffeeMachineZone;
      this._nearCoffeeMachine = !this.isAtStove &&
        Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) < z.r;
    }
  }

  _checkLaundryZones() {
    if (this.isSitting || this.isAtWashingMachine) {
      if (!this.isAtWashingMachine) this._nearWashingMachine = false;
      return;
    }
    if (this._laundryZone) {
      const z = this._laundryZone;
      this._nearWashingMachine = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, z.x, z.y) < z.r;
    }
  }

  // ── Gym zones (Feature 6) ─────────────────────────────────────────────────

  _checkGymZones() {
    if (this.isSitting || this.isWorkingOut) {
      if (!this.isWorkingOut) this._nearTreadmill = false;
      return;
    }
    this._nearTreadmill = this._treadmillZones.some(z =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) < z.r
    );
  }

  // ── Bathroom zones (Feature 6) ────────────────────────────────────────────

  _checkBathroomZones() {
    if (this.isSitting || this.isWashingUp) {
      if (!this.isWashingUp) this._nearSink = false;
      return;
    }
    if (this._bathroomSinkZone) {
      const z = this._bathroomSinkZone;
      this._nearSink = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, z.x, z.y) < z.r;
    }
  }

  _startCooking() {
    if (this.isAtStove) return;
    this.isAtStove = true;
    this.player.setVelocity(0, 0);
    this.player.body.moves = false;
    this.setStatusIcon('cooking');
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● COOKING'; si.className = 'status-idle'; }
    const cookModal = document.getElementById('cook-modal');
    if (cookModal) { cookModal.classList.remove('hidden'); cookModal.classList.add('active'); }
  }

  _stopCooking() {
    if (!this.isAtStove) return;
    this.isAtStove = false;
    this.player.body.moves = true;
    this.setStatusIcon(null);
    if (window.ActivityTimer?.isRunning()) window.ActivityTimer.stop();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
  }

  _grabCoffee() {
    if (this._coffeeTimeout) clearTimeout(this._coffeeTimeout);
    this.setStatusIcon('coffee');
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● COFFEE'; si.className = 'status-idle'; }
    this._coffeeTimeout = setTimeout(() => {
      this.setStatusIcon(null);
      if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
      this._coffeeTimeout = null;
    }, 3000);
  }

  _startLaundry() {
    if (this.isAtWashingMachine) return;
    this.isAtWashingMachine = true;
    this.player.body.moves  = false;
    this.setStatusIcon('laundry');
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● LAUNDRY'; si.className = 'status-idle'; }
    const m = document.getElementById('laundry-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('active'); }
  }

  _stopLaundry() {
    if (!this.isAtWashingMachine) return;
    this.isAtWashingMachine = false;
    this.player.body.moves  = true;
    this.setStatusIcon(null);
    if (window.ActivityTimer?.isRunning()) window.ActivityTimer.stop();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
  }

  // ── Workout interactions (Feature 6) ─────────────────────────────────────

  _startWorkout() {
    if (this.isWorkingOut) return;
    this.isWorkingOut = true;
    this.player.body.moves = false;
    this.setStatusIcon('workout');
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● WORKING OUT'; si.className = 'status-idle'; }
    const m = document.getElementById('workout-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('active'); }
  }

  _stopWorkout() {
    if (!this.isWorkingOut) return;
    this.isWorkingOut = false;
    this.player.body.moves = true;
    this.setStatusIcon(null);
    if (window.ActivityTimer?.isRunning()) window.ActivityTimer.stop();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
  }

  // ── Wash up interactions (Feature 6) ─────────────────────────────────────

  _startWashUp() {
    if (this.isWashingUp) return;
    this.isWashingUp = true;
    this.player.body.moves = false;
    this.setStatusIcon('laundry');
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● WASHING UP'; si.className = 'status-idle'; }
    const m = document.getElementById('wash-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('active'); }
  }

  _stopWashUp() {
    if (!this.isWashingUp) return;
    this.isWashingUp = false;
    this.player.body.moves = true;
    this.setStatusIcon(null);
    if (window.ActivityTimer?.isRunning()) window.ActivityTimer.stop();
    const si = document.getElementById('status-indicator');
    if (si) { si.textContent = '● IDLE'; si.className = 'status-idle'; }
  }

  // ── Kitchen room construction ─────────────────────────────────────────────

  _buildKitchen() {
    // ── Floor: solid cream (Feature 1) ──────────────────────────────────────
    const fl = this.add.graphics();
    fl.fillStyle(0xF0E8D0);
    fl.fillRect(800, 344, 268, 420);
    fl.setDepth(0);

    // ── Walls ────────────────────────────────────────────────────────────────
    const wg = this.add.graphics();
    const KWALL  = 0x7A9098;
    const KWALLF = 0x9AB0B8;
    const KBASE  = 0x3A6070;

    // North face (front of horizontal partition at y=344)
    wg.fillStyle(KWALLF); wg.fillRect(800, 344, 268, 16);
    // South wall (y=764)
    wg.fillStyle(KWALL);  wg.fillRect(800, 764, 268, 36);
    wg.fillStyle(KBASE);  wg.fillRect(800, 756, 268, 8);  // baseboard

    // East wall for kitchen (x=1068-1100)
    wg.fillStyle(KWALL);  wg.fillRect(1068, 344, 32, 420);
    wg.fillStyle(KWALLF); wg.fillRect(1068, 344, 8, 420);

    // ── Partition wall (study / kitchen) — doorway at y=548-696 ─────────────
    const PART = 0x4A3520;
    wg.fillStyle(PART);
    wg.fillRect(768, 344, 32, 208);   // top segment  y=344-552
    wg.fillRect(768, 692, 32, 188);   // bottom y=692-880 → clamp to 764+36=800
    // Adjust: bottom segment from y=692 to y=880 but room ends at 800
    // Use spec: fillRect(768, 692, 32, 188) — draws to y=880 outside room but wall is drawn there
    wg.fillStyle(0x6B5030);           // front face lip
    wg.fillRect(768, 344, 32, 16);
    wg.fillRect(768, 692, 32, 12);

    // Door frame (spec: x=764/796 y=548 h=148; lintel y=544)
    wg.fillStyle(0xA07848);
    wg.fillRect(764, 548, 6, 148);    // left jamb
    wg.fillRect(796, 548, 6, 148);    // right jamb
    wg.fillRect(764, 544, 40, 6);     // lintel

    // ── Countertop along east wall (kitchen) ─────────────────────────────────
    const cg = this.add.graphics();
    cg.fillStyle(0x8AB4C0);
    cg.fillRect(1010, 344, 58, 130);   // back counter area
    cg.fillStyle(0xB0D0D8);
    cg.fillRect(1010, 344, 58, 6);     // counter highlight
    cg.fillStyle(0x6090A0);
    cg.fillRect(1010, 344, 4, 130);    // left edge shadow
    cg.setDepth(1010 + 474);           // depth = bottom Y of counter

    // ── Physics: partition wall segments ─────────────────────────────────────
    const topSeg = this.add.rectangle(784, 448, 32, 208).setVisible(false);
    const botSeg = this.add.rectangle(784, 786, 32, 188).setVisible(false);
    this.physics.add.existing(topSeg, true);
    this.physics.add.existing(botSeg, true);
    this.furnitureItems.push({ collider: topSeg });
    this.furnitureItems.push({ collider: botSeg });

    // ── Kitchen furniture ────────────────────────────────────────────────────
    // Dining table — updated coords (Feature 2): northY=570, southY=664
    const dt = new Furniture.KitchenTable(this, 846, 608);
    dt.graphics && (Array.isArray(dt.graphics) ? dt.graphics.forEach(g => g.setDepth(608 + 48)) : dt.graphics.setDepth(608 + 48));
    this.furnitureItems.push(dt);

    // Dining chairs with updated northY=570, southY=664
    const northY = 570;
    const southY = 664;
    [[862, 'north', 'kitchen-n0'], [910, 'north', 'kitchen-n1'],
     [862, 'south', 'kitchen-s0'], [910, 'south', 'kitchen-s1']].forEach(([cx, side, id]) => {
      const ch = new Furniture.Chair(this, cx, side === 'north' ? northY : southY, side);
      ch.graphics.setDepth((side === 'north' ? northY : southY) + 36);
      this.chairs.push({
        id, side, occupied: false, type: 'dining',
        seatX: cx + 16,
        seatY: side === 'north' ? northY + 12 : southY + 20,
      });
    });

    // Stove — updated coords (Feature 2)
    const stove = new Furniture.Stove(this, 838, 360);
    stove.graphics && stove.graphics.setDepth(360 + 56);
    this.furnitureItems.push(stove);
    this._kitchenStoveZone = { x: 870, y: 388, r: 52 };

    // Fridge — updated coords (Feature 2)
    const fridge = new Furniture.Fridge(this, 1014, 352);
    fridge.graphics && fridge.graphics.setDepth(352 + 80);
    this.furnitureItems.push(fridge);

    // Coffee machine — updated coords (Feature 2)
    const cm = new Furniture.CoffeeMachine(this, 942, 360);
    [cm.graphics].flat().forEach(g => g?.setDepth?.(360 + 40));
    this.furnitureItems.push(cm);
    this._coffeeMachineZone = { x: 958, y: 380, r: 52 };

    // Kitchen bench along south wall — updated coords (Feature 2)
    const bench = new Furniture.KitchenBench(this, 808, 730);
    [bench.graphics].flat().forEach(g => g?.setDepth?.(730 + 48));
    this.furnitureItems.push(bench);

    // Brown counter benches (at y=360, updated) ─────────────────────────────
    const bg = this.add.graphics();
    // Between stove and coffee machine (x=878-922, y=360-408)
    bg.fillStyle(0x6B4020); bg.fillRect(878, 360, 44, 48);
    bg.fillStyle(0x8B5828); bg.fillRect(878, 360, 44, 8);   // top highlight
    bg.fillStyle(0x4A2810); bg.fillRect(878, 400, 44, 8);   // bottom shadow
    bg.fillStyle(0x7A4820); bg.fillRect(878, 360, 4, 48);   // left edge
    // 16-bit outline (Feature 5)
    bg.fillStyle(0x3A1800); bg.fillRect(878, 360, 44, 2);
    bg.fillStyle(0x3A1800); bg.fillRect(878, 406, 44, 2);
    bg.setDepth(384 + 24);   // bottom Y ≈ 408
    const brownC1 = this.add.rectangle(922, 384, 44, 48).setVisible(false);
    this.physics.add.existing(brownC1, true);
    this.furnitureItems.push({ collider: brownC1 });

    // Between coffee machine and fridge (x=974-1014, y=360-408)
    bg.fillStyle(0x6B4020); bg.fillRect(974, 360, 40, 48);
    bg.fillStyle(0x8B5828); bg.fillRect(974, 360, 40, 8);
    bg.fillStyle(0x4A2810); bg.fillRect(974, 400, 40, 8);
    bg.fillStyle(0x7A4820); bg.fillRect(974, 360, 4, 48);
    bg.fillStyle(0x3A1800); bg.fillRect(974, 360, 40, 2);
    bg.fillStyle(0x3A1800); bg.fillRect(974, 406, 40, 2);
    const brownC2 = this.add.rectangle(994, 384, 40, 48).setVisible(false);
    this.physics.add.existing(brownC2, true);
    this.furnitureItems.push({ collider: brownC2 });
  }

  // ── Horizontal partition wall (top/bottom row separator) ─────────────────

  _buildHorizontalPartition() {
    // Partition at y=312-344, full width x=32-1068
    const wg = this.add.graphics();
    const WALL  = 0x4A4A5A;
    const WALLF = 0x6A6A7A;

    // Left solid x=32-160
    wg.fillStyle(WALL);  wg.fillRect(32,  312, 128, 32);
    wg.fillStyle(WALLF); wg.fillRect(32,  312, 128, 10);
    // Mid solid x=300-860
    wg.fillStyle(WALL);  wg.fillRect(300, 312, 560, 32);
    wg.fillStyle(WALLF); wg.fillRect(300, 312, 560, 10);
    // Right solid x=1000-1068
    wg.fillStyle(WALL);  wg.fillRect(1000, 312, 68, 32);
    wg.fillStyle(WALLF); wg.fillRect(1000, 312, 68, 10);

    // Door frames (y=308-348)
    wg.fillStyle(0x907050);
    // Gym → Study doorway (x=160-300)
    wg.fillRect(156, 308, 6, 40);   // left jamb
    wg.fillRect(298, 308, 6, 40);   // right jamb
    wg.fillRect(156, 304, 148, 6);  // lintel
    // Laundry → Kitchen doorway (x=860-1000)
    wg.fillRect(856, 308, 6, 40);
    wg.fillRect(998, 308, 6, 40);
    wg.fillRect(856, 304, 148, 6);

    wg.setDepth(2);

    // ── Physics colliders for solid segments ─────────────────────────────────
    // Left block (x=32-160): center (96, 328)
    const p1 = this.add.rectangle(96,  328, 128, 32).setVisible(false);
    // Mid block (x=300-860): center (580, 328)
    const p2 = this.add.rectangle(580, 328, 560, 32).setVisible(false);
    // Right block (x=1000-1068): center (1034, 328)
    const p3 = this.add.rectangle(1034, 328, 68,  32).setVisible(false);
    [p1, p2, p3].forEach(p => {
      this.physics.add.existing(p, true);
      this.furnitureItems.push({ collider: p });
    });
  }

  // ── Gym room construction ─────────────────────────────────────────────────

  _buildGym() {
    // Room: x=32-460, y=32-312 (Feature 2 resize)

    // ── Floor: solid dark rubber (Feature 1) ───────────────────────────────
    const fl = this.add.graphics();
    fl.fillStyle(0x252530);
    fl.fillRect(32, 32, 428, 280);
    fl.setDepth(0);

    // Yellow lane markings (Feature 2 updated)
    fl.fillStyle(0xD4A020);
    fl.fillRect(64, 200, 380, 2);
    fl.fillRect(64, 240, 380, 2);

    // ── Walls ─────────────────────────────────────────────────────────────────
    const wg = this.add.graphics();
    const GWALL  = 0x303038;
    const GWALLF = 0x484858;
    const GBASE  = 0x181820;

    // North external wall (top of building)
    wg.fillStyle(GWALL);  wg.fillRect(0, 0, 460, 32);
    wg.fillStyle(GWALLF); wg.fillRect(32, 32, 428, 16);
    // East wall of gym (x=460-492) — gym section
    wg.fillStyle(GWALL);  wg.fillRect(460, 32, 32, 280);
    // South face at y=304
    wg.fillStyle(GBASE);  wg.fillRect(32, 304, 428, 8);
    wg.setDepth(2);

    // ── Mirror strip (Feature 2: full gym width) ──────────────────────────────
    const g = this.add.graphics();
    g.fillStyle(0x607080, 0.4); g.fillRect(32, 48, 428, 16);
    g.fillStyle(0x90B0C0, 0.3); g.fillRect(32, 48, 428, 6);
    g.setDepth(4);

    // ── Gym equipment ──────────────────────────────────────────────────────────
    const eq = this.add.graphics();
    eq.setDepth(200);

    // Treadmills (2×) — top left area, ex=60 and ex=140 (Feature 2)
    [[60, 60], [140, 60]].forEach(([ex, ey]) => {
      // 16-bit style: dark outline first (Feature 5)
      eq.fillStyle(0x0A0A18); eq.fillRect(ex - 2, ey - 2, 68, 84);
      eq.fillStyle(0x1A1A28); eq.fillRect(ex, ey, 64, 80);
      eq.fillStyle(0x303040); eq.fillRect(ex + 4, ey + 4, 56, 60);
      eq.fillStyle(0x202030); eq.fillRect(ex + 8, ey + 8, 48, 44);  // belt
      eq.fillStyle(0x4040A0); eq.fillRect(ex + 8, ey + 8, 48, 4);   // belt stripe
      // Highlight (Feature 5)
      eq.fillStyle(0x5050C0); eq.fillRect(ex + 8, ey + 8, 48, 1);
      eq.fillStyle(0xC04020); eq.fillRect(ex + 24, ey + 68, 16, 8); // emergency stop
      eq.fillStyle(0x606070); eq.fillRect(ex + 6,  ey, 4, 28);
      eq.fillStyle(0x606070); eq.fillRect(ex + 54, ey, 4, 28);
      eq.fillStyle(0x808090); eq.fillRect(ex + 6,  ey, 52, 4);
      // Collider
      const tc = this.add.rectangle(ex + 32, ey + 40, 64, 80).setVisible(false);
      this.physics.add.existing(tc, true);
      this.furnitureItems.push({ collider: tc });
      // Treadmill zone (Feature 6)
      this._treadmillZones.push({ x: ex + 32, y: ey + 40, r: 52 });
    });

    // Yoga/stretch mats area — 2 mats (Feature 2: width is smaller)
    [
      [240, 140, 0x2A6020], [330, 140, 0x204060],
    ].forEach(([mx, my, mc]) => {
      eq.fillStyle(mc);       eq.fillRect(mx, my, 80, 40);
      eq.fillStyle(0xFFFFFF, 0.15); eq.fillRect(mx + 4, my + 4, 72, 2);
      // 16-bit outline (Feature 5)
      eq.lineStyle(1, 0x000000, 0.6);
      eq.strokeRect(mx, my, 80, 40);
    });

    // Weight rack — updated position (Feature 2)
    const wx = 370, wy = 80;
    // 16-bit outline (Feature 5)
    eq.fillStyle(0x202028); eq.fillRect(wx - 2, wy - 2, 68, 124);
    eq.fillStyle(0x404048); eq.fillRect(wx, wy, 64, 120);
    eq.fillStyle(0x505060); eq.fillRect(wx + 4, wy + 4, 56, 6);
    // Highlight (Feature 5)
    eq.fillStyle(0x606070); eq.fillRect(wx + 4, wy + 4, 56, 1);
    [[wx+8, wy+14, 0xC03020],[wx+8, wy+28, 0x3060C0],[wx+8, wy+42, 0x30A040],
     [wx+8, wy+56, 0xA0A020],[wx+8, wy+70, 0x8020A0]].forEach(([dx,dy,dc]) => {
      eq.fillStyle(dc); eq.fillRect(dx, dy, 48, 10);
      eq.fillStyle(0x202028); eq.fillRect(dx + 20, dy + 2, 8, 6);
    });
    const wrc = this.add.rectangle(wx + 32, wy + 60, 64, 120).setVisible(false);
    this.physics.add.existing(wrc, true);
    this.furnitureItems.push({ collider: wrc });

    // Water fountain — updated position (Feature 2)
    eq.fillStyle(0x406080); eq.fillRect(420, 220, 28, 40);
    eq.fillStyle(0x80C0E0); eq.fillRect(424, 222, 20, 16);
    eq.fillStyle(0x60A0CC); eq.fillRect(428, 224, 12, 6);
    // 16-bit outline (Feature 5)
    eq.lineStyle(1, 0x203040, 1);
    eq.strokeRect(420, 220, 28, 40);
  }

  // ── Bathroom room construction (Feature 3) ───────────────────────────────

  _buildBathroom() {
    // Room: x=492-680, y=32-312

    // ── Floor: solid light blue-grey (Feature 1) ──────────────────────────
    const fl = this.add.graphics();
    fl.fillStyle(0xE4EBF0);
    fl.fillRect(492, 32, 188, 280);
    fl.setDepth(0);

    // ── Walls ──────────────────────────────────────────────────────────────
    const wg = this.add.graphics();
    // North wall
    wg.fillStyle(0x5A6870); wg.fillRect(492, 0, 188, 32);
    // South face at y=304
    wg.fillStyle(0x3A4850); wg.fillRect(492, 304, 188, 8);
    wg.setDepth(2);

    // Gym|Bath partition (x=460-492)
    const pg = this.add.graphics();
    const PART_GB = 0x4A5868;
    pg.fillStyle(PART_GB);
    pg.fillRect(460, 32,  32, 100);   // top seg y=32-132
    pg.fillRect(460, 252, 32, 60);    // bot seg y=252-312
    // Door jambs
    pg.fillStyle(0xA09070);
    pg.fillRect(456, 128, 6, 128);    // left jamb
    pg.fillRect(488, 128, 6, 128);    // right jamb
    pg.fillRect(456, 124, 40, 6);     // lintel
    pg.setDepth(2);

    // Physics for gym|bath partition
    const gbTop = this.add.rectangle(476, 82,  32, 100).setVisible(false);
    const gbBot = this.add.rectangle(476, 282, 32, 60).setVisible(false);
    this.physics.add.existing(gbTop, true);
    this.physics.add.existing(gbBot, true);
    this.furnitureItems.push({ collider: gbTop });
    this.furnitureItems.push({ collider: gbBot });

    // ── Fixtures ──────────────────────────────────────────────────────────

    // Toilet (top-right corner, x=628-660, y=44-88)
    const toiletG = this.add.graphics();
    toiletG.fillStyle(0xF0F0F0); toiletG.fillRect(628, 44, 32, 44);   // base
    toiletG.fillStyle(0xE0E0E0); toiletG.fillRect(630, 46, 28, 36);   // seat
    toiletG.fillStyle(0xC8D8E8); toiletG.fillRect(634, 50, 20, 28);   // water bowl
    toiletG.fillStyle(0xF4F4F4); toiletG.fillRect(626, 40, 36, 16);   // tank
    // 16-bit outlines (Feature 5)
    toiletG.fillStyle(0xC0C0C0); toiletG.fillRect(628, 44, 32, 1);
    toiletG.fillStyle(0xC0C0C0); toiletG.fillRect(628, 44, 1, 44);
    toiletG.fillStyle(0xC0C0C0); toiletG.fillRect(626, 40, 36, 1);
    toiletG.setDepth(88);
    // Toilet collider
    const toiletC = this.add.rectangle(644, 68, 32, 44).setVisible(false);
    this.physics.add.existing(toiletC, true);
    this.furnitureItems.push({ collider: toiletC });

    // Sink (top-left, x=500-532, y=44-76)
    const sinkG = this.add.graphics();
    sinkG.fillStyle(0xD0D8E0); sinkG.fillRect(500, 44, 32, 32);   // cabinet
    sinkG.fillStyle(0xC0D0DC); sinkG.fillRect(504, 48, 24, 22);   // basin
    sinkG.fillStyle(0x909090); sinkG.fillRect(513, 40, 6, 12);    // faucet
    // 16-bit outlines (Feature 5)
    sinkG.fillStyle(0xA0B0BC); sinkG.fillRect(500, 44, 32, 1);
    sinkG.fillStyle(0xA0B0BC); sinkG.fillRect(500, 44, 1, 32);
    sinkG.fillStyle(0xA0B0BC); sinkG.fillRect(500, 75, 32, 1);
    sinkG.setDepth(76);
    // Sink collider
    const sinkC = this.add.rectangle(516, 60, 32, 32).setVisible(false);
    this.physics.add.existing(sinkC, true);
    this.furnitureItems.push({ collider: sinkC });

    // Shower (bottom area, x=504-588, y=192-300)
    const showerG = this.add.graphics();
    showerG.fillStyle(0xB8D0DC); showerG.fillRect(504, 192, 84, 108);   // tiled floor
    showerG.fillStyle(0x808888); showerG.fillRect(540, 192, 8, 32);     // pipe
    showerG.fillStyle(0x607070); showerG.fillRect(532, 192, 24, 8);     // head
    // Glass walls (semi-transparent)
    showerG.fillStyle(0xD0E8F0, 0.6); showerG.fillRect(504, 192, 4, 108);
    showerG.fillStyle(0xD0E8F0, 0.6); showerG.fillRect(588, 192, 4, 108);
    // 16-bit highlights (Feature 5)
    showerG.fillStyle(0xD8F0FF, 0.4); showerG.fillRect(508, 196, 76, 2);
    showerG.setDepth(300);
    // Physics: only back wall
    const showerC = this.add.rectangle(546, 248, 84, 4).setVisible(false);
    this.physics.add.existing(showerC, true);
    this.furnitureItems.push({ collider: showerC });

    // ── Bathroom sink interaction zone ────────────────────────────────────
    this._bathroomSinkZone = { x: 516, y: 76, r: 48 };
  }

  // ── Laundry room construction ─────────────────────────────────────────────

  _buildLaundry() {
    // Room: x=712-1068, y=32-312 (Feature 2 resize)

    // ── Floor: solid light cement (Feature 1) ─────────────────────────────
    const fl = this.add.graphics();
    fl.fillStyle(0xD4D9DE);
    fl.fillRect(712, 32, 356, 280);
    fl.setDepth(0);

    // ── Walls ──────────────────────────────────────────────────────────────
    const wg = this.add.graphics();
    const LWALL  = 0x6A8490;
    const LWALLF = 0x88A0AC;
    const LBASE  = 0x3A5060;

    // East wall (x=1068-1100)
    wg.fillStyle(LWALL);  wg.fillRect(1068, 0, 32, 344);
    // North wall
    wg.fillStyle(LWALL);  wg.fillRect(712, 0, 356, 32);
    wg.fillStyle(LWALLF); wg.fillRect(712, 32, 356, 16);
    // South face at y=304
    wg.fillStyle(LBASE);  wg.fillRect(712, 304, 356, 8);
    wg.setDepth(2);

    // Bath|Laundry partition (x=680-712)
    const pg = this.add.graphics();
    const PART_BL = 0x4A5868;
    pg.fillStyle(PART_BL);
    pg.fillRect(680, 32,  32, 88);    // top seg y=32-120
    pg.fillRect(680, 240, 32, 72);    // bot seg y=240-312
    // Door jambs
    pg.fillStyle(0xA09070);
    pg.fillRect(676, 116, 6, 128);    // left jamb
    pg.fillRect(708, 116, 6, 128);    // right jamb
    pg.fillRect(676, 112, 40, 6);     // lintel
    pg.setDepth(2);

    // Physics for bath|laundry partition
    const blTop = this.add.rectangle(696, 76,  32, 88).setVisible(false);
    const blBot = this.add.rectangle(696, 276, 32, 72).setVisible(false);
    this.physics.add.existing(blTop, true);
    this.physics.add.existing(blBot, true);
    this.furnitureItems.push({ collider: blTop });
    this.furnitureItems.push({ collider: blBot });

    // Laundry east wall collider
    const eastL = this.add.rectangle(1084, 172, 32, 280).setVisible(false);
    this.physics.add.existing(eastL, true);
    this.furnitureItems.push({ collider: eastL });

    // ── Washing machine (48×56) top-left corner of laundry ─────────────────
    const wm = new Furniture.WashingMachine(this, 720, 48);
    [wm.graphics].flat().forEach(g => g?.setDepth?.(48 + 56));
    this.furnitureItems.push(wm);
    this._laundryZone = { x: 744, y: 76, r: 56 };

    // ── Clothes drying rack (visual) ────────────────────────────────────────
    const rack = this.add.graphics();
    rack.fillStyle(0x8090A0); rack.fillRect(840, 48, 4, 100);
    rack.fillStyle(0x8090A0); rack.fillRect(920, 48, 4, 100);
    rack.fillStyle(0x607080); rack.fillRect(840, 52, 84, 3);
    rack.fillStyle(0x607080); rack.fillRect(840, 80, 84, 3);
    [[848,55,12,24,0xF0A0A0],[866,58,10,20,0xA0C0F0],[882,55,14,22,0xF0D0A0],
     [902,58,10,20,0x90D090],[848,83,12,20,0xD0A0F0],[870,83,10,22,0xF0B090]
    ].forEach(([rx,ry,rw,rh,rc]) => {
      rack.fillStyle(rc); rack.fillRect(rx, ry, rw, rh);
    });
    rack.setDepth(148);

    // ── Laundry supply shelf (visual) ────────────────────────────────────────
    const shelf = this.add.graphics();
    shelf.fillStyle(0xC8D4DC); shelf.fillRect(970, 48, 64, 10);
    shelf.fillStyle(0xA0B0B8); shelf.fillRect(970, 56, 64, 3);
    [[976,32,12,18,0x40A0E0],[994,34,10,16,0xE04060],[1010,32,12,18,0x40C080]].forEach(([bx,by,bw,bh,bc]) => {
      shelf.fillStyle(bc); shelf.fillRect(bx, by, bw, bh);
      shelf.fillStyle(0xFFFFFF, 0.4); shelf.fillRect(bx+2, by+2, bw-4, 4);
    });
    shelf.setDepth(58);
  }

  // ── Social / Multiplayer methods ──────────────────────────────────────────

  _spawnOtherPlayer(data) {
    // data = { id, name, gender, shirtColor, x, y, chatPreference }
    if (this.otherPlayers[data.id]) return;
    const gender = data.gender || 'male';
    const shirtColor = data.shirtColor || 'blue';
    const texPrefix = `player_${gender}_${shirtColor}`;
    if (!this.textures.exists(texPrefix + '_down_0')) {
      window.PixelSprites.createPlayerTextures(this, gender, shirtColor);
    }
    const texKey = texPrefix + '_down_0';
    const sprite = this.add.sprite(data.x, data.y, texKey)
      .setOrigin(0.5, 1).setDepth(data.y);
    sprite.setInteractive();
    sprite.on('pointerdown', () => {
      this._showPlayerCard(data);
    });
    sprite.on('pointerover', () => sprite.setTint(0xffff99));
    sprite.on('pointerout',  () => sprite.clearTint());
    const nameTag = this.add.text(data.x, data.y - 52, data.name, {
      fontFamily: '"Press Start 2P", monospace', fontSize: '6px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#1a0b2e', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(data.y + 35);
    this.otherPlayers[data.id] = { sprite, nameTag, chatBubble: null, data };
  }

  _moveOtherPlayer(id, x, y) {
    const op = this.otherPlayers[id];
    if (!op) return;
    op.sprite.setPosition(x, y).setDepth(y);
    op.nameTag.setPosition(x, y - 52).setDepth(y + 35);
    if (op.chatBubble) op.chatBubble.setPosition(x, y - 72).setDepth(y + 36);
    op.data.x = x;
    op.data.y = y;
  }

  _removeOtherPlayer(id) {
    const op = this.otherPlayers[id];
    if (!op) return;
    op.sprite.destroy();
    op.nameTag.destroy();
    if (op.chatBubble) op.chatBubble.destroy();
    delete this.otherPlayers[id];
  }

  _showChatBubble(id, message, isSelf) {
    if (isSelf) {
      const tx = this.player.x;
      const ty = this.player.y - 72;
      if (this._selfChatBubble) { this._selfChatBubble.destroy(); this._selfChatBubble = null; }
      const bubble = this.add.text(tx, ty, message, {
        fontFamily: '"Press Start 2P", monospace', fontSize: '7px',
        color: '#ffffff', backgroundColor: '#1a0b2eEE',
        padding: { x: 5, y: 3 }, wordWrap: { width: 120 },
      }).setOrigin(0.5, 1).setDepth(this.player.y + 40);
      this._selfChatBubble = bubble;
      this.time.delayedCall(4000, () => {
        if (bubble.active) { bubble.destroy(); this._selfChatBubble = null; }
      });
    } else {
      const op = this.otherPlayers[id];
      if (!op) return;
      if (op.chatBubble) { op.chatBubble.destroy(); op.chatBubble = null; }
      const bubble = this.add.text(op.data.x, op.data.y - 72, message, {
        fontFamily: '"Press Start 2P", monospace', fontSize: '7px',
        color: '#ffffff', backgroundColor: '#1a0b2eEE',
        padding: { x: 5, y: 3 }, wordWrap: { width: 120 },
      }).setOrigin(0.5, 1).setDepth(op.data.y + 40);
      op.chatBubble = bubble;
      this.time.delayedCall(4000, () => {
        if (bubble.active) { bubble.destroy(); op.chatBubble = null; }
      });
    }
  }

  _checkProximityChat() {
    if (this.isSitting) { this._nearestOther = null; return; }
    let nearest = null, nearestDist = Infinity;
    Object.values(this.otherPlayers).forEach(op => {
      const pref = op.data.chatPreference;
      if (pref === 'lockedin') return;
      if (pref === 'private') {
        const friends = window.socialState?.friends || [];
        if (!friends.find(f => f.id === op.data.id)) return;
      }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, op.data.x, op.data.y);
      if (d < 100 && d < nearestDist) { nearestDist = d; nearest = op.data.id; }
    });
    this._nearestOther = nearest;
  }

  _broadcastPosition() {
    const now = Date.now();
    if (now - this._posLastSent < 150) return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    if (x === this._lastBroadcastX && y === this._lastBroadcastY) return;
    this._posLastSent = now;
    this._lastBroadcastX = x;
    this._lastBroadcastY = y;
    if (window.socket) {
      window.socket.emit('playerMove', { x, y });
    }
  }

  _openChat() {
    this._chatOpen = true;
    const el = document.getElementById('chat-input-wrap');
    const input = document.getElementById('chat-text-input');
    if (el) el.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
  }

  _closeChat() {
    this._chatOpen = false;
    const el = document.getElementById('chat-input-wrap');
    if (el) el.classList.add('hidden');
  }

  _sendChat(message) {
    if (!message.trim() || this._isMuted) { this._closeChat(); return; }
    const nearbyIds = Object.values(this.otherPlayers)
      .filter(op => Phaser.Math.Distance.Between(this.player.x, this.player.y, op.data.x, op.data.y) < 120)
      .map(op => op.data.id);
    window.socket?.emit('sendChat', { message: message.trim(), nearbyIds });
    this._showChatBubble(null, message.trim(), true);
    this._closeChat();
  }

  // ── Player card ───────────────────────────────────────────────────────────

  _getPlayerRoom(x, y) {
    if (y >= 344) return x <= 768 ? 'Study Room' : 'Kitchen';
    if (x <= 460) return 'Gym';
    if (x <= 680) return 'Bathroom';
    return 'Laundry Room';
  }

  _showPlayerCard(data) {
    this._hidePlayerCard();
    const alreadyFriend = window.socialState?.friends?.find(f => f.id === data.id);
    const room = this._getPlayerRoom(data.x || 400, data.y || 400);
    const prefLabels = { sociable: 'Sociable', private: 'Private', lockedin: 'Locked In' };
    const pref = prefLabels[data.chatPreference] || 'Sociable';

    const card = document.createElement('div');
    card.id = 'player-card';
    card.className = 'player-card';
    card.innerHTML =
      '<button class="pc-close" id="pc-close-btn">✕</button>' +
      '<div class="pc-name">' + data.name + '</div>' +
      '<div class="pc-room">📍 ' + room + '</div>' +
      '<div class="pc-status">💬 ' + pref + '</div>' +
      (alreadyFriend
        ? '<div class="pc-friend-badge">✓ Friends</div>'
        : '<button class="pixel-btn small pc-add-btn" id="pc-add-btn">+ Add Friend</button>');

    // Position card near the centre of screen
    card.style.left = '50%';
    card.style.top  = '50%';
    card.style.transform = 'translate(-50%, -50%)';

    document.getElementById('app').appendChild(card);

    document.getElementById('pc-close-btn').addEventListener('click', () => this._hidePlayerCard());
    if (!alreadyFriend) {
      document.getElementById('pc-add-btn')?.addEventListener('click', () => {
        if (data.chatPreference === 'lockedin') {
          window.showToast?.(data.name + ' is currently locked in to focus! You can add them as a friend when they are out of focus mode.');
          this._hidePlayerCard();
          return;
        }
        window.socialState?.sendFriendRequest?.(data.id, data.name);
        this._hidePlayerCard();
      });
    }
  }

  _hidePlayerCard() {
    document.getElementById('player-card')?.remove();
  }

  // ── NPC simulation ────────────────────────────────────────────────────────

  _startNPCSimulation() {
    const CHAT_POOL = [
      "hey! how's the grind going?",
      'study break anyone?',
      'this problem set is brutal',
      'anyone else sleepy rn??',
      'ok pomodoro time lets go',
      'need coffee asap',
    ];
    const NPC_BOUNDS = { x1: 60, x2: 740, y1: 360, y2: 740 };
    const targets = {};

    this._npcInterval = setInterval(() => {
      Object.entries(this.otherPlayers).forEach(([id, op]) => {
        if (!targets[id]) {
          targets[id] = {
            tx: NPC_BOUNDS.x1 + Math.random() * (NPC_BOUNDS.x2 - NPC_BOUNDS.x1),
            ty: NPC_BOUNDS.y1 + Math.random() * (NPC_BOUNDS.y2 - NPC_BOUNDS.y1),
            actionTimer: Math.floor(Math.random() * 60) + 20,
          };
        }
        const t = targets[id];
        const dx = t.tx - op.data.x, dy = t.ty - op.data.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 8) {
          // Pick new target
          t.tx = NPC_BOUNDS.x1 + Math.random() * (NPC_BOUNDS.x2 - NPC_BOUNDS.x1);
          t.ty = NPC_BOUNDS.y1 + Math.random() * (NPC_BOUNDS.y2 - NPC_BOUNDS.y1);
        } else {
          const speed = 1.2;
          op.data.x += (dx / dist) * speed;
          op.data.y += (dy / dist) * speed;
          this._moveOtherPlayer(id, op.data.x, op.data.y);
        }

        // Social actions — only Sociable NPCs that are already friends chat
        if (op.data.chatPreference === 'sociable') {
          t.actionTimer--;
          if (t.actionTimer <= 0) {
            t.actionTimer = Math.floor(Math.random() * 120) + 60;
            const isFriend = window.socialState?.friends?.find(f => f.id === id);
            if (isFriend && window._receiveNPCMessage) {
              const msg = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)];
              window._receiveNPCMessage(id, op.data.name, msg);
            }
          }
        }
      });
    }, 50);
  }

}
