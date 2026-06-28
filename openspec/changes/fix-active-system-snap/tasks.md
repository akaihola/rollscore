## 1. Decouple the snap from the reading gate and the velocity cap

- [ ] 1.1 In `web/js/gaze/control.js` `createSystemController.update`, replace the `if (!reading) return { scrollTop }` early hold with: step `scrollTop` forward toward the active system's `snapStart` (`box.bottom - viewportH`, clamped to `[0, maxScroll]`) at the new `snapStepPerFrame` budget — forward-only, never past `snapStart`. Return that stepped value with `active: selector.active()`.
- [ ] 1.2 When `reading`, snap toward `snapStart` at `snapStepPerFrame` until reached, then interpolate toward the fx-target (`systemScrollTarget`) at `maxStepPerFrame` as today. Keep the non-decreasing, per-frame-bounded invariant.

## 2. Tuning parameter

- [ ] 2.1 Add a `snapStepPerFrame` slider + default (~40–60 px/frame) to `web/js/tuning.js`.
- [ ] 2.2 Add `snapStepPerFrame` to the per-frame param set in `tests/test_state.py` so a missing key can't silently NaN the controller.

## 3. Tests

- [ ] 3.1 In `web/tests/control.test.js`: advancing to a box only partially visible at the bottom snaps it fully into view (reaches `snapStart`) within a few frames at `snapStepPerFrame`.
- [ ] 3.2 In `web/tests/control.test.js`: after an advance, the snap reaches `snapStart` even when `reading: false` on the following frames (the freeze regression test).
- [ ] 3.3 Confirm existing tests still pass — `stepTowardTarget` bounded/forward-only, and "holds position … while not reading" (boxes already fully visible → ungated snap takes no step).

## 4. Verify

- [ ] 4.1 Run `web/tests` and `tests/test_state.py`; all green.
- [ ] 4.2 Webcam/fake-gaze check: a next system partially visible at the bottom snaps fully into view when it becomes active, even though it's hard to fixate on while clipped.
