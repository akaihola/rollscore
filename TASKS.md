# Tasks

Open work and **phase status** for in-flight efforts. Status legend (per the
`AGENTS.md` convention — read this file first at the start of a session):

- `[ ]` open · `[~]` in progress · `[x]` done

For finished/background features and the longer wishlist, see [BACKLOG.md][backlog].

---

## Active effort — gaze-scroll score reader web app

**Where the work lives** (the implementation is on a branch, not on `main`):

- Branch: **`plan-gaze-scroll-mvp`**, checked out as worktree
  **`.worktrees/plan-gaze-scroll-mvp/`** (the `.worktrees/` dir is gitignored).
- Phase-defining plan: **`docs/plans/2026-06-13-gaze-scroll-web-app-mvp.md`**
  — exists **only on that branch** until it is merged to `main`. View it with
  `git show plan-gaze-scroll-mvp:docs/plans/2026-06-13-gaze-scroll-web-app-mvp.md`
  or from inside the worktree.
- Design rationale (on `main`): [docs/plans/2026-06-13-gaze-scroll-web-app-design.md][design].

This `TASKS.md` is the single source of truth for **which phase we are on**;
the plan doc is the source of truth for **what each phase/task entails**. Update
the checkboxes below as phases complete (keep them in sync with the branch).

### Phase status

- [x] **Phase 0 — Webcam gaze-accuracy spike** (make-or-break). GO verdict recorded.
- [x] **Phase 1 — Project scaffolding** (backend deps + package, Vitest, FastAPI app factory).
- [x] **Phase 2 — Ingest layer** (`resolve_source`, `ensure_extracted`).
- [x] **Phase 3 — Library service (chooser model)**
  - [x] 3.1 Load scores with metadata + page count
  - [x] 3.2 Composer-sorted grouping
  - [x] 3.3 Bookmarks → piece ranges
  - [x] 3.4 Setlists (ordered, resolved to scores)
  - [x] 3.5 Real-library smoke (skips without `out/`)
- [x] **Phase 4 — Render service** (crop + overlay composite + cache)
  - [x] 4.1 Canvas constants + page→canvas matrix (empirical v1)
  - [x] 4.2 Render cropped page to RGBA canvas
  - [x] 4.3 Alpha-composite aux overlay 1:1 top-left
  - [x] 4.4 Cache composited PNGs by mtime + annotation flag (1-based→0-based)
  - [x] 4.5 Page-dimensions metadata helper
- [x] **Phase 5 — State store** (JSON: resume/tuning/calibration, atomic write)
- [x] **Phase 6 — FastAPI routes** (`/api/library`, lazy page-image + page-dims, resume + tuning; 503 without a source)
- [x] **Phase 7 — Front-end: API client + chooser view**
- [x] **Phase 8 — Front-end: reader view** (scroll strip + lazy load + resume)
- [ ] **Phase 9 — Gaze control pure functions** (unit-tested core)
- [ ] **Phase 10 — GazeSource abstraction + WebGazer + calibration**
- [ ] **Phase 11 — Wire gaze loop + controls into the reader**
- [ ] **Phase 12 — Dev tuning panel**
- [ ] **Phase 13 — Acceptance** (golden registration + end-to-end manual)

### Running it locally

The first real UI is Phase 7. Until then, boot the server in **your own** shell
(an agent-backgrounded server is sandbox-network-isolated and unreachable from the
browser), then open `http://127.0.0.1:8765/`:

```
! cd .worktrees/plan-gaze-scroll-mvp && uv run uvicorn gazescroll.app:create_app --factory --port 8765
```

`…/web/spike/gaze-accuracy.html` is the interactive Phase 0 webcam harness.

[backlog]: BACKLOG.md
[design]: docs/plans/2026-06-13-gaze-scroll-web-app-design.md
