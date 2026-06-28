## 1. Disable pinch-zoom (`web/index.html`)

- [x] 1.1 Tighten the `viewport` meta to
  `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`
  so touch pinch-zoom cannot rescale the calibrated coordinate system. Apply the same to
  `web/spike/gaze-accuracy.html` if it is still used for calibration testing.

## 2. Orientation + display-scale helpers (`web/js/gaze/calibration.js`)

- [x] 2.1 Add a pure `currentOrientation()` helper returning `"portrait"` /
  `"landscape"` from `matchMedia("(orientation: portrait)")` (parameterize the matcher
  for testability). Default to `"landscape"` when `matchMedia` is unavailable.
- [x] 2.2 Extend `serializeCalibration` to also capture `devicePixelRatio` (the
  training-time scale), returning `{ blob, dpr }` for an orientation, or `null` for an
  empty model (preserve the existing empty-model guard).
- [x] 2.3 Add a pure `isCalibrationValidForScale(entry, dpr)` helper: true iff the saved
  entry's `dpr` matches the current `devicePixelRatio`. Used to gate restore + the live
  zoom guard.

## 3. Orientation-keyed persistence (`gazescroll/state.py`, `gazescroll/app.py`)

- [x] 3.1 `state.py`: change `get_calibration`/`set_calibration` to store an
  orientation→`{blob, dpr}` map; `set_calibration(orientation, entry)` writes one key,
  `get_calibration(orientation)` reads one (or `None`).
- [x] 3.2 `state.py`: read-side migration — if the stored `calibration` is a legacy single
  blob (not a dict of orientations), wrap it as `{"landscape": {"blob": <legacy>, "dpr": null}}`.
- [x] 3.3 `app.py`: `/api/calibration` GET/PUT accept an `orientation` (query param or body
  field) and round-trip the per-orientation entry. Keep the body opaque otherwise.
- [x] 3.4 Update `tests/test_state.py` / `tests/test_api.py` for the map shape and the
  legacy-blob migration.

## 4. Fullscreen gate (`web/js/main.js`)

- [x] 4.1 On gaze-start, request fullscreen (`requestFullscreen()` on the chosen element —
  `.scroller` per design open-question, fall back to `documentElement`) within the start
  gesture.
- [x] 4.2 Gate gaze-driven scrolling on `document.fullscreenElement`; when not fullscreen,
  suppress scrolling and show a "fullscreen required for gaze" status.
- [x] 4.3 Listen for `fullscreenchange`: on exit, pause gaze (do not resume until
  fullscreen returns).

## 5. Display-scale (zoom) guard (`web/js/main.js`)

- [x] 5.1 On restore/start, register a `matchMedia("(resolution: <dpr>dppx)")` `change`
  listener bound to the active calibration's `dpr`.
- [x] 5.2 On a scale mismatch (`isCalibrationValidForScale` false), pause gaze and prompt
  "reset browser zoom (Ctrl+0)"; resume when the scale matches the calibration again.

## 6. Orientation switching + restore wiring (`web/js/main.js`)

- [x] 6.1 On open/restore, fetch and apply the saved entry for `currentOrientation()`;
  only apply if `isCalibrationValidForScale` passes, else prompt for a zoom reset.
- [x] 6.2 Persist points (g / Shift+click / 9-dot grid) under the current orientation via
  the extended `serializeCalibration` → `PUT /api/calibration?orientation=…` (best-effort).
- [x] 6.3 Listen for `orientationchange`: re-resolve orientation, apply that orientation's
  saved model if present, else prompt to calibrate. Re-bind the dpr guard to the new
  entry's scale.
- [x] 6.4 Teardown flush saves under the current orientation.

## 7. Frontend tests (`web/tests/calibration.test.js`)

- [x] 7.1 `currentOrientation()` returns portrait/landscape from a fake matcher and
  defaults to landscape without `matchMedia`.
- [x] 7.2 `serializeCalibration` includes `dpr`; empty model still returns `null`.
- [x] 7.3 `isCalibrationValidForScale` true on matching dpr, false on mismatch.
- [x] 7.4 Orientation-keyed round-trip: a saved entry restores into the correct
  orientation and not the other.

## 8. Manual verification

- [ ] 8.1 Desktop: calibrate in fullscreen; Ctrl++ pauses gaze with the reset prompt;
  Ctrl+0 resumes without recalibration; leaving fullscreen pauses gaze.
- [ ] 8.2 Tablet: pinch does not zoom; rotate landscape↔portrait swaps models (calibrate
  the second orientation once, then confirm each rotation restores its own model).
