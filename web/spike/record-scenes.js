/**
 * Scene timeline for the gaze-eval recording harness (`record-session.html`).
 * Phase 0 of the automated-evaluation plan (WebEyeTrack
 * `docs/evaluation/2026-07-05-automated-gaze-eval-proposal.md`): the session
 * protocol is a fixed sequence of segments — a lead-in dwell, a 9-point
 * calibration grid, a smooth-pursuit sweep, and fixed-target head sweeps.
 *
 * Pure logic, no DOM: a segment describes *where the target is* as a function
 * of time within the segment, so the schedule is unit-testable and the page
 * only renders it.
 *
 * @typedef {Object} Segment
 * @property {string} id           - unique within the timeline (e.g. "calib-4")
 * @property {string} kind         - calib | dwell | pursuit | head_sweep
 * @property {string} scene        - calibration | sweep | head-sweep
 * @property {string} label        - instruction shown to the subject
 * @property {boolean} score       - whether replay evaluation scores this segment
 * @property {number} durationMs
 * @property {number} [settleMs]   - leading part replay should not score (dwells)
 * @property {{axis: "yaw"|"pitch"}} [poseHint] - head-sweep axis
 * @property {(tRel: number) => {x: number, y: number}} targetAt
 *   - target center in CSS px for tRel ∈ [0, durationMs]
 */

export const SCENE_DEFAULTS = {
  leadinMs: 2000,
  calibDwellMs: 2500,
  calibSettleMs: 700,
  sweepMs: 24000,
  sweepTraversals: 4, // full horizontal crossings during the sweep
  headSweepMs: 10000,
  margin: 0.05, // target grid margin as a fraction of the viewport
};

/** Short durations so an automated smoke run finishes in seconds. */
export const FAST_OVERRIDES = {
  leadinMs: 300,
  calibDwellMs: 250,
  calibSettleMs: 80,
  sweepMs: 1500,
  headSweepMs: 400,
};

/**
 * Build the recording timeline for a viewport.
 * @param {number} vw - viewport width in CSS px
 * @param {number} vh - viewport height in CSS px
 * @param {Partial<typeof SCENE_DEFAULTS>} [opts]
 * @returns {Segment[]}
 */
export function buildTimeline(vw, vh, opts = {}) {
  const o = { ...SCENE_DEFAULTS, ...opts };
  const lo = o.margin;
  const hi = 1 - o.margin;
  const at = (fx, fy) => ({ x: fx * vw, y: fy * vh });
  const segments = [];

  // Lead-in: a clean frontal dwell so trackers that latch onto the first
  // frames (WebEyeTrack freezes its metric iris scale there) get a good one.
  segments.push({
    id: "leadin",
    kind: "dwell",
    scene: "calibration",
    label: "Look at the dot, face the screen straight on",
    score: false,
    durationMs: o.leadinMs,
    settleMs: 0,
    targetAt: () => at(0.5, 0.5),
  });

  // 9-point calibration grid, reading order, edges included (the bottom band
  // is where webcam trackers historically fail — it must be in the corpus).
  const fracs = [lo, 0.5, hi];
  let i = 0;
  for (const fy of fracs) {
    for (const fx of fracs) {
      const pos = at(fx, fy);
      segments.push({
        id: `calib-${i++}`,
        kind: "calib",
        scene: "calibration",
        label: "Look at the dot",
        score: false, // fed to the tracker's calibration API, never scored
        durationMs: o.calibDwellMs,
        settleMs: o.calibSettleMs,
        targetAt: () => pos,
      });
    }
  }

  // Smooth-pursuit sweep: x runs a constant-speed triangle wave while y
  // descends linearly — a lawnmower pass covering the screen including the
  // bottom edge. Head stays still; this is the pose-free accuracy baseline.
  segments.push({
    id: "sweep",
    kind: "pursuit",
    scene: "sweep",
    label: "Follow the dot with your eyes, keep your head still",
    score: true,
    durationMs: o.sweepMs,
    targetAt: (tRel) => {
      const p = Math.min(1, Math.max(0, tRel / o.sweepMs));
      const phase = p * o.sweepTraversals;
      const tri = Math.abs(1 - (phase % 2)); // 1→0→1 per two traversals
      return at(lo + (1 - tri) * (hi - lo), lo + p * (hi - lo));
    },
  });

  // Fixed-target head sweeps: the go/no-go diagnostic from the research memo.
  // Eyes stay on a static dot while the head moves through the operating
  // envelope; scored, and bucketed by pose at analysis time.
  const sweepSpots = [
    ["center", 0.5, 0.5],
    ["bottom", 0.5, hi],
  ];
  const axes = [
    ["yaw", "slowly turn your head LEFT and RIGHT"],
    ["pitch", "slowly nod your head UP and DOWN"],
  ];
  for (const [spot, fx, fy] of sweepSpots) {
    for (const [axis, motion] of axes) {
      const pos = at(fx, fy);
      segments.push({
        id: `head-${spot}-${axis}`,
        kind: "head_sweep",
        scene: "head-sweep",
        label: `Keep your eyes on the dot — ${motion}`,
        score: true,
        durationMs: o.headSweepMs,
        poseHint: { axis },
        targetAt: () => pos,
      });
    }
  }

  return segments;
}

/** @param {Segment[]} segments @returns {number} total duration in ms */
export function timelineDuration(segments) {
  return segments.reduce((sum, s) => sum + s.durationMs, 0);
}
