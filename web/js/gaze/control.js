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
