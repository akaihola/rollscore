## Why

The reading-saccade advance (`createSystemSelector.update`) fires on any return-left gaze
movement after a right sweep, with no check on the gaze's vertical position. A horizontal
left–right shift while the reader is still on the *current* system therefore both scrolls
the page and advances the active system one too far. The reader then sees the next system
highlighted (and scrolled toward) while still reading the line above it — a premature skip
with no way to recover except manual scroll.

## What Changes

- Feed the gaze's vertical position (in strip/content coordinates) into the active-system
  logic, used only as a *correction* signal — never as the primary advance trigger.
- When the gaze stays consistently over an earlier system than the active one (sustained
  dwell, not a transient saccade), revert the active system back to the system the gaze is
  actually resting on. This treats a premature advance as the recoverable mistake it is.
- **BREAKING (spec-level):** relax the strict forward-only invariant in `system-aware-scrolling`
  to permit this bounded revert. The active index may decrease only via the sustained-dwell
  revert; the existing saccade path remains forward-only.
- The debug overlay crossfades back to the reverted system (existing crossfade, driven by the
  corrected active index — no new visualization work).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `system-aware-scrolling`: the "Track the active system from gaze" requirement changes from
  strictly forward-only to forward-only-with-bounded-revert; vertical gaze position gains a
  defined corrective role (sustained dwell over an earlier system reverts the active index).

## Impact

- `web/js/gaze/control.js`: `createSystemSelector` / `createSystemController` gain a
  vertical-dwell revert path; `update` signature takes the gaze content-y (or a precomputed
  "system under gaze" index) plus the boxes.
- `web/js/main.js`: compute gaze y in strip/content coordinates and pass it into the controller.
- `gazescroll/state.py`: one new tunable (revert dwell threshold), persisted via `/api/tuning`.
- `web/tests/control.test.js`: new cases for sustained-dwell revert and no-revert-on-transient.
- No backend detection or render changes; no API surface changes beyond the tuning default.
