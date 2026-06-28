## Why

WebGazer is calibrated in viewport **CSS-pixel** coordinates, so its trained model is
only valid while the viewport keeps the same physical-screen geometry it had during
calibration. Three things silently invalidate it today, with no guard:

1. **Non-maximized / non-fullscreen window.** A saved model assumes the viewport
   occupies a fixed region of the physical screen. Move or resize the window and every
   gaze prediction is offset.
2. **Browser zoom.** Zoom rescales the CSS-pixel coordinate system: `innerWidth`/
   `innerHeight` shrink and `devicePixelRatio` rises, so the regression's learned
   outputs no longer match the score's coordinates. The visible symptom — the fixed-
   height toolbar (`.toolbar`, content + `.5rem` padding) consuming a larger *fraction*
   of the shrunken viewport and pushing the score down — is only the recoverable
   *offset* half; the underlying *scale* error is not fixable by recenter.
3. **Orientation change (tablets).** Landscape and portrait are entirely different
   physical geometries. One trained model cannot serve both, yet the persistence layer
   stores a single blob.

This is a sibling to `fix-calibration-persistence` (which makes the model persist at
all). This change makes the persisted model *stay valid*: gate gaze on a reproducible
viewport, take browser zoom out of the loop, and key calibration by orientation.

## What Changes

- **Fullscreen gate.** Gaze tracking SHALL only run while the document is fullscreen
  (`document.fullscreenElement`), which pins the viewport→physical-screen mapping to a
  reproducible geometry. Starting gaze enters fullscreen via `requestFullscreen()` (a
  user gesture already triggers it); exiting fullscreen pauses gaze.
- **Zoom taken out of the loop.**
  - Tablets: tighten the viewport meta to `maximum-scale=1, user-scalable=no` so
    pinch-zoom — the dominant zoom vector on touch — cannot change the coordinate system.
  - Desktop (Ctrl +/−, which a page cannot block): record `devicePixelRatio` with the
    calibration model and, via a `matchMedia('(resolution: <dpr>dppx)')` listener, pause
    gaze and prompt a zoom reset when it changes. The dpr is a **validity guard**, not a
    separate model.
  - Score sizing stays an in-app concern (existing fit-to-width), decoupled from browser
    zoom — the structural reason zoom never needs to move.
- **Orientation-keyed calibration.** The persisted calibration becomes a map keyed by
  orientation (`landscape` / `portrait`) instead of one blob. On `orientationchange` the
  reader swaps to that orientation's model, or prompts calibration if none exists. This
  **BREAKING**-extends the `/api/calibration` payload shape (single blob → orientation
  map) and the backend store.

## Capabilities

### New Capabilities
- `gaze-viewport-stability`: the conditions under which gaze tracking is permitted to
  run — fullscreen-only gating, browser-zoom neutralization (viewport meta + dpr guard),
  and the pause/prompt behavior when those conditions are violated mid-session.

### Modified Capabilities
- `gaze-calibration`: the persisted calibration model (added by `fix-calibration-persistence`)
  becomes keyed by viewport orientation, and is tagged with the `devicePixelRatio` at
  which it was trained so a zoom change can invalidate it. Restore selects the model for
  the current orientation.

## Impact

- `web/index.html`: tighten the `viewport` meta (`maximum-scale=1, user-scalable=no`);
  the inline `.toolbar`/`.scroller` layout is unaffected (fix is zoom-pinning, not
  toolbar-pinning).
- `web/js/gaze/webgazer-source.js`: no coordinate change; gating lives in the reader.
- `web/js/main.js`: enter fullscreen on gaze start; pause on `fullscreenchange` exit;
  attach the `matchMedia` dpr-change and `orientationchange` listeners; pass the current
  orientation when saving/restoring calibration.
- `web/js/gaze/calibration.js`: `serializeCalibration`/`restoreCalibration` carry an
  orientation key and the training-time `devicePixelRatio`; a small pure helper resolves
  the current orientation. Recenter is unchanged.
- `gazescroll/state.py` + `gazescroll/app.py`: `/api/calibration` stores/returns an
  orientation→{blob, dpr} map. **BREAKING** payload shape; a one-time migration wraps any
  existing single blob as the `landscape` entry.
- `web/tests/calibration.test.js`: cover orientation resolution, dpr-guard staleness, and
  orientation-keyed round-trip with a fake regression.
- Depends on `fix-calibration-persistence` landing first (it introduces the persistence
  requirement this change keys and guards). No new runtime dependency — Fullscreen API,
  `matchMedia`, and the viewport meta are native platform features.
