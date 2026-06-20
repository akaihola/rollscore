import { describe, it, expect } from "vitest";
import { createSmoother } from "../js/gaze/control.js";

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
