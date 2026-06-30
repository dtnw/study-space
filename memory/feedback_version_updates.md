---
name: feedback-version-updates
description: Always update the version number in index.html and project_versions.md after every change
metadata:
  type: feedback
---

Always update the on-screen version number in `public/index.html` (line 36) after every completed change. The version increments by 0.01 each prompt (3.18 → 3.19 → 3.20, etc.).

**Why:** The user tracks progress visually via the in-game version badge and relies on it to confirm changes are live.

**How to apply:** At the end of every task, edit the `v3.XX` span in index.html and add an entry to `memory/project_versions.md`. Do this before reporting the task complete.
