import { describe, it, expect } from "vitest";
import { createSmoother, isReading } from "../js/gaze/control.js";

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
