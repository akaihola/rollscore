---
name: gaze-tracking-alternatives
description: Deep-research survey (2026-06-30) of open-source WebGazer alternatives with better head-pose robustness — WebEyeTrack flagged as the candidate to prototype if drift persists
metadata: 
  node_type: memory
  type: project
  originSessionId: 392b00e2-e24e-4c04-acdb-8e157c0ad678
---

**Why this was researched:** while diagnosing [[gaze-calibration-degradation]] (WebGazer's no-head-pose-model architecture), asked whether any other open-source gaze tracker handles head pose better, in case the `weightedRidge`/`clearData()` fix isn't enough.

**Finding — no safe drop-in replacement exists yet, but one promising candidate:**

- **WebEyeTrack** ([github.com/RedForestAI/WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack), MIT, arXiv 2508.19544, Aug 2025) is the only candidate that is (a) pure browser/TensorFlow.js (no backend change), (b) explicitly head-pose-aware (adds 3D-face-reconstruction-based pose estimation, which WebGazer entirely lacks), and (c) calibrates from ≤9 one-time samples via on-device few-shot learning instead of WebGazer's continuous click-append model.
- Authors' own 20-minute head-to-head benchmark: WebGazer's error grew 49% (7.79→11.62cm) over the session vs WebEyeTrack's 20% (7.24→8.72cm) — directly the drift failure mode we hit.
- **Caveat:** single arXiv preprint, not independently reproduced; npm package is v0.0.x with no commits since Sep 2025. Immature — not a safe swap-in today.

**Other options surveyed, all requiring a local Python backend (bigger architectural change than WebGazer's pure-browser model):**
- **GazeFollower** (Python, ACM CGIT 2025) — best accuracy claims (1.11cm/0.11cm), on par with budget commercial trackers.
- **OpenFace / L2CS-Net / RT-GENE** — research-grade, pose-aware, native C++/Python only, no realistic browser path.
- **EyeGestures** (GPL-3.0) — ships both JS and Python builds off one Rust engine, actively maintained, but copyleft license and unbenchmarked against this specific drift failure.
- **MediaPipe Iris** — not a gaze estimator at all (landmarks only); ruled out.

**How to apply:** ship the `weightedRidge`/`clearData()` fix as-is (already done, see [[gaze-calibration-degradation]]). Don't switch libraries now. If drift returns over long sessions despite the fix, prototype WebEyeTrack next — re-check its commit activity/maturity first since it was stalled as of this research date. Reserve GazeFollower-style backend integration for a later, bigger redesign only if WebEyeTrack also proves insufficient.
