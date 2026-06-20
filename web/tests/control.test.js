import { describe, it, expect } from "vitest";
import {
  createSmoother,
  isReading,
  estimateReadingVelocity,
  stepController,
} from "../js/gaze/control.js";

describe("smoother", () => {
  it("rejects a single-frame spike via median window", () => {
    const s = createSmoother({ medianWindow: 5, alpha: 1 }); // alpha=1 → pure median
    [100, 100, 100, 100, 100].forEach((y) => s.push(y));
    const before = s.value();
    s.push(9999); // spike
    expect(Math.abs(s.value() - before)).toBeLessThan(5);
  });

  it("EMA lags toward a step change", () => {
    const s = createSmoother({ medianWindow: 1, alpha: 0.3 });
    s.push(0);
    s.push(100);
    expect(s.value()).toBeGreaterThan(0);
    expect(s.value()).toBeLessThan(100);
  });
});

describe("isReading (on-music gate)", () => {
  const params = { columnX0: 200, columnX1: 800, minConfidence: 0.5 };

  it("is true for a confident gaze inside the music column", () => {
    expect(isReading({ x: 500, confidence: 0.9 }, params)).toBe(true);
  });

  it("is false when confidence is below the threshold", () => {
    expect(isReading({ x: 500, confidence: 0.2 }, params)).toBe(false);
  });

  it("is false when x is left of the music column (e.g. hands)", () => {
    expect(isReading({ x: 50, confidence: 0.9 }, params)).toBe(false);
  });

  it("is false when x is right of the music column", () => {
    expect(isReading({ x: 950, confidence: 0.9 }, params)).toBe(false);
  });
});

describe("estimateReadingVelocity", () => {
  it("recovers the slope of a steadily descending read", () => {
    // y climbs 50 px every 100 ms → 0.5 px/ms
    const samples = [0, 100, 200, 300, 400].map((t) => ({ t, y: 300 + 0.5 * t }));
    const v = estimateReadingVelocity(samples, { maxVelocity: 10 });
    expect(v).toBeCloseTo(0.5, 3);
  });

  it("clamps a runaway slope to maxVelocity", () => {
    const samples = [0, 100, 200, 300].map((t) => ({ t, y: 0.5 * t }));
    const v = estimateReadingVelocity(samples, { maxVelocity: 0.2 });
    expect(v).toBe(0.2);
  });

  it("never returns a negative velocity (gaze moving up)", () => {
    const samples = [0, 100, 200, 300].map((t) => ({ t, y: 500 - 0.4 * t }));
    expect(estimateReadingVelocity(samples, { maxVelocity: 10 })).toBe(0);
  });

  it("is ~0 for a noisy flat trace", () => {
    const noise = [2, -3, 1, -1, 2, -2, 0];
    const samples = noise.map((n, i) => ({ t: i * 100, y: 400 + n }));
    const v = estimateReadingVelocity(samples, { maxVelocity: 10 });
    expect(Math.abs(v)).toBeLessThan(0.05);
  });

  it("returns 0 with fewer than two samples", () => {
    expect(estimateReadingVelocity([{ t: 0, y: 5 }], { maxVelocity: 10 })).toBe(0);
    expect(estimateReadingVelocity([], { maxVelocity: 10 })).toBe(0);
  });
});

describe("stepController", () => {
  it("scrolls forward when reading point is below setpoint", () => {
    const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 800 };
    const out = stepController(
      {},
      {
        smoothedY: 600, reading: true, readingVelocity: 50,
        viewportH: 1000, scrollTop: 0, contentH: 10000, dtMs: 33, params,
      }
    );
    expect(out.scrollTop).toBeGreaterThan(0);
    expect(out.scrollTop).toBeLessThanOrEqual(8); // velocity-limited, no jump
  });

  it("does nothing inside the dead-zone", () => {
    const params = { setpoint: 0.4, deadzone: 50, maxStepPerFrame: 8, coastMs: 800 };
    const out = stepController(
      {},
      {
        smoothedY: 410, reading: true, readingVelocity: 0,
        viewportH: 1000, scrollTop: 100, contentH: 10000, dtMs: 33, params,
      }
    );
    expect(out.scrollTop).toBe(100);
  });

  it("never scrolls backward", () => {
    const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 800 };
    const out = stepController(
      {},
      {
        smoothedY: 100, reading: true, readingVelocity: 0, // gaze above setpoint
        viewportH: 1000, scrollTop: 500, contentH: 10000, dtMs: 33, params,
      }
    );
    expect(out.scrollTop).toBe(500); // forward-only clamp
  });

  it("coasts when not reading, then freezes", () => {
    const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 100 };
    let st = { lastVelocity: 60 };
    let out = stepController(st, {
      smoothedY: 600, reading: false, readingVelocity: 0,
      viewportH: 1000, scrollTop: 0, contentH: 10000, dtMs: 50, params,
    });
    expect(out.scrollTop).toBeGreaterThan(0); // still coasting at 50ms
    out = stepController(out.state, {
      smoothedY: 600, reading: false, readingVelocity: 0,
      viewportH: 1000, scrollTop: out.scrollTop, contentH: 10000, dtMs: 100, params,
    });
    const frozen = stepController(out.state, {
      smoothedY: 600, reading: false, readingVelocity: 0,
      viewportH: 1000, scrollTop: out.scrollTop, contentH: 10000, dtMs: 100, params,
    });
    expect(frozen.scrollTop).toBe(out.scrollTop); // past coast window → frozen
  });

  it("never exceeds content height", () => {
    const params = { setpoint: 0.4, deadzone: 1, maxStepPerFrame: 1000, coastMs: 800 };
    const out = stepController(
      {},
      {
        smoothedY: 999, reading: true, readingVelocity: 9999,
        viewportH: 1000, scrollTop: 9500, contentH: 10000, dtMs: 33, params,
      }
    );
    expect(out.scrollTop).toBeLessThanOrEqual(10000 - 1000);
  });
});
