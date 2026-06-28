---
name: feedback-worktree-webgazer-symlink
description: Always symlink gitignored vendor/webgazer.js from main checkout into new worktrees
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fa2ecf1e-a1af-42fc-a35d-b77837d99863
---

When creating a git worktree for this project, always symlink `vendor/webgazer.js` from the main checkout into the worktree — it is gitignored and therefore absent from fresh worktrees, causing "Gaze unavailable: WebGazer failed to load" at runtime.

```bash
ln -s /home/akaihola/prg/forscore/web/vendor/webgazer.js \
      <worktree>/web/vendor/webgazer.js
```

**Why:** The file is large/binary and gitignored; it lives only in the main working tree. A worktree gets a clean checkout with no gitignored files, so the app starts but gaze fails silently unless the symlink is in place.

Starlette's `StaticFiles` does **not** follow symlinks by default, so the symlink alone is not enough. `gazescroll/app.py` must mount with `follow_symlink=True`:
```python
app.mount("/web", StaticFiles(directory=WEB_DIR, follow_symlink=True), name="web")
```
This is already applied in `app.py` (2026-06-28).

**How to apply:** Do this immediately after `git worktree add`, before running the app or asking the user to do a webcam check. The `follow_symlink=True` is in `app.py` and will be present in any future worktree branched from after 2026-06-28.
