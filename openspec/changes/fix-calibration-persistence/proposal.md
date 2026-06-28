## Why

Gaze calibration never survives a reload. Every time a score is opened the player
must recalibrate from scratch — nothing happens until points are added, and the
accumulated training is lost on the next load. The `gaze-calibration` spec already
promises "persists the updated calibration model", but the implementation is dead.

Root cause (two compounding bugs, confirmed by inspecting WebGazer 3.3.0 and the
running app over CDP):

1. **Wrong storage backend.** `serializeCalibration()` / `restoreCalibration()`
   (`web/js/gaze/calibration.js`) read and write `localStorage['webgazerGlobalData']`.
   WebGazer 3.x does not use localStorage — it persists via **localforage (IndexedDB)**.
   `serializeCalibration()` therefore always returns `null`, so `PUT /api/calibration`
   is never called and the backend `state.json` never gets a `calibration` key
   (verified: `GET /api/calibration` → `null`, `localStorage` empty, the `localforage`
   IndexedDB database present).

2. **WebGazer's own auto-persistence is disabled as a side effect.** WebGazer writes
   `webgazerGlobalData` to IndexedDB *only inside its mouse-click listener*. The app
   calls `removeMouseEventListeners()` (`web/js/gaze/webgazer-source.js:61`) to stop an
   idle gaze snapping to the cursor — which also removes the auto-save handler. So even
   WebGazer's native cross-session persistence never fires (verified: the IndexedDB
   `webgazerGlobalData` key exists but holds an empty array `[]`).

Net effect: calibration is written nowhere and restored from nowhere. This exactly
matches the reported symptom — cold start every reload, improving only as fresh points
are added within the live session.

## What Changes

- Replace the localStorage round-trip with WebGazer's blessed regression serialization
  API, `webgazer.getRegression()[0].getData()` / `.setData(blob)` (confirmed present in
  3.3.0; `getData()` returns the `[eyeFeatures, screenX, screenY]` training arrays).
- `serializeCalibration()` returns `getData()`; `restoreCalibration(blob)` applies it via
  `setData()` after `webgazer.begin()` (not before — the regression must exist).
- Persist on every recorded point and on reader teardown, so a reload always has the
  latest model. Keep storing in the backend `state.json` via the existing
  `/api/calibration` endpoint — portable across browsers, inspectable, and consistent
  with how resume/tuning already persist. No API shape change.
- The restore path no longer depends on the removed mouse listener or on IndexedDB.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `gaze-calibration`: the existing "persist the updated calibration model" guarantee
  becomes a concrete, testable requirement — the model is serialized via WebGazer's
  regression `getData()`, stored through `/api/calibration`, and restored via `setData()`
  after `begin()` on the next load. The persisted artifact is defined as WebGazer's own
  regression data, not a localStorage blob.

## Impact

- `web/js/gaze/calibration.js`: rewrite `serializeCalibration` / `restoreCalibration` to
  use `getData()` / `setData()` against the WebGazer regression instead of localStorage.
- `web/js/main.js`: restore after `source.start()` (post-`begin()`), not before; flush a
  final save on teardown.
- `web/js/gaze/webgazer-source.js`: expose the regression (or a save/load hook) so the
  calibration module can reach `getData`/`setData` without poking globals — keep the thin
  adapter boundary clean.
- `web/tests/calibration.test.js`: replace the (now-removed) localStorage assumptions with
  getData/setData round-trip coverage using a fake regression.
- No backend change: `state.py` and `/api/calibration` already store/return an opaque blob.
- No new dependency; uses the vendored WebGazer's existing API.

Out of scope (deferred): the rolling-window / last-N-points retraining idea. This change
restores correct persistence first; trimming `getData()`'s arrays to a recent window is a
natural follow-up once the round-trip is solid.
