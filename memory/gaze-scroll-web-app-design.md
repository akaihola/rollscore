---
name: gaze-scroll-web-app-design
description: "Agreed design for the forScore gaze-scroll score reader web app (personal localhost tool, webcam read-position follower) — what was decided and what's deferred"
metadata: 
  node_type: memory
  type: project
  originSessionId: bfacfbff-f310-4c0a-9381-72e6d146b838
---

# Gaze-scroll score reader web app — design agreed 2026-06-13

Full spec: `docs/plans/2026-06-13-gaze-scroll-web-app-design.md` (committed to `main`).
Tracked in `BACKLOG.md` ("Web app — gaze-scroll score reader"). Builds on the archive/overlay
work in [[forscore-open-questions]].

**Concept:** a personal, localhost web app to read your own annotated forScore library on Linux
hands-free, auto-scrolling via webcam gaze tracking while you play an instrument.

**Locked decisions (don't re-litigate):**
- Personal local tool, no auth/hosting/multi-user.
- Thin browser front-end + small **FastAPI + pymupdf** backend reusing `extract_4sb.py`.
- Ingest **both** a `.4sb` (extract+cache) and a pre-extracted `out/`.
- Lazy server-side render of per-page crop + raster `aux/*.png` overlay composite → cached PNGs
  keyed by archive mtime. Crop is **empirical per page** (closed-form transform stays deferred).
- Gaze = **read-position follower**: vertical-only, heavily smoothed, on-music gated,
  reading-velocity estimator → setpoint controller (dead-zone + velocity limit), **coast then
  freeze** when off-music, forward-only/never-jump. Control logic = pure functions, unit-tested
  on synthetic traces. Behind a `GazeSource` abstraction (better tracker swappable later).
- Webcam-only sensor; **short calibration each session** + one-key recenter.
- Chooser: setlists + composer-sorted list, bookmark/piece jump, **resume last page+scroll**.
  No search, no metadata filtering beyond composer.
- Controls: keyboard shortcuts + invisible **tap zones**, no on-screen buttons.
- Setlist end = **stop and wait** (no auto-advance).

**Deferred within this effort:** foot pedal, search box, genre/key/difficulty/label filtering,
setlist auto-advance, smarter/persistent calibration, closed-form crop transform, Reflow/staff
detection, dedicated eye-trackers, annotation editing.

**Next steps:** (1) webcam gaze-accuracy **spike** — the make-or-break risk (can a plain webcam
drive a comfortable vertical follower?) — then (2) implementation plan via
`superpowers:writing-plans`.
