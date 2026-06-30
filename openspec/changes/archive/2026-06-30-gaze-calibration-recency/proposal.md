## Why

Adding many gaze-calibration points (Shift+click / `g`) eventually wrecks accuracy —
detected gaze goes "all over the place." Verified against the vendored WebGazer source
and the WebGazer IJCAI16 paper:

- WebGazer maps a **120-dim raw eye-pixel feature** straight to screen X/Y via **ridge
  regression with λ=1e-5** (≈ ordinary least squares — almost no regularization), over a
  **FIFO `DataWindow(700)`**, with **no head-pose normalization**.
- The paper itself states accuracy "degrades with significant head pose changes and
  extended session duration."

We call `setRegression("ridge")` — the **unweighted** model. Every Shift+click over a
session bakes in a slightly different head pose; the unweighted fit gives all points an
equal vote with no recency, so accumulated head drift becomes contradictory equal-weight
samples and the barely-regularized least-squares fit chases them into instability.

Two compounding gaps in our flow:
1. We use plain `ridge` (no recency weighting), so stale drifted points vote forever.
2. Pressing `c` to recalibrate cancels the dot grid overlay but **never clears** the
   polluted 700-sample window (`recordScreenPosition` only ever appends) — so
   "recalibrating" can only dilute a bad model, never reset it. WebGazer exposes
   `clearData()`, which we never call.

WebGazer ships the fix for exactly this: `weightedRidge` weights samples by `√(1/age)`
(newest = full weight, oldest decays), and `clearData()` resets the window. Verified:
`weightedRidge` shares the same `getData`/`setData`/`InitRegression` as `ridge`, so our
orientation- and dpr-keyed persistence keeps working unchanged and saved `ridge` blobs
load into it without migration.

## What Changes

- Switch the gaze regression from `ridge` to `weightedRidge` so recent calibration points
  dominate and old drifted points decay instead of voting with equal weight forever.
- Clear WebGazer's calibration data (`clearData()`) at the **start of a fresh 9-dot grid
  pass** (the `c` key), giving the player a real "start over" recovery path. Incremental
  top-ups (`g`, Shift+click) still append — they are meant to augment the live model.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `gaze-calibration`: adds a requirement that the reader use recency-weighted regression,
  and a requirement that starting a fresh grid calibration begins from a cleared model.

## Impact

- `web/js/gaze/webgazer-source.js`: `setRegression("ridge")` → `setRegression("weightedRidge")`.
- `web/js/main.js` (or `calibration.js`): call `webgazer.clearData()` when a grid
  calibration pass begins; persist the (now empty) state is skipped per the existing
  "empty model is not persisted" rule until the first dot is clicked.
- No backend change: persistence shape (`getData()` blob, orientation map, dpr tag) is
  unchanged; `weightedRidge` uses the same data API and loads existing saved blobs.
- `web/tests`: cover that recalibration clears prior data and that incremental adds do not.

## Out of scope (deferred)

- Per-region dedupe / cap on stored points (replace-in-cell instead of append). Recency
  weighting addresses the dominant cause; revisit only if degradation persists.
- Raising the ridge λ for variance control — would require patching the vendored
  regression; not worth it if `weightedRidge` is enough.
