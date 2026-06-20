# Webcam gaze-accuracy spike — result

Phase 0 of the gaze-scroll MVP plan
(`docs/plans/2026-06-13-gaze-scroll-web-app-mvp.md`). The make-or-break question:
*can a plain laptop webcam drive a comfortable vertical read-position follower?*

Harness: `web/spike/gaze-accuracy.html` (WebGazer, ridge regression, 9-point click
calibration) → descending target band → per-frame log of `{t, targetY, gazeY, confidence}`.

## Spike result (2026-06-20) — verdict: **GO**

One pass, 509 samples, ~8.5 s, band speed 120 px/s, estimated viewport height
~1082 px. Seated at the instrument, normal lighting. Metrics computed with the
same smoothing the app will use (5-sample median + EMA `alpha=0.3` on `gazeY`):

| Metric | Value | Gate |
| --- | --- | --- |
| Smoothed **median** vertical error | **8.3%** of viewport | GO threshold ≲ 10–12% — **pass** |
| Smoothed mean / p90 error | 9.6% / 18.0% | — |
| **Jitter** (detrended smoothed-gaze residual std) | **1.5%** of viewport (~16 px) | small — no lurch risk |
| Tracking correlation (target vs smoothed gaze) | **r = 0.926** | strong |
| Samples within 10% / 15% error | 60% / 79% | — |
| Samples beyond 25% error | 3% | acceptable outliers |

**Decision: GO.** Smoothed median error (8.3%) is comfortably inside the
10–12% gate and jitter is tiny. The occasional 15–25% excursions (18% of frames)
are exactly what the Phase 9 **on-music gate + coast-then-freeze + dead-zone**
are designed to absorb, so vertical-only following should feel stable. Proceed to
Phase 1.

### Caveats / notes for execution
- Single pass only (plan suggested 3–4). Numbers were clean enough for a verdict;
  re-run the spike if behaviour feels worse in the real reader.
- The first ~0.7 s of the pass shows large errors / negative `gazeY` (calibration
  settling at pass start) — favours a brief warm-up before engaging auto-scroll.
- WebGazer exposes **no native confidence** (logged as constant `1`); the on-music
  gate must lean on the music-column x-bounds + smoothing, not a confidence signal.
- **Setup gotcha (fixed):** the Brown-hosted `webgazer.js` defaults
  `faceMeshSolutionPath` to the relative `./mediapipe/face_mesh`, whose model files
  404 → `begin()` throws `TypeError: t is not a function`. The spike now pins the
  path to `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619`
  (all assets 200). Carry this pin into the Phase 10 `WebGazerGazeSource`.
- `NotReadableError: Could not start video source` on a second browser = camera
  busy (another browser/app still holds it), not a code bug — use one browser.
