# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run in production mode
npm start

# Run in development mode (auto-restarts on file changes)
npm run dev
```

The server runs on `http://localhost:3000` by default (or `PORT` env var).

## Architecture

This is a **Node.js + Socket.IO multiplayer study space** — an 8-bit browser game where users can hang out, study, and manage tasks together.

### Server (`server.js`)
Single-file Express + Socket.IO server. Key concepts:
- **`ROOM_CONFIGS`** — hardcoded list of rooms (derbysaren, demo, derrizzmachine). Each room maps a creator's Twitch login to a URL path.
- **`roomState` Map** — per-room in-memory state: `players`, `clientIdMap`, `seatOccupancy`, `roomLayout`, `rolesData`, `activeCalls`.
- **`globalTasks`** — shared task list across all rooms, persisted to `data/tasks.json`.
- **`playerSessions` Map** — short-lived (10-min) auth tokens created after OAuth and consumed once by the client via `GET /api/session/:token`.
- Roles: `creator` (verified via Twitch login match), `mod` (stored in `data/<roomId>-roles.json`), `regular`.
- Rate limiting is per-socket via `makeLimiter()`.

### Client (`public/`)
Phaser 3 game rendered in `index.html`. Entry point is `public/js/main.js`, which boots a Phaser game using `GameScene.js`.

| File | Responsibility |
|------|---------------|
| `GameScene.js` | Core Phaser scene: tilemap, player spawning, socket event handling, camera |
| `PlayerClass.js` | Sprite logic for local and remote players, movement, animations |
| `PixelSprites.js` | Procedural pixel-art sprite generation (no external sprite sheet needed) |
| `Furniture.js` | DIY room layout editor, furniture placement and rendering |
| `TaskManager.js` | Task panel UI (add/complete/delete tasks) |
| `CallManager.js` | WebRTC call setup and signaling (uses Socket.IO as signaling channel) |
| `VoiceChat.js` | Voice chat layer on top of CallManager |
| `PomodoroManager.js` | Pomodoro timer UI |
| `SoundManager.js` | Background music and sound effects |
| `landing.js` / `landing.html` | Landing page — shows live spaces, Twitch OAuth entry point |

### Data files (`data/`)
JSON files used as a simple file-based database. Never committed with real secrets.

| File | Contents |
|------|---------|
| `twitch-config.json` | Twitch OAuth credentials and redirect URI |
| `twitch-token.json` | Stored OAuth token (auto-created after creator auth) |
| `google-config.json` | Google OAuth credentials |
| `stripe-config.json` | Stripe secret key, price ID, webhook secret |
| `roles.json` / `<roomId>-roles.json` | Creator and mod assignments per room |
| `tasks.json` | Persisted global task list |
| `subscriptions.json` | Stripe subscription records |
| `creator-codes.json` | One-time-use creator invite codes |

### Auth flow
1. User visits `/auth/twitch?role=player` or `/auth/twitch?role=creator`.
2. After Twitch callback, a short-lived token is stored in `playerSessions` and the user is redirected to `/?psid=<token>`.
3. Client reads `GET /api/session/:token` once to get name/avatar, then joins via Socket.IO `playerJoin`.
4. Creator identity is confirmed server-side by matching `twitchLogin` against `ROOM_CONFIGS[].creatorLogin`.

### Adding a new room
Add an entry to `ROOM_CONFIGS` in `server.js` with a unique `id`, `creatorLogin`, `name`, `path`, and `theme`. Create a corresponding roles file in `data/` if needed.
