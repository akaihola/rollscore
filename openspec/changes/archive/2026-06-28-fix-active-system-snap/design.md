## Context

`createSystemController.update` in `web/js/gaze/control.js` drives system-aware scrolling:

```js
if (!boxes || boxes.length === 0) return null;
if (!reading) return { scrollTop, active: selector.active() };   // (1) hold branch
const active = selector.update(fx, boxes.length);                // (2) advance only while reading
const target = systemScrollTarget(boxes[active], { viewportH, topMargin, fx });
const next = stepTowardTarget(scrollTop, target, { maxStepPerFrame, maxScroll }); // (3) ≤8px/frame
```

`systemScrollTarget` frames the active system between `snapStart = box.bottom − viewportH`
(bottom-aligned, fully visible) at `fx=0` and `sweepEnd = box.top − topMargin` (top-aligned)
at `fx=1`.

Reproducing this against a synthetic trace (active system advances to a box half-clipped at
the bottom, `reading: true`) shows scroll **always steps forward** at `maxStepPerFrame` — it
never stops. So the observed *complete* stop cannot happen while reading. It is produced by
branch (1). Confirmed live with the debug overlay: the active system advances correctly to the
clipped system (it is highlighted), but at the **start of a new line the gaze sits in the left
margin, left of the tuned music column `columnX0`**, so `isReading` returns false
(`x < columnX0`). `update()` returns early at (1) and **holds** with the system clipped. The
overlay still shows the highlight on the clipped system (active advanced), and the gaze dot
still moves (drawn ungated) — matching the report. Moving the gaze right brings `x` into the
column, `reading` flips true, and (3) snaps it in — which is why scroll resumes only on a
rightward move. The 8px/frame cap on (3) is a secondary issue (a large gap crawls rather than
snaps).

So there are two coupled defects: the snap is (A) gated on continued reading, and (B)
rate-limited to the gentle sweep cap.

## Goals / Non-Goals

**Goals:**
- Once an advance is detected, guarantee the new active system is brought fully into view
  (`scrollTop ≥ snapStart`), independent of whether `reading` stays true afterward.
- Frame it promptly (a few frames), not at the 8px reading-velocity rate.
- Keep the motion eased and forward-only; preserve the non-decreasing-scrollTop, per-frame
  bounded-delta safety invariant the tests assert.

**Non-Goals:**
- No change to the saccade-driven selector (advance trigger) or to the sweep interpolation
  curve toward `sweepEnd`.
- No change to the vertical-gaze fallback (empty-boxes path).
- Not an instant `scrollTop = snapStart` jump — the snap stays animated, just faster.

## Decisions

**Decision: split the active-system motion into an always-on snap baseline and a
reading-gated raise.**

- **Snap baseline (ungated):** every frame with boxes, ensure the active system
  (`selector.active()`) is at least fully visible by stepping `scrollTop` toward its
  `snapStart` at a dedicated `snapStepPerFrame` budget — *even when `reading` is false*. This
  is what fixes the freeze: a half-clipped line is pulled fully into view regardless of the
  reading gate, and forward-only means an already-visible system holds (no backward scroll).
- **Reading raise (gated):** when `reading` is true, advance the selector as today and
  interpolate further toward `sweepEnd` at the gentle `maxStepPerFrame`, as the gaze sweeps
  left→right.

Concretely, the `if (!reading) return { scrollTop }` early-return is replaced by: when not
reading, still step toward the active system's `snapStart` (snap budget, forward-only), then
return — instead of holding. When reading, snap toward `snapStart` at the snap budget until
reached, then interpolate toward the fx-target at `maxStepPerFrame`.

- *Alternative — one-shot "snap pending" flag set on advance:* equivalent effect but adds
  state; the "always keep the active system ≥ fully visible" invariant is simpler, stateless,
  and also corrects any drift where the active system is below view for other reasons.
- *Alternative — instant jump to `snapStart`:* the existing requirement forbids a jarring
  jump; an eased multi-frame snap keeps the bounded-delta invariant meaningful.
- *Alternative — raise `maxStepPerFrame` globally:* rejected; it would make the in-line sweep
  jerk to reading-speed scroll, which the gentle cap exists to prevent.

**Decision: expose `snapStepPerFrame` in the tuning panel** (default ~40–60 px/frame: a typical
off-screen-system gap closes in 2–4 frames at 60fps), persisted via `/api/tuning`.

## Risks / Trade-offs

- **[Snapping while not reading scrolls when the player looks away]** → forward-only + the
  "only as far as `snapStart`" ceiling means it never scrolls past keeping the active system
  fully visible; it cannot run away. It only ever finishes framing the system the player just
  advanced to.
- **[New param NaNs the controller if unset]** → `tests/test_state.py` already asserts every
  tuning key is present each frame; add `snapStepPerFrame` to that set with a default.
- **[Behavioral test drift]** → `stepTowardTarget` bounded-delta tests still hold (still
  bounded, by a different cap). The "holds position … while not reading" test still passes
  because its boxes are already fully visible (`snapStart ≤ scrollTop`), so the ungated snap
  takes no step. Add a test for the freeze case: advance to a half-clipped box with
  `reading:false` on later frames → still reaches `snapStart`.
