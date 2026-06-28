## 1. Controller revert logic (`web/js/gaze/control.js`)

- [ ] 1.1 Add `revertDwellMs` to the controller params and thread it into `createSystemController`.
- [ ] 1.2 In `createSystemController.update`, accept `gazeY` (viewport-relative) and `t`; compute `gazeContentY = scrollTop + gazeY`.
- [ ] 1.3 Implement `systemUnderGaze`: forward-most box index `i ≤ active` whose `[top, bottom]` contains `gazeContentY` (reuse the existing overlap tie-break); null if none.
- [ ] 1.4 Accumulate dwell time from `t` while `systemUnderGaze < active`; reset to zero on any frame where gaze is on/past the active system or in a gutter.
- [ ] 1.5 When accumulated dwell ≥ `revertDwellMs`, set `active = systemUnderGaze` and reset the accumulator. Run this before the existing forward-advance/scroll-target step so it applies the same frame.
- [ ] 1.6 Keep `createSystemSelector`'s forward `update(fx, count)` path unchanged.

## 2. Wire up the main loop (`web/js/main.js`)

- [ ] 2.1 Pass `gazeY: y` and `t: latestSample.t` into `sysController.update({ ... })`.
- [ ] 2.2 Confirm the overlay picks up the reverted `res.active` (existing `overlay.setActive` crossfades back — no overlay code change expected).

## 3. Tuning (`gazescroll/state.py`)

- [ ] 3.1 Add `revertDwellMs` (default `500.0`) to `TUNING_DEFAULTS`.
- [ ] 3.2 Expose it in the tuning panel slider set so it applies live and persists via `/api/tuning`.

## 4. Tests (`web/tests/control.test.js`)

- [ ] 4.1 Sustained dwell over an earlier system reverts the active index after `revertDwellMs`.
- [ ] 4.2 A transient (sub-threshold) glance over an earlier system does not revert.
- [ ] 4.3 Dwell over the active system (or a gutter) never reverts and resets the accumulator.
- [ ] 4.4 After a revert, a normal sweep-and-return advances forward from the corrected index.
- [ ] 4.5 Existing forward-advance and overlap-no-regression tests still pass unchanged.

## 5. Verify

- [ ] 5.1 Run `web/tests` (vitest) and the Python tuning tests green.
- [ ] 5.2 Webcam smoke: confirm a stray left–right shift no longer skips the system, and a genuine downward move still advances.
