---
name: gaze-calibration-degradation
description: Why adding lots of Shift+click gaze calibration points eventually wrecks WebGazer accuracy — and the weightedRidge + clearData fix
metadata: 
  node_type: memory
  type: project
  originSessionId: b6f7b9dd-6e58-4758-9bef-a0d81a73b402
---

**Symptom:** adding many calibration points (Shift+click) eventually degrades the model — detected gaze goes "all over the place."

**Root cause (verified against vendored `web/vendor/webgazer.js` + WebGazer IJCAI16 paper):**
WebGazer maps a **120-dim raw eye-pixel feature** (each eye resized 10×6, grayscale, histogram-equalized) straight to screen X/Y via **ridge regression with λ=1e-5** (≈ ordinary least squares — almost no regularization). Click samples sit in a **FIFO `DataWindow(700)`**; the full window is re-solved (120×120) every frame. There is **no head-pose normalization**. The paper itself states accuracy "degrades with significant head pose changes and extended session duration."

So every Shift+click over a session bakes in a slightly different head pose. The default `ridge` weights **all** points equally with **no recency** → accumulated drift becomes contradictory equal-weight samples → tiny λ lets the fit chase them → exploding weights → wild predictions. Clustered clicking over-represents one region (least-squares skew). Eviction at 700 is a *late* effect (~670 clicks); drift+clustering bite at *dozens* of points.

**The fix WebGazer ships for exactly this:**
- `setRegression("weightedRidge")` instead of `"ridge"` — newest interactions weighted more, so stale drifted points decay. (We currently use plain `ridge` at `web/js/gaze/webgazer-source.js:48`.)
- Call `webgazer.clearData()` before a recalibration pass — our `c` key (`web/js/main.js:555`) cancels the grid overlay but **never clears** the polluted 700-window, so "recalibrating" only dilutes a bad model. `clearData()` clears regs + localforage.

**Why:** addresses both confirmed causes (no-recency + no-clean-slate) without us reimplementing the regression math.
**How to apply:** the Malta paper ([[ref-pmc7861241]]) is hardware+Kalman, not WebGazer — don't cite it as evidence here. Our cheap drift handler is the recenter offset (`computeRecenterOffset`); lean on it instead of re-clicking.
