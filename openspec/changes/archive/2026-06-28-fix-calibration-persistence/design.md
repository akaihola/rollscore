## Context

The reader persists resume position and tuning through a single backend `state.json`
(`gazescroll/state.py`) and round-trips calibration through `PUT/GET /api/calibration`.
The frontend was written assuming WebGazer mirrors its trained model into
`localStorage['webgazerGlobalData']`; the app would read that string, ship it to the
backend, and write it back into localStorage before `webgazer.begin()` on the next load.

That assumption is false for the vendored build (`web/vendor/webgazer.js`, WebGazer 3.3.0).
Confirmed by source inspection and live CDP probing of the running reader:

- WebGazer 3.x persists through **localforage**, whose default driver is **IndexedDB**, not
  localStorage. The app's localStorage reads/writes hit empty storage.
- WebGazer's IndexedDB save is bolted onto its mouse-click handler
  (`...saveDataAcrossSessions && localforage.setItem('webgazerGlobalData', reg.getData())`).
  The reader removes WebGazer's mouse listeners (`removeMouseEventListeners()`,
  `webgazer-source.js:61`) so an idle gaze does not snap to the cursor — which also strips
  the only path that flushes the model to IndexedDB.
- The regression exposes `getData()` → `[eyeFeatures, screenX, screenY]` arrays and
  `setData(blob)`. These are the library's blessed (de)serialization primitives and do not
  depend on any storage backend or listener. Verified live: both are functions; `getData()`
  returns `Array[3]`.

So the model is recorded into the in-memory regression by `recordScreenPosition()` (which
works), but is never extracted, never sent to the backend, and never re-applied on load.

## Goals / Non-Goals

**Goals:**
- Calibration survives a reload: points added in one session are present and effective on
  the next open of any score.
- Persist through the existing backend `/api/calibration` (state.json), so calibration is
  portable across browsers/profiles and inspectable, consistent with resume/tuning.
- Use WebGazer's own `getData()`/`setData()` rather than reaching into private DataWindow
  internals, so the round-trip is robust to the library's representation.
- Keep the thin `WebGazerGazeSource` adapter boundary: the calibration module should not
  scrape globals; the source exposes the hook it needs.

**Non-Goals:**
- No rolling-window / last-N-points retraining yet (deferred follow-up). This change makes
  persistence correct; trimming the window comes after.
- No reliance on WebGazer's native IndexedDB persistence. We deliberately removed the mouse
  listener that drives it; re-adding it would resurrect the idle-snap bug.
- No change to the `/api/calibration` request/response shape or to `state.py` — the stored
  blob stays opaque to the backend.
- No change to how points are *recorded* (`recordScreenPosition` via `g` / Shift+click /
  the 9-dot grid). Only extraction, transport timing, and restore change.

## Decisions

**D1 — Persist WebGazer's `getData()` blob, not a localStorage string.**
`serializeCalibration()` returns `webgazer.getRegression()[0].getData()` (a JSON-serializable
`[eyeFeatures, screenX, screenY]` triple). `restoreCalibration(blob)` calls
`getRegression()[0].setData(blob)`. The backend continues to store whatever opaque JSON it is
handed.
- *Alternative considered — fix the storage backend (write our blob into localforage/IndexedDB
  and let `begin()` load it).* Rejected: it depends on `saveDataAcrossSessions` load timing and
  on IndexedDB being the active localforage driver, and it is async and racy against `begin()`.
  `setData()` after `begin()` is synchronous, explicit, and driver-independent.
- *Alternative considered — re-add WebGazer's mouse listener so native persistence fires.*
  Rejected: it reintroduces idle-snap-to-cursor, the exact bug `removeMouseEventListeners()`
  fixed.

**D2 — Restore after `begin()`, not before.**
The regression object does not exist until `webgazer.begin()` resolves, so `setData()` must run
post-start. Today `restoreCalibration(savedCal)` is called *before* `new WebGazerGazeSource()`
/ `start()` — which was only ever valid for the (defunct) localStorage-preload trick. Move the
restore to just after `source.start()` resolves.

**D3 — Save on each point and flush on teardown.**
Each `recordScreenPosition` is already followed by a persist attempt; keep that (now it
actually produces a non-null blob). Additionally flush one final save in `teardown()` so a
model improved late in a session is not lost if the last point's throttled/edge save was
dropped. Saves remain best-effort (`.catch(() => {})`); a failed PUT must never break reading.

**D4 — Reach the regression through the source adapter, not a global.**
`WebGazerGazeSource` already owns the WebGazer instance. Add narrow `getCalibration()` /
`setCalibration(blob)` methods (or a `regression` getter) on the source so `calibration.js`
operates on an injected handle, matching how the rest of the gaze code is structured and
keeping it unit-testable with a fake. The module keeps its `globalThis.webgazer` default only
for backward-compatible direct calls.

## Risks / Open Questions

- **Empty / partial model blob.** If `getData()` is called before any valid point (no face,
  null features), it can return empty arrays. `serializeCalibration()` should treat an empty
  model as "nothing to persist" (return null) so we never overwrite a good saved model with an
  empty one. `setData()` on an empty blob should be a no-op.
- **Feature-vector compatibility across versions.** `getData()` arrays encode the current
  tracker's 50-dim eye features. A future WebGazer/tracker swap could invalidate a stored blob.
  Acceptable for a personal tool; if it bites, version-tag the blob and discard on mismatch.
- **Validation.** Manual webcam check is the real proof (calibrate, reload, confirm the red dot
  appears immediately and tracks without re-adding points). Unit tests cover the getData/setData
  round-trip and the empty-model guard with a fake regression.
