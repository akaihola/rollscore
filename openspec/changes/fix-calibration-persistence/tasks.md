## 1. Serialization via WebGazer's regression API (`web/js/gaze/calibration.js`)

- [ ] 1.1 Rewrite `serializeCalibration(regression)` to return
  `regression.getData()` instead of reading `localStorage`. Accept the regression (or the
  WebGazer instance) as a parameter; default to `globalThis.webgazer?.getRegression?.()[0]`
  for backward-compatible direct calls.
- [ ] 1.2 Guard against an empty model: if `getData()` yields empty training arrays
  (no points / null features), return `null` so an empty model never overwrites a good one.
- [ ] 1.3 Rewrite `restoreCalibration(blob, regression)` to call `regression.setData(blob)`;
  make a null/empty blob a no-op. Drop all localStorage references.
- [ ] 1.4 Update the module docstrings: the persisted artifact is WebGazer's regression
  `getData()` blob, round-tripped through `/api/calibration`; not a localStorage string.

## 2. Expose the regression through the source adapter (`web/js/gaze/webgazer-source.js`)

- [ ] 2.1 Add narrow `getCalibration()` / `setCalibration(blob)` methods on
  `WebGazerGazeSource` that delegate to `this._wg.getRegression()[0].getData()/.setData()`,
  so callers do not scrape `window.webgazer`.
- [ ] 2.2 Keep the thin-adapter contract: no scroll/calibration logic here, just the hook.

## 3. Restore timing and teardown flush (`web/js/main.js`)

- [ ] 3.1 Remove the pre-`begin()` `restoreCalibration(savedCal)` call (it relied on the
  defunct localStorage preload).
- [ ] 3.2 After `source.start()` resolves (regression now exists), restore: if `savedCal`,
  call `source.setCalibration(savedCal)`.
- [ ] 3.3 Route `recordCalibrationAt` / `startCalibration` persistence through
  `source.getCalibration()` so the saved blob is the real model; keep the best-effort
  `putCalibration(blob).catch(() => {})`.
- [ ] 3.4 In `teardown()`, flush a final `source.getCalibration()` → `putCalibration` so a
  late-session improvement is not lost. Best-effort; never throw.

## 4. Tests (`web/tests/calibration.test.js`)

- [ ] 4.1 Replace localStorage-based assumptions: `serializeCalibration` returns the fake
  regression's `getData()` output; `restoreCalibration` calls `setData` with the blob.
- [ ] 4.2 Empty-model guard: `serializeCalibration` returns `null` when `getData()` is empty;
  `restoreCalibration(null)` and `restoreCalibration(emptyBlob)` are no-ops.
- [ ] 4.3 Round-trip: `restoreCalibration(serializeCalibration(regA), regB)` transfers the
  blob from one fake regression to another (`regB.setData` received `regA.getData()`).
- [ ] 4.4 Existing `runCalibration` 9-dot and `cancel()` tests still pass unchanged.

## 5. Verify

- [ ] 5.1 Run `web/tests` (vitest) green; Python tests unaffected but run them to confirm.
- [ ] 5.2 Webcam smoke over the running reader: calibrate a few points, confirm
  `GET /api/calibration` now returns a non-null blob and `state.json` gains a `calibration`
  key. Reload the score and confirm the gaze dot appears and tracks immediately, with no
  fresh points added.
