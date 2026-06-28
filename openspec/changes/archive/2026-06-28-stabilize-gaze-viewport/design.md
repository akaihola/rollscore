## Context

WebGazer's regression predicts in viewport CSS-pixel coordinates and is trained on the
same (clicks via `recordScreenPosition(clientX, clientY)`; dots placed in `vw`/`vh`).
The trained model is therefore a function from eye-features to *CSS pixels of this
viewport*. It stays valid only while the viewport keeps the physical-screen geometry and
CSS-pixel scale it had at training time. Three real-world events break that, today with
no guard:

- Window not occupying a fixed physical region (resize / non-maximized).
- Browser zoom, which rescales CSS pixels (`innerWidth/Height` shrink, `devicePixelRatio`
  rises). The recenter feature only re-anchors a vertical *offset*; it cannot undo the
  *scale* change zoom introduces.
- Orientation flips on tablets — landscape and portrait are different geometries.

`fix-calibration-persistence` (sibling, must land first) makes the model persist via
`getRegression()[0].getData()/setData()` through `/api/calibration`. This change keeps
that persisted model *valid* across the three events above.

## Goals / Non-Goals

**Goals:**
- Only run gaze when the viewport geometry is reproducible (fullscreen).
- Make browser zoom a non-issue: prevent it where possible (touch pinch), detect-and-pause
  where it can't be prevented (desktop Ctrl-zoom).
- Maintain independent calibration per orientation, swapped automatically on rotate.
- No new runtime dependency; reuse native platform features.

**Non-Goals:**
- Re-projecting / re-scaling an existing model to survive a zoom or geometry change
  (infeasible: the regression's learned outputs are absolute CSS px tied to training).
- Toolbar-layout pinning. The toolbar shift is a symptom of zoom; pinning the toolbar
  fixes only the offset half and is unnecessary once zoom is pinned.
- Multi-monitor maximized-window detection (heuristic, fragile, and strictly worse than
  fullscreen for guaranteeing geometry).
- In-app score zoom UI changes (fit-to-width already exists; out of scope here).

## Decisions

### Fullscreen gate instead of maximized-window detection
Use the Fullscreen API (`requestFullscreen()` / `document.fullscreenElement` /
`fullscreenchange`) as the hard precondition for gaze. **Why over maximized-detection
(`screenX/availWidth` heuristics):** maximized still leaves variable browser-chrome
height (toolbars, find bar) that shifts the viewport top, and the heuristic breaks on
multi-monitor and OS scaling. Fullscreen makes viewport == physical screen,
deterministically and with one native call. The gate lives in the reader (`main.js`), not
in the thin `WebGazerGazeSource` adapter — start/stop already flows through the reader.

### Browser zoom: prevent on touch, detect-and-pause on desktop
- **Touch:** `<meta name="viewport" ... maximum-scale=1, user-scalable=no>` disables
  pinch-zoom — a one-line native fix for the dominant zoom vector on the stated tablet
  use case.
- **Desktop:** a page cannot intercept Ctrl +/−, so detect change instead. Capture
  `devicePixelRatio` at calibration time and listen with
  `matchMedia('(resolution: <dpr>dppx)')`; its `change` event fires on any zoom change.
  On mismatch, pause gaze and prompt "reset zoom (Ctrl+0)". **Why dpr-as-guard, not
  dpr-as-key:** `devicePixelRatio` conflates display density with zoom, so its absolute
  value is not portable across devices — but *change relative to the calibration value*
  is a reliable "zoom moved" signal, which is all we need.

### Orientation as a storage key; dpr as a validity tag
Calibration persistence becomes `{ [orientation]: { blob, dpr } }`. Orientation is a
discrete key (two genuinely separate models); dpr is a scalar tag guarding each. **Why
not also key by dpr:** there's exactly one valid zoom (the calibrated one) per
orientation — other zooms are an error state to correct, not a variant to store. Current
orientation resolved by a pure helper (`matchMedia('(orientation: portrait)')`), unit-
testable in isolation. Swap on `orientationchange`; prompt if the new orientation has no
entry.

### Backend payload shape change + migration
`/api/calibration` GET/PUT and `state.py` move from a single opaque blob to the
orientation map. A one-time read-side migration wraps a legacy single blob as
`{ landscape: { blob, dpr: null } }` so existing `state.json` keeps working. **BREAKING**
for any external caller of the endpoint, but the only caller is this app.

## Risks / Trade-offs

- **Fullscreen friction** → Players must be in fullscreen to use gaze. Mitigation:
  auto-request on gaze-start so it's one gesture; manual reading without gaze is
  unaffected.
- **`dpr` doesn't catch zoom that lands on the same dpr bucket** (rare, e.g. fractional
  display scaling collisions) → Mitigation: the fullscreen gate already removes window-
  geometry drift; residual error is recoverable with recenter. Accept as a known ceiling.
  <!-- ponytail: dpr-bucket guard; tighten with visualViewport.scale if it bites -->
- **`orientationchange` without a saved model interrupts reading to calibrate** →
  Mitigation: this is correct behavior (the model would be wrong); prompt clearly rather
  than silently mis-track.
- **Sibling-ordering**: this change's `gaze-calibration` delta assumes the persistence
  requirement from `fix-calibration-persistence` exists → Mitigation: land/archive the
  sibling first; the delta uses ADDED (not MODIFIED) requirements so it composes without
  rewriting the sibling's text.

## Migration Plan

1. Land `fix-calibration-persistence` first.
2. Ship backend payload change with read-side legacy-blob migration (no data loss; old
   `state.json` upgrades on first read).
3. Ship frontend: viewport meta, fullscreen gate, dpr guard, orientation keying.
4. Rollback: revert frontend + backend together; legacy single-blob `state.json` is still
   readable by the pre-change code (migration only widens the shape).

## Open Questions

- Which element gets fullscreen — `documentElement` (toolbar stays visible) or the
  `.scroller` (toolbar hidden, scroller owns the full screen, calibration maps 1:1 to the
  score)? Leaning `.scroller` for a cleaner mapping, pending how controls are reached in
  fullscreen (reader is largely keyboard-driven already).
- On desktop, should a zoom mismatch *block* gaze hard, or offer a one-key "recalibrate at
  this zoom" as an alternative to resetting zoom? Default: prompt reset; revisit if reset
  proves annoying.
