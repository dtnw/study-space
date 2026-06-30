---
name: project-versions
description: Version history of The Game — what changed at each version milestone
metadata:
  type: project
---

## Version tracking

**Current version: 3.19**

Increment the version number by 0.01 after each completed prompt/change.

### v3.18
- Front-facing sit pose: player shows `player_walk_front_0` body with a `read_front` book-flip overlay sprite (using `setOrigin(0.5, 1)` to align with player anchor). The `read_front` sprite sheet frames at x=576–736, y=448 are blank in the current character sheets — the overlay approach is the correct workaround.

### v3.19
- Other players seated in north-facing chairs now correctly show back-of-head (`{prefix}_up_0`) instead of defaulting to their last walk animation.
- Server now includes `playerId` in `chairTaken` and `chairFreed` broadcasts.
- `GameScene._setOtherPlayerSitPose(id, side)` applies the correct static texture per chair direction (north→up_0, south→walk_front_0, east→sit_side, west→sit_side+flipX).
- `GameScene._clearOtherPlayerSitPose(id)` restores the idle texture on stand-up.
- `main.js` wires `chairTaken`/`chairFreed` events to the new pose methods.
