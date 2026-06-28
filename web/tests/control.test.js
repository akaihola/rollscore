import { describe, it, expect } from "vitest";
import {
  createSmoother,
  isReading,
  estimateReadingVelocity,
  stepController,
  createSystemSelector,
  systemScrollTarget,
  stepTowardTarget,
  createSystemController,
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

// --- Phase 14: system-aware layer ------------------------------------------

describe("createSystemSelector (active-system, forward-only)", () => {
  it("advances on a right-portion sweep then a return to the left", () => {
    const s = createSystemSelector({ sweepRightFrac: 0.6, returnLeftFrac: 0.3 });
    expect(s.update(0.1, 3)).toBe(0);
    expect(s.update(0.7, 3)).toBe(0); // swept into the right portion, not yet returned
    expect(s.update(0.2, 3)).toBe(1); // return to the left → advance one system
  });

  it("does not advance on a stray leftward glance without a prior right sweep", () => {
    const s = createSystemSelector({ sweepRightFrac: 0.6, returnLeftFrac: 0.3 });
    expect(s.update(0.2, 3)).toBe(0);
    expect(s.update(0.1, 3)).toBe(0);
  });

  it("never regresses and clamps at the last system (forward-only)", () => {
    const s = createSystemSelector({ sweepRightFrac: 0.6, returnLeftFrac: 0.3 });
    s.update(0.7, 2);
    expect(s.update(0.2, 2)).toBe(1); // advanced to the last of two
    s.update(0.7, 2);
    expect(s.update(0.2, 2)).toBe(1); // would advance but clamps at count-1
  });

  it("is immune to vertical overlap (selection is saccade-driven, no y input)", () => {
    const s = createSystemSelector();
    s.update(0.9, 3);
    expect(s.update(0.1, 3)).toBe(1);
    expect(s.update(0.1, 3)).toBe(1); // a further left glance does not regress
  });
});

describe("systemScrollTarget", () => {
  const box = { top: 1000, bottom: 1300 }; // 300 px system
  const viewportH = 600;
  const opts = (fx) => ({ viewportH, topMargin: 20, fx });

  it("snap start (fx=0) leaves the whole system at the screen bottom", () => {
    expect(systemScrollTarget(box, opts(0))).toBe(1300 - 600);
  });

  it("sweep end (fx=1) raises the system top to the screen top minus the margin", () => {
    expect(systemScrollTarget(box, opts(1))).toBe(1000 - 20);
  });

  it("interpolates linearly across the sweep", () => {
    const a = systemScrollTarget(box, opts(0));
    const b = systemScrollTarget(box, opts(1));
    expect(systemScrollTarget(box, opts(0.5))).toBeCloseTo((a + b) / 2, 6);
  });

  it("clamps a system taller than the viewport to a plain top-align", () => {
    const tall = { top: 1000, bottom: 1700 }; // 700 > viewport 600
    expect(systemScrollTarget(tall, opts(0))).toBe(980); // = top - margin
    expect(systemScrollTarget(tall, opts(1))).toBe(980);
  });
});

describe("stepTowardTarget (forward-only, bounded)", () => {
  it("steps toward a forward target, capped per frame", () => {
    expect(stepTowardTarget(100, 1000, { maxStepPerFrame: 8, maxScroll: 5000 })).toBe(108);
  });
  it("never scrolls back when the target is behind the current position", () => {
    expect(stepTowardTarget(500, 100, { maxStepPerFrame: 8, maxScroll: 5000 })).toBe(500);
  });
  it("clamps the target to maxScroll", () => {
    expect(stepTowardTarget(4998, 99999, { maxStepPerFrame: 8, maxScroll: 5000 })).toBe(5000);
  });
});

describe("createSystemController", () => {
  const boxes = [{ top: 100, bottom: 400 }, { top: 500, bottom: 800 }];
  const view = { viewportH: 600, scrollTop: 0, contentH: 5000 };

  it("returns null when there are no boxes (caller uses the vertical follower)", () => {
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 8, snapStepPerFrame: 50 });
    expect(c.update({ boxes: [], fx: 0.5, reading: true, ...view })).toBeNull();
    expect(c.update({ boxes: undefined, fx: 0.5, reading: true, ...view })).toBeNull();
  });

  it("holds position and does not advance while not reading (already-visible system → ungated snap takes no step)", () => {
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 8, snapStepPerFrame: 50 });
    const r = c.update({ boxes, fx: 0.1, reading: false, ...view, scrollTop: 250 });
    expect(r.scrollTop).toBe(250);
    expect(r.active).toBe(0);
  });

  it("advances the active system on a sweep-and-return and steps forward only", () => {
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 100000, snapStepPerFrame: 50 });
    const r0 = c.update({ boxes, fx: 0.9, reading: true, ...view });
    expect(r0.active).toBe(0);
    const r1 = c.update({ boxes, fx: 0.1, reading: true, ...view });
    expect(r1.active).toBe(1);
    expect(r1.scrollTop).toBeGreaterThanOrEqual(0);
  });

  // A next system only partially visible at the bottom: top is on-screen but the
  // bottom is clipped, so snapStart = bottom - viewportH > 0 must be reached.
  const clipBoxes = [{ top: 50, bottom: 300 }, { top: 550, bottom: 900 }];
  const clipView = { viewportH: 600, scrollTop: 0, contentH: 2000 };
  const snapStart1 = 900 - 600; // = 300

  // Advance the selector to system 1 (sweep into the right portion, return left).
  const advanceToSystem1 = (c) => {
    c.update({ boxes: clipBoxes, fx: 0.9, reading: true, ...clipView });
    return c.update({ boxes: clipBoxes, fx: 0.1, reading: true, ...clipView, scrollTop: 0 });
  };

  it("snaps a partially-visible advanced system fully into view within a few frames at the snap budget", () => {
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 8, snapStepPerFrame: 50 });
    const r1 = advanceToSystem1(c);
    expect(r1.active).toBe(1);

    let scrollTop = r1.scrollTop;
    let frames = 0;
    while (scrollTop < snapStart1 && frames < 50) {
      // Gaze at the left edge of the column (fx 0): only the snap drives motion.
      scrollTop = c.update({ boxes: clipBoxes, fx: 0, reading: true, ...clipView, scrollTop }).scrollTop;
      frames++;
    }
    expect(scrollTop).toBeGreaterThanOrEqual(snapStart1);
    // The 50px snap budget frames it in a handful; the 8px reading cap would need ~30+.
    expect(frames).toBeLessThanOrEqual(8);
  });

  it("recovers from a stale active after a manual scroll jump (freeze regression)", () => {
    // Selector is at system 0 (its sweep-end is at top-topMargin = 50-20 = 30).
    // The scroll has jumped to 800 (past system 0 and 1's ranges entirely).
    // The controller must auto-advance rather than freeze.
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 8, snapStepPerFrame: 50 });
    // Don't advance the selector — leave it at system 0 (stale).
    const jumpedView = { ...clipView, scrollTop: 800 }; // past both systems
    const r = c.update({ boxes: clipBoxes, fx: 0, reading: false, ...jumpedView });
    // After recovery the active must be system 1 (the last), not system 0.
    expect(r.active).toBe(1);
    // And scroll should hold (both systems are behind; last system's snap is also behind).
    expect(r.scrollTop).toBeGreaterThanOrEqual(800);
  });

  it("snap reaches snapStart even when reading is false on the following frames (freeze regression)", () => {
    const c = createSystemController({ systemTopMargin: 20, maxStepPerFrame: 8, snapStepPerFrame: 50 });
    const r1 = advanceToSystem1(c);
    expect(r1.active).toBe(1);

    // Gaze now rests in the left margin (left of the column): reading is false on
    // every later frame, yet the clipped system must still be pulled into view.
    let scrollTop = r1.scrollTop;
    for (let i = 0; i < 20 && scrollTop < snapStart1; i++) {
      const r = c.update({ boxes: clipBoxes, fx: 0, reading: false, ...clipView, scrollTop });
      expect(r.scrollTop - scrollTop).toBeLessThanOrEqual(50 + 1e-9); // bounded by snap budget
      expect(r.scrollTop).toBeGreaterThanOrEqual(scrollTop); // forward-only
      scrollTop = r.scrollTop;
    }
    expect(scrollTop).toBe(snapStart1);
  });
});
