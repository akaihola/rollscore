# Design rationale — webcam-gaze spike

The MVP reader was shaped by one make-or-break question, settled before any
reader code was written (Phase 0 of the gaze-scroll MVP plan):

> Can a plain laptop webcam drive a *comfortable* vertical read-position
> follower — accurate and stable enough to keep the music scrolling under your
> eyes without lurching?

If the answer were no, the whole "render a tall strip and auto-scroll it"
architecture would have been the wrong shape and the project would have needed
a different input path (dedicated eye-tracker, foot pedal). So the spike gated
the design.

## Spike and verdict (2026-06-20) — **GO**

Harness: `web/spike/gaze-accuracy.html` (WebGazer, ridge regression, 9-point
click calibration) drove a descending target band and logged per-frame
`{t, targetY, gazeY, confidence}`. One pass, 509 samples, ~8.5 s, band speed
120 px/s, ~1082 px viewport, seated at the instrument under normal lighting.
Metrics were computed with the same smoothing the app uses (5-sample median +
EMA `alpha=0.3` on `gazeY`):

| Metric | Value | Gate |
| --- | --- | --- |
| Smoothed median vertical error | **8.3%** of viewport | GO threshold ≲ 10–12% — **pass** |
| Smoothed mean / p90 error | 9.6% / 18.0% | — |
| Jitter (detrended residual std) | **1.5%** of viewport (~16 px) | small — no lurch risk |
| Tracking correlation (target vs smoothed gaze) | **r = 0.926** | strong |
| Samples beyond 25% error | 3% | acceptable outliers |

**Decision: GO.** Median error sits comfortably inside the 10–12% gate and
jitter is tiny, so a vertical-only follower should feel stable.

## Why the reader is built the way it is

The spike's numbers — good *median* tracking but occasional 15–25% excursions,
and no usable native confidence signal from WebGazer — directly justify the
shipped reader shape that these three specs document:

- **Vertical-only following on a continuous strip.** The spike only validated
  vertical accuracy; horizontal gaze is good enough only to decide whether you
  are on the music. So scores render as one tall, fit-to-width vertical strip
  (`score-rendering`) that a single `scrollTop` controller drives.
- **Heavy smoothing + manual override always one input away.** The excursions
  are absorbed downstream (smoothing, dead-zone, coast-then-freeze — specced
  elsewhere), but the spike's "manual is always one keystroke/tap away" lesson
  is why the basic control surface (`reader-controls`) exists and why every
  manual input preempts and pauses gaze, and gaze starts disengaged.
- **A brief warm-up before engaging.** The first ~0.7 s of the pass showed
  calibration settling, which is why gaze starts paused and the player opts in.

These are documented as rationale only; the smoothing/gate/coast control loop
itself, calibration, and viewport stability are specced in their own
capabilities (`gaze-calibration`, `gaze-viewport-stability`,
`system-aware-scrolling`).
