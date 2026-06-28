## Context

`createSystemSelector.update(fx, count)` (`web/js/gaze/control.js:141-164`) advances the active
system on a return-left saccade after a right sweep, with no vertical input. A horizontal
left–right shift while the reader is still on the current line therefore advances one system
too far, and because the index is strictly forward-only there is no recovery short of a manual
scroll (which re-seats via `activeAtScroll`). `systemScrollTarget` interpolates scroll by `fx`,
so the same stray shift also nudges the page forward.

The main loop already has everything needed for the fix: gaze viewport-y as `y`
(`main.js:320`), the scroll offset (`view.scrollTop`), the full strip-coordinate box stack
(`flat`), and a per-sample timestamp (`latestSample.t`). Content-space gaze y is simply
`view.scrollTop + y`; the box that contains it identifies the system the reader is resting on.

## Goals / Non-Goals

**Goals:**
- Correct a premature advance by reverting the active system to the one the gaze is actually
  resting on, gated by a sustained dwell so saccade noise never triggers it.
- Keep the forward saccade path and the overlap-tolerant tie-break exactly as they are.
- One persisted tunable for the dwell threshold; deterministic, unit-testable logic.

**Non-Goals:**
- No backward scrolling. Reverting corrects the active *index* (and thus the overlay and all
  future advances); it does not rewind `scrollTop`. Forward-only scroll is preserved.
- No velocity/jump detection — dwell over an earlier system, measured by sample timestamps,
  is the whole signal.
- No backend, detection, render, or API-shape changes.

## Decisions

**D1 — Revert by index only, not by scroll.** When sustained dwell fires, set
`active = systemUnderGaze` (which is `< active`). Scroll stays where it is (forward-only). This
is meaningful on its own: it re-points the debug overlay at the correct system and stops the
*next* return-left saccade from compounding the skip into a two-system jump. Once the reader
genuinely moves down, the normal saccade resumes advancing from the corrected index.
- *Alternative considered:* ease `scrollTop` back to the reverted system's snap position.
  Rejected — a backward scroll jolt is more disorienting than the premature forward nudge it
  undoes, and it breaks the forward-only invariant that the rest of the controller relies on.

**D2 — "System under gaze" = forward-most box containing content-y, capped at `active`.** Reuse
the existing overlap tie-break (prefer the forward-most plausible system). The controller
computes `gazeContentY = scrollTop + y`, finds the latest box index `i ≤ active` whose
`[top, bottom]` contains `gazeContentY`, and treats `i` as the system under gaze. Only `i < active`
is a revert candidate. If no box contains the point (gaze in a gutter), no revert.

**D3 — Dwell measured by sample timestamps, not frame counts.** The controller accumulates the
time the gaze has continuously been over an earlier system using the gaze sample `t` (passed in
from `main.js`); when the accumulated dwell ≥ `revertDwellMs`, it reverts and resets the
accumulator. Any frame where the gaze is back on (or past) the active system resets it to zero.
Using `t` keeps the logic deterministic and unit-testable (tests pass explicit timestamps); it
avoids `Date.now()` (also unavailable in workflow scripts) and is robust to frame-rate variance.
- *Default:* `revertDwellMs = 500` (≈ a deliberate rest, well above a 100–200 ms return saccade).
  Tunable live via the existing `/api/tuning` store, like the other system-aware params.

**D4 — Plumb gaze y + t through `createSystemController.update`.** `update` currently takes
`{ boxes, fx, reading, viewportH, scrollTop, contentH }`. Add `gazeY` (viewport-relative) and
`t`. The controller derives `gazeContentY` and runs the D2/D3 revert check before the existing
forward-advance/scroll-target computation, so a revert in frame N takes effect the same frame.
`createSystemSelector` either gains the dwell state or the controller owns it — implementation
detail; the selector's existing `update(fx, count)` forward path is unchanged.

## Risks / Trade-offs

- **Legitimately re-reading the previous line looks like a "mistake" and reverts** → That is the
  correct behavior: the reader's eyes are on that system, so highlighting/advancing from there
  is right. The 500 ms gate keeps quick back-glances (proofreading a note) from triggering it.
- **Premature forward scroll already happened and is not undone (D1)** → Accepted. The visible
  page rarely moves far on a single stray shift (bounded by `maxStepPerFrame`), and the index
  correction stops the error compounding. Revisit only if real webcam use shows the residual
  scroll is itself disorienting.
- **Gaze y is noisier than x near system boundaries** → The dwell gate plus the forward-most
  tie-break (D2) absorb single-frame excursions; only sustained dwell over an *earlier* box
  reverts.

## Open Questions

- Should `revertDwellMs` share a tuning-panel row with the other thresholds, or is the default
  fine until webcam testing? (Lean: ship the default, expose the slider, tune from the seat.)
