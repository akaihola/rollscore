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
- [x] **Phase 9 — Gaze control pure functions** (unit-tested core)
- [x] **Phase 10 — GazeSource abstraction + WebGazer + calibration**
  - [x] 10.1 `GazeSource` interface + `ScriptedGazeSource` fake (unit-tested)
  - [x] 10.2 `WebGazerGazeSource` thin adapter (manual smoke)
  - [x] 10.3 Calibration overlay + recenter offset (pure math unit-tested) +
    `GET/PUT /api/calibration`
- [x] **Phase 11 — Wire gaze loop + controls into the reader**
  - [x] 11.1 Controls module (keyboard + invisible tap zones) — jsdom-tested
  - [x] 11.2 Gaze loop drives the scroller; manual input preempts; `?fakegaze`
    dev mode; chooser forwards pieces + setlist context; pure `pieceJumpPage`
  - [x] 11.3 Setlist end stops and waits (`onScoreEnd`, unit-tested) + "open
    next" affordance wired
  - [x] Manual browser smoke (live CDP): `?fakegaze=1` scrolls 0→534px on Space;
    fixed a NaN bug — `maxStepPerFrame` was missing from backend tuning defaults
    (now present + guarded by a test). Real-webcam WebGazer feel is Phase 12.
- [x] **Phase 12 — Dev tuning panel** (`buildTuningPanel` jsdom-tested;
  `createGazeController.setParams` retunes live; `t` toggles; throttled
  `PUT /api/tuning` persists. Headless Playwright smoke
  (`web/tools/tuning_smoke.py`) passed: 10 sliders, toggle, live PUT + GET.)
- [x] **Phase 13 — Acceptance** (golden registration + end-to-end manual)
  - [x] **Crop registration fixed.** The v1 misregistration was the *translation*,
    not the scale: scale `fit × zoom` is correct (content scale == `zoom`, the
    documented ground truth), but v1 dropped the dominant vertical shift. Correct
    model (`crop.py`): translate by `-0.8 × trOffset × PX_PER_PT` in **both** axes,
    and paste the pixmap at the transformed origin with clipping (`render.py` had
    pasted at (0,0), discarding the translation). The `rect`-based crop hypothesis
    in the old memory note was **wrong** (IoU 0.10 vs export); discarded. The side-
    margin clipping at `zoom > 1` is **faithful** — forScore's own export clips
    identically.
  - [x] **13.1 Golden registration check** (`tests/test_render_golden.py`): renders
    all 6 La Maja pages and asserts dark-pixel IoU > 0.55 vs forScore's
    standardized-dimensions annotated export (measured 0.65–0.999). Opt-in: skips
    without `out/` + the export PDF (`GAZESCROLL_LAMAJA_EXPORT`, copyrighted).
  - [x] **Display sizing: full-page fit (render model v3, 2026-06-21).** The v2
    render baked forScore's zoom-crop into the page, so the displayed page was a
    magnified middle slice (zoom≈1.1–1.25 → ~15–25% too large, side margins
    clipped) — reported as "way too large / doesn't fit the window width." v3 fits
    the **whole page** width to the canvas: `page_to_canvas_matrix` is a plain
    `fit`, `canvas_size`/`page_dimensions` are **per-page** (height follows the
    page aspect). Annotations stay registered by un-zooming the aux overlay
    (`crop.overlay_affine` + `render.transform_overlay`) instead of zoom-cropping
    the page. Golden test now compares in forScore's export space (re-crop our
    render back; IoU 0.68–0.96). Verified live via CDP (La Maja: full header +
    right-margin "poco rall." now visible, two systems fit). Note: the render
    cache key is unchanged, so clear `~/.cache/gazescroll/render` after this.
  - [x] **13.2 End-to-end manual acceptance** — verified on 2026-06-27: basic
    mechanics work end-to-end (chooser → reader → calibrate → play). Core is
    functionally complete. **Status**: moved to main; ready for post-MVP tuning.

### Post-MVP Tuning & Next Phases

- [~] **Phase 14 — Music-aware scrolling (staff system detection)**
  - **Goal**: Replace pixel-chasing with system-aware gaze-follow. When gaze hits
    left screen edge, snap the staff system into view; as gaze moves left→right,
    scroll so the system's top edge reaches screen top by the right edge.
  - **Status (2026-06-28)**: code + tests complete on branch `phase-14-detection`.
    Detection backend (`gazescroll/systems.py`), `/api/score/{file}/systems`
    endpoint, system-aware controller (`createSystemController` in `control.js`),
    debug overlay (`gaze/overlay.js`, toggle `o`), tuning params, and full backend
    + 121 web tests all green. Projection-profile detection validated on all 6 La
    Maja pages in the spike (deskew + barline-connector grouping; stable-paths NOT
    needed). **Remaining: task 8.1 — manual webcam run to confirm feel and tune
    params** (then archive the OpenSpec change).
  - **Sequence**: Spike staff detection ✓ → backend `/api/systems` endpoint ✓ →
    system-aware gaze-scroll logic ✓ → manual tuning (8.1, needs user).
  - **Deferral rationale**: Non-blocking for MVP acceptance; high UX impact post-MVP.

- [ ] **Phase 15 — Parameter tuning** (gaze accuracy, smoothing, threshold)

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
