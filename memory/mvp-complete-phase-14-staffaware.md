---
name: mvp-complete-phase-14-staffaware
description: MVP gaze-scroll complete (2026-06-27); Phase 14 plan — music-aware scrolling via staff system detection
metadata: 
  node_type: memory
  type: project
  originSessionId: a6d170ac-0259-40f2-926d-4e0fb1408ff9
---

## MVP Status
**Date**: 2026-06-27. Gaze-scroll MVP is functionally complete and moved to main.

**What works**: End-to-end flow (chooser → reader → calibrate → play), basic gaze-following, tuning panel, resume/state persistence.

**Current limitation**: Gaze chasing drives pixel-level scroll, no music awareness. Pages don't fit predictably; users report "a lot of tuning needed."

## Phase 14 — Music-Aware Scrolling (Post-MVP Tuning)

**Vision**: Replace pixel-chasing with staff-system-aware scrolling.
- When gaze reaches left edge: snap the staff system into full view (smooth, not jarring)
- As gaze sweeps left→right: interpolate scroll so system's top edge reaches screen-top by right edge
- Result: predictable, musically-coherent page navigation aligned to score structure, not raw cursor position

**Why it matters**: Solo piano is two-staff systems (grand staves) with clear musical boundaries, but when systems have no clear horizontal gap (common in engraved scores), pixel-based scroll can't find natural pause points. Staff detection gives us those boundaries.

**Implementation path**:
1. **Spike staff detection** (start with horizontal projection profile, no training)
   - Horizontal projection histogram → find peaks (staff lines) → group into 5-line staves → pair into 2-staff systems
   - If La Maja's tricky pages defeat projection profile, escalate to stable-paths (connected-path method)
2. **Backend**: Add `/api/systems` endpoint returning system bounding boxes for each page
3. **Frontend**: Rewrite gaze-scroll logic to:
   - Track which system gaze is in
   - Snap-scroll on left-edge detect
   - Interpolate scroll during left→right sweep

**Test case**: La Maja (all two-staff, includes pages with unclear inter-system spacing)

**Priority**: Post-MVP (not blocking functional acceptance). Pull forward only if current basic tuning can't achieve "acceptable" UX. Can be deferred to Phase 15 if Phase 13.2 user testing shows acceptable-enough behavior with parameter tuning alone.

## Phase 14 progress — detection backend DONE (2026-06-28)

Branch `phase-14-detection` (commit 173fbfa, **not yet merged to main** — merge `--no-ff` when ready). Tasks §1–2 complete.

- `gazescroll/systems.py`: detector validated against ground truth on all 6 La Maja pages. Pipeline: binarize `gray<160` → **deskew** (variance angle search; p1 tilted ~0.6°) → projection profile (`0.6×page-max`) → 5±1-line staves → **group by barline/brace connector** (NOT spacing — title-page spacing is non-bimodal) → box vertical span = **jagged per-column content divide** (boxes overlap where notes interleave). numpy added.
- La Maja is NOT a song: 2-staff on most pages, **3-staff from rich piano texture** on pp.4–5, mixed 3/2-staff on p5. Stable-paths NOT needed.
- Full hypothesis/failure-mode/findings log: `docs/notes/staff-system-detection-spike.md`. Far-future refinement noted there: extend boxes to stems/beams/slurs.

## Phase 14 — ALL CODE TASKS DONE (2026-06-28), only manual run left

Tasks §3–7 + §8.2–8.3 complete on branch `phase-14-detection` (not yet committed — backend §1–2 was committed at 173fbfa). Full backend suite + 121 web tests green.

- **API**: `GET /api/score/{file}/systems` in `app.py` → per-page list of boxes; `404` via `_resolve_doc` KeyError, `503` no source. Client: `getSystems(file)` in `web/js/api.js`.
- **Backend tests**: `tests/test_systems.py` uses a **synthetic** engraved page generator (no copyrighted PDF in repo — see [[no-copyrighted-pdfs-in-repo]]); geometry must be realistic scale (~1200px wide, 24px interline, intra-staff gap >2×interline) or deskew's 4× downscale collapses it. `test_api.py` has systems happy/404/503.
- **Frontend** (`web/js/gaze/control.js`, additive — vertical follower untouched as fallback): `createSystemSelector` (saccade-driven, forward-only, overlap-robust), `systemScrollTarget` (snap `bottom−vh` → sweep-end `top−m`, tall-system clamp), `stepTowardTarget`, `createSystemController` (returns null when no boxes → `main.js` falls back per-page). Wiring in `main.js`: `getSystems` + `pageStripBoxes` (recomputed per frame, resize-robust).
- **Debug overlay**: `web/js/gaze/overlay.js` — faint shaded rect behind active system, CSS-opacity crossfade on advance; toggle key `o` (off by default). Tuning params added (backend `TUNING_DEFAULTS` + `tuning.js`): `systemTopMargin` 24, `overlayFadeMs` 250, `overlayOpacity` 0.18. **NOTE**: tuning.test.js pins the exact field-key list in TWO places — update both when adding a param.
- Open Questions resolved/recorded in the change's design.md.

**ONLY REMAINING: task 8.1** — manual webcam run against La Maja to confirm feel + tune (needs the user; agent can't drive a webcam). Then commit, merge `--no-ff` to main, and `/opsx:archive` the change.

## Phase 14 — COMPLETE & ARCHIVED (2026-06-28)

33/33 done; user-confirmed webcam run ("good"). Change archived to `openspec/changes/archive/2026-06-28-phase-14-music-aware-scrolling/`; delta specs synced into baseline (`openspec/specs/staff-system-detection/spec.md`, `system-aware-scrolling/spec.md`). Branch `phase-14-detection` **still not merged to main** — merge `--no-ff` when ready. Commits NOT yet pushed (push from `akaihola@atom`).

**Three bugs found & fixed during the 8.1 webcam run** (overlay was untested in a real browser before this):
- Debug overlay invisible: drawn at `z-index:-1` behind opaque page PNGs (renders are opaque white, not transparent). Moved in front at low opacity. Toggle `o` now also reports state + lights the current system immediately (commit 8a191c8).
- Overlay misaligned under crop (`z`): boxes lived in a flat full-page layer ignoring the per-page crop CSS transform. Now **nested per `.page-wrapper`, positioned in page-relative %**; `applyCropMode` applies the identical transform to the container (8a191c8). Also made boxes resize-independent.
- System tracking stalled at last system of page 1: controller was fed only the current page's boxes → forward-only selector clamped to that page. Now fed **one continuous cross-page stack** (`allStripBoxes` in main.js), selector re-seated to scroll position after external scroll via `lastAppliedScroll` (commit 65e01b3, verified p1→p2→p3 live via CDP).

**DEFERRED: two minor bugs** the user will describe in a follow-up session (not yet characterized). Start that session with `/opsx:explore` → `/opsx:propose`.

## Tooling
**OpenSpec adopted** (2026-06-27) for spec-driven design. Use `/opsx:propose <change>` for Phase 14+.
