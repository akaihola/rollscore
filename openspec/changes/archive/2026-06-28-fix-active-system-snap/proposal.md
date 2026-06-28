## Why

When the reading saccade advances the active staff system to one that is only partially
visible at the bottom of the screen, scrolling freezes with that system still half cut off
— it is never snapped fully into view.

Root cause (confirmed by reproducing `createSystemController` and by inspecting the live debug
overlay): the active system **does** advance correctly to the partially-visible system (the
overlay highlights it). But bringing it into view is gated on `reading`, and at the start of a
new line the player's gaze sits in the **left margin, left of the tuned music column
(`columnX0`)** — so `isReading` returns false (`x < columnX0`). `update()` then takes its
`if (!reading) return { scrollTop }` hold branch and scroll **freezes with the active system
still clipped**. Moving the gaze right into the column flips `reading` true again, which is
why scrolling resumes only on a rightward move. (Secondarily, even while reading the snap is
rate-limited to `maxStepPerFrame` = 8 px/frame, the gentle sweep cap, so a large gap crawls in
rather than snapping.)

## What Changes

- When the active system advances, the controller guarantees that system is brought
  **fully into view** (scrolled forward to at least its `snapStart`) **promptly and
  independent of the per-frame `reading` gate** — so a half-clipped, hard-to-fixate line no
  longer freezes the scroll.
- Only the additional "raise the system toward the top of the viewport" sweep interpolation
  stays gated on `reading` (it is the reading-driven part).
- The snap uses a per-frame budget large enough to frame the system in a few frames, separate
  from the gentle `maxStepPerFrame` used for the sweep; the snap stays eased (not a jarring
  jump) and forward-only.
- Add a tunable snap-step parameter, exposed through the existing tuning panel.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `system-aware-scrolling`: the "Snap the active system fully into view at the left edge"
  requirement changes so the snap (a) completes independent of the per-frame reading gate
  once an advance is detected, and (b) completes promptly regardless of gap size. The
  "Tunable system-aware parameters" requirement adds the snap-step parameter.

## Impact

- `web/js/gaze/control.js`: `createSystemController.update` (snap decoupled from the
  `!reading` hold and from the reading-velocity step cap).
- `web/js/tuning.js`: new snap-step tuning slider + default.
- `web/tests/control.test.js`: snap-on-advance framing tests (incl. snap completing while
  `reading` is false).
- `tests/test_state.py`: include the new param in the per-frame key set.
- No backend, API, or data changes.
