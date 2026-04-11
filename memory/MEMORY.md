# Study Space Game — Project Memory

## Stack
- **Backend**: Node.js + Express + Socket.io (`server.js`)
- **Frontend**: Phaser 3.60 (CANVAS renderer, NOT WebGL) + Vanilla JS
- **Port**: 3000 (or env PORT); launch via `npm start` or `npm run dev`
- **Entry**: `public/index.html`

## File Structure
```
The Game/
├── server.js              – Express + Socket.io server
├── package.json
├── .claude/launch.json    – Preview config (autoPort: true)
└── public/
    ├── index.html
    ├── css/style.css      – Dark pixel-art theme, Press Start 2P font
    └── js/
        ├── main.js            – Bootstrap: socket, name modal, Phaser init, DOM events
        ├── PixelSprites.js    – Pixel art textures (16×20 sprites at 2px scale)
        ├── GameScene.js       – Phaser scene: room, desk, 6 chairs, player, physics
        ├── TaskManager.js     – Personal + global task lists, socket sync
        └── PomodoroManager.js – Focus/break countdown, Web Audio beeps
```

## Room Layout (800×600 canvas)
- Walls: 32px thick
- Desk: 288×72px centred at (400, 270), x from 256–544, y from 234–306
- 6 chairs: 3 north (seatY≈196), 3 south (seatY≈342), x at DX+40/144/248
- Player starts at (400, 460); collision body at feet (setSize 18×10, offset 7,28)
- Desk collision: invisible rectangle with `physics.add.existing(rect, true)`

## Known Issues / Fixed
- `createDecorations()` was called in `create()` but never defined → removed that call
- Desk physics was using `staticGroup.create(null)` → fixed to `physics.add.existing`
- Shadow graphics used `const g` then reassigned → split into two graphics objects
- Screenshot tool times out with canvas games — use eval to verify game state

## Key Patterns
- Player sprite textures: `window.PixelSprites.createAllTextures(scene)` in `create()`
- Phaser ↔ HTML bridge: `window.gameState`, `window.socket`, `window.game`
- Sitting flow: `sitDown()` → 220ms tween → onComplete shows pomodoro modal
- Standing: `standUp()` → stops timer, restores player_down texture, moves player +52y

## MVP Features Implemented
- [x] 8-bit pixel art room (wood floor, walls, rug, bookshelf, window, plants)
- [x] Player avatar with 4-directional movement (WASD + arrows)
- [x] Desk (6-seater) with chairs, sit/stand interaction (E key)
- [x] Pomodoro timer (focus + break, header countdown, audio beeps)
- [x] Personal task list (local browser session)
- [x] Global/shared task list (Socket.io real-time sync)
- [x] Player name entry on join
- [x] Status indicator (IDLE / STUDYING / BREAK)
