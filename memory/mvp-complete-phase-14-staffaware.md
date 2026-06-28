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

**Next (new session): Phase 3** — `GET /api/score/{file}/systems` endpoint + `web/js/api.js` client; then Phase 4 backend tests (golden box, degradation, cache, API 404/503), Phases 5–6b frontend system-aware controller + debug overlay, Phase 7 frontend tests, Phase 8 acceptance. Resume with `/opsx:apply openspec/changes/phase-14-music-aware-scrolling/`.

## Tooling
**OpenSpec adopted** (2026-06-27) for spec-driven design. Use `/opsx:propose <change>` for Phase 14+.
