import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  timelineDuration,
  SCENE_DEFAULTS,
  FAST_OVERRIDES,
} from "../spike/record-scenes.js";

const VW = 1920;
const VH = 1080;

describe("buildTimeline", () => {
  const segs = buildTimeline(VW, VH);

  it("runs lead-in → 9 calibration points → sweep → 4 head sweeps", () => {
    expect(segs.map((s) => s.kind)).toEqual([
      "dwell",
      ...Array(9).fill("calib"),
      "pursuit",
      ...Array(4).fill("head_sweep"),
    ]);
  });

  it("has unique segment ids", () => {
    const ids = segs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the full 3×3 calibration grid including 5% margins", () => {
    const pts = segs
      .filter((s) => s.kind === "calib")
      .map((s) => s.targetAt(0));
    const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(pts.map((p) => p.y))].sort((a, b) => a - b);
    expect(xs).toEqual([0.05 * VW, 0.5 * VW, 0.95 * VW]);
    expect(ys).toEqual([0.05 * VH, 0.5 * VH, 0.95 * VH]);
    expect(pts.length).toBe(9);
  });

  it("marks calibration and lead-in as unscored, sweep and head sweeps as scored", () => {
    for (const s of segs) {
      expect(s.score).toBe(s.kind === "pursuit" || s.kind === "head_sweep");
    }
  });

  it("sweep descends monotonically from top margin to bottom margin", () => {
    const sweep = segs.find((s) => s.kind === "pursuit");
    const n = 200;
    let prevY = -Infinity;
    for (let i = 0; i <= n; i++) {
      const { x, y } = sweep.targetAt((i / n) * sweep.durationMs);
      expect(y).toBeGreaterThanOrEqual(prevY);
      expect(x).toBeGreaterThanOrEqual(0.05 * VW - 1e-6);
      expect(x).toBeLessThanOrEqual(0.95 * VW + 1e-6);
      prevY = y;
    }
    expect(sweep.targetAt(0).y).toBeCloseTo(0.05 * VH);
    expect(sweep.targetAt(sweep.durationMs).y).toBeCloseTo(0.95 * VH);
  });

  it("sweep traverses the full horizontal range", () => {
    const sweep = segs.find((s) => s.kind === "pursuit");
    const xs = [];
    for (let i = 0; i <= 400; i++) {
      xs.push(sweep.targetAt((i / 400) * sweep.durationMs).x);
    }
    expect(Math.min(...xs)).toBeCloseTo(0.05 * VW);
    expect(Math.max(...xs)).toBeCloseTo(0.95 * VW);
  });

  it("head-sweep targets are static, cover center and bottom, both axes", () => {
    const sweeps = segs.filter((s) => s.kind === "head_sweep");
    for (const s of sweeps) {
      expect(s.targetAt(0)).toEqual(s.targetAt(s.durationMs / 2));
      expect(["yaw", "pitch"]).toContain(s.poseHint.axis);
    }
    const spots = new Set(sweeps.map((s) => s.targetAt(0).y));
    expect(spots).toEqual(new Set([0.5 * VH, 0.95 * VH]));
    expect(sweeps.filter((s) => s.poseHint.axis === "yaw").length).toBe(2);
    expect(sweeps.filter((s) => s.poseHint.axis === "pitch").length).toBe(2);
  });

  it("totals the documented default duration (~88.5 s)", () => {
    const d = SCENE_DEFAULTS;
    expect(timelineDuration(segs)).toBe(
      d.leadinMs + 9 * d.calibDwellMs + d.sweepMs + 4 * d.headSweepMs,
    );
  });

  it("fast overrides shrink the run to smoke-test scale", () => {
    const fastSegs = buildTimeline(VW, VH, FAST_OVERRIDES);
    expect(fastSegs.length).toBe(segs.length);
    expect(timelineDuration(fastSegs)).toBeLessThan(10_000);
  });
});
