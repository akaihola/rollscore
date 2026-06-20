/**
 * Pure gaze-control core: smoothing, on-music gating, reading-velocity
 * estimation, and the scroll controller. No camera, no DOM — every function is
 * deterministic over its inputs so it can be unit-tested against synthetic gaze
 * traces (see `tests/control.test.js`).
 */

/**
 * Median-then-EMA smoother for a noisy 1-D signal (the gaze y-coordinate).
 *
 * A `medianWindow`-sample ring buffer rejects single-frame spikes; the median
 * then feeds an exponential moving average (`ema = alpha*median + (1-alpha)*ema`).
 * `alpha = 1` is a pure median; a small `medianWindow` (1) is a pure EMA.
 */
export function createSmoother({ medianWindow, alpha }) {
  const buf = [];
  let ema = null;

  return {
    push(y) {
      buf.push(y);
      if (buf.length > medianWindow) buf.shift();
      const sorted = [...buf].sort((a, b) => a - b);
      const median = sorted[Math.floor((sorted.length - 1) / 2)];
      ema = ema === null ? median : alpha * median + (1 - alpha) * ema;
      return ema;
    },
    value() {
      return ema;
    },
  };
}

/**
 * On-music gate: is the reader actually looking at the score right now?
 *
 * True only for a confident sample whose `x` falls inside the music column
 * `[columnX0, columnX1]`. Filters out low-confidence frames and glances toward
 * the hands/keyboard outside the column.
 */
export function isReading({ x, confidence }, { columnX0, columnX1, minConfidence }) {
  return confidence >= minConfidence && x >= columnX0 && x <= columnX1;
}

/**
 * Reading speed: least-squares slope of `y` vs `t` over a short sample history,
 * clamped to `[0, maxVelocity]`. The lower clamp enforces forward-only reading
 * (an upward gaze drift never produces negative velocity); the upper clamp keeps
 * a bad fit from driving a runaway scroll. Returns 0 for fewer than 2 samples.
 */
export function estimateReadingVelocity(samples, { maxVelocity }) {
  const n = samples.length;
  if (n < 2) return 0;

  let sumT = 0, sumY = 0;
  for (const { t, y } of samples) {
    sumT += t;
    sumY += y;
  }
  const meanT = sumT / n, meanY = sumY / n;

  let num = 0, den = 0;
  for (const { t, y } of samples) {
    const dt = t - meanT;
    num += dt * (y - meanY);
    den += dt * dt;
  }
  if (den === 0) return 0;

  const slope = num / den;
  return Math.max(0, Math.min(maxVelocity, slope));
}

/**
 * One frame of the scroll controller. Pure: `(state, input) -> {scrollTop, state}`.
 *
 * While reading, it nudges the page so the smoothed gaze point sits at the
 * `setpoint` fraction of the viewport: a dead-zone suppresses jitter, the step
 * is bounded by `min(maxStepPerFrame, readingVelocity·dt, |error|)`, and it is
 * forward-only (an above-setpoint gaze never scrolls back). When reading stops
 * it coasts at the last velocity for `coastMs`, then freezes. The result is
 * always clamped to `[0, contentH - viewportH]`.
 *
 * Safety invariant (relied on in tests): `scrollTop` is non-decreasing and each
 * frame's delta is ≤ `maxStepPerFrame`.
 */
export function stepController(state, input) {
  const {
    smoothedY, reading, readingVelocity,
    viewportH, scrollTop, contentH, dtMs, params,
  } = input;
  const { setpoint, deadzone, maxStepPerFrame, coastMs } = params;

  const maxScroll = Math.max(0, contentH - viewportH);
  const error = smoothedY - viewportH * setpoint; // +ve → gaze below setpoint

  let lastVelocity = state.lastVelocity ?? 0;
  let coastRemainingMs = state.coastRemainingMs ?? coastMs;
  let step = 0;

  if (reading) {
    lastVelocity = readingVelocity;
    coastRemainingMs = coastMs;
    if (error > deadzone) {
      step = Math.min(maxStepPerFrame, readingVelocity * dtMs, error);
    }
  } else {
    coastRemainingMs -= dtMs;
    if (coastRemainingMs > 0) {
      step = Math.min(maxStepPerFrame, lastVelocity * dtMs);
    }
  }

  step = Math.max(0, step); // forward-only
  const next = Math.max(0, Math.min(maxScroll, scrollTop + step));
  return { scrollTop: next, state: { lastVelocity, coastRemainingMs } };
}
