## 1. Recency-weighted regression (`web/js/gaze/webgazer-source.js`)

- [ ] 1.1 Change `wg.setRegression("ridge")` to `wg.setRegression("weightedRidge")`.
- [ ] 1.2 Add a one-line comment noting weightedRidge weights samples by √(1/age) and shares
      the same `getData`/`setData` blob shape, so persistence and saved `ridge` blobs are
      unaffected.

## 2. Clear on a fresh grid pass (`web/js/main.js` / `web/js/gaze/calibration.js`)

- [ ] 2.1 When a 9-dot grid calibration pass begins (the `c` path that calls `runCalibration`),
      call `window.webgazer.clearData()` before the first dot is shown.
- [ ] 2.2 Confirm `g` and Shift+click paths do NOT clear — they keep appending via
      `recordScreenPosition`.
- [ ] 2.3 Add a comment that `clearData()` also clears WebGazer's localforage, which we
      intentionally don't use (calibration persists via `/api/calibration`), so it's harmless.

## 3. Tests (`web/tests/calibration.test.js`)

- [ ] 3.1 Starting a grid pass calls `webgazer.clearData()` exactly once, before any
      `recordScreenPosition`.
- [ ] 3.2 Recording via `g` / Shift+click does not call `clearData()`.
- [ ] 3.3 Abandoning a grid pass before any click persists nothing (existing empty-model rule
      still holds, saved model intact).

## 4. Verify

- [ ] 4.1 Run `web/tests` (vitest) green.
- [ ] 4.2 Manual webcam check: deliberately over-add points to degrade the old `ridge` model,
      then confirm `c` (clear + 9-dot) recovers a usable model, and that continued Shift+click
      top-ups under `weightedRidge` no longer send gaze "all over the place."
