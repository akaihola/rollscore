import { describe, it, expect } from "vitest";
import { createGazeController } from "../js/gaze/control.js";

const PARAMS = {
  medianWindow: 5,
  alpha: 0.5,
  velocityWindow: 8,
  columnX0: 200,
  columnX1: 800,
  minConfidence: 0.5,
  maxVelocity: 5,
  setpoint: 0.4,
  deadzone: 10,
  maxStepPerFrame: 8,
  coastMs: 800,
};
const VIEW = { viewportH: 1000, contentH: 10000 };

/** Run a trace through a fresh controller, threading scrollTop frame-to-frame. */
function runTrace(samples, params = PARAMS) {
  const ctl = createGazeController(params);
  let scrollTop = 0;
  const series = [];
  for (const s of samples) {
    scrollTop = ctl.update(s, { ...VIEW, scrollTop });
    series.push(scrollTop);
  }
  return series;
}

function assertSafe(series, params = PARAMS) {
  let prev = 0;
  for (const s of series) {
    expect(s).toBeGreaterThanOrEqual(prev); // non-decreasing (forward-only)
    expect(s - prev).toBeLessThanOrEqual(params.maxStepPerFrame + 1e-9); // bounded delta
    prev = s;
  }
}

// mulberry32 — tiny seeded PRNG for the property-style test.
function prng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("createGazeController pipeline", () => {
  it("scrolls monotonically forward for a descending-reading trace", () => {
    const samples = [];
    for (let i = 0; i < 80; i++) {
      samples.push({
        t: i * 33,
        x: 500, // inside the music column
        y: 300 + (400 * i) / 79, // 300 → 700
        confidence: 0.9,
      });
    }
    const series = runTrace(samples);
    assertSafe(series);
    expect(series.at(-1)).toBeGreaterThan(0); // it did move
    expect(series.at(-1)).toBeLessThan(80 * PARAMS.maxStepPerFrame); // sane band
  });

  it("coasts then freezes on a glance-away, never jumping", () => {
    const samples = [];
    for (let i = 0; i < 80; i++) {
      const reading = i < 40;
      samples.push({
        t: i * 33,
        x: reading ? 500 : 50, // glance to the keyboard at the halfway mark
        y: reading ? 300 + (300 * i) / 39 : 600,
        confidence: reading ? 0.9 : 0.1,
      });
    }
    const series = runTrace(samples);
    assertSafe(series);
    // After the glance, the tail must settle (freeze): last frames are equal.
    expect(series.at(-1)).toBe(series.at(-2));
  });

  it("setParams updates live behaviour — a tighter step cap throttles scroll", () => {
    const samples = [];
    for (let i = 0; i < 40; i++) {
      samples.push({ t: i * 33, x: 500, y: 300 + (400 * i) / 39, confidence: 0.9 });
    }
    const ctl = createGazeController({ ...PARAMS });
    let scrollTop = 0;
    // First 20 frames at the default step cap, then clamp it down to 1px/frame.
    for (let i = 0; i < 20; i++) {
      scrollTop = ctl.update(samples[i], { ...VIEW, scrollTop });
    }
    ctl.setParams({ maxStepPerFrame: 1 });
    let prev = scrollTop;
    for (let i = 20; i < 40; i++) {
      scrollTop = ctl.update(samples[i], { ...VIEW, scrollTop });
      expect(scrollTop - prev).toBeLessThanOrEqual(1 + 1e-9); // new cap honoured live
      prev = scrollTop;
    }
  });

  it("setParams rebuilds the smoother when medianWindow/alpha change", () => {
    const ctl = createGazeController({ ...PARAMS });
    // Should not throw and should keep producing valid scroll output afterwards.
    ctl.setParams({ medianWindow: 1, alpha: 1 });
    const out = ctl.update(
      { t: 0, x: 500, y: 500, confidence: 0.9 },
      { ...VIEW, scrollTop: 0 }
    );
    expect(Number.isFinite(out)).toBe(true);
  });

  it("upholds the safety invariant across random traces (property test)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = prng(seed);
      const samples = [];
      let y = 400;
      for (let i = 0; i < 120; i++) {
        y = Math.max(0, Math.min(1000, y + (rnd() - 0.4) * 60)); // drifts, mostly down
        samples.push({
          t: i * 33,
          x: rnd() < 0.7 ? 200 + rnd() * 600 : rnd() * 1100, // sometimes off-column
          y,
          confidence: rnd() < 0.8 ? 0.9 : 0.1, // sometimes low
        });
      }
      assertSafe(runTrace(samples));
    }
  });
});
