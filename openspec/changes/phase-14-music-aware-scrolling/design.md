## Context

The MVP renders each page fit-to-width onto a per-page canvas (`gazescroll/render.py`,
`gazescroll/crop.py`) and serves it as a strip of lazily-loaded PNGs (`web/js/reader.js`).
Scrolling is the **vertical-gaze follower** — a pure gaze→scroll pipeline
(`web/js/gaze/control.js`): smooth gaze-y, gate on the music column, estimate reading
velocity by least-squares slope, and nudge `scrollTop` toward a setpoint. It is forward-only
and clamped, but it is driven only by the vertical component of gaze and treats the page as
an image of known dimensions with unknown contents. It does not know where the systems are,
so it cannot guarantee a whole system is on-screen rather than clipped above or below — the
framing is unpredictable and tuning-heavy regardless of how the score is engraved.

The page render model is well understood (memory: `page render model v3`): the full page
is fit to canvas width with a constant width and per-page height; system boxes therefore
live naturally in that full-page canvas pixel space, and the front-end already scales that
space to the measured strip width (`scaledHeights` in `reader.js`).

The staff-detection approach is grounded in OMR research (`docs/notes/staff-system-grouping-research.md`):
for printed solo-piano pages the classic projection-profile pipeline is the easy,
explainable baseline, with stable-paths as the escalation if curvature/skew defeats it.

## Goals / Non-Goals

**Goals:**
- Detect grand-staff systems on rendered pages and serve them as bounding boxes in
  full-page canvas coordinates via a cached read endpoint.
- Replace the vertical-gaze follower's blind scroll with system-aware scroll: snap the
  active system fully into view on left-edge gaze, then interpolate across the left→right
  reading sweep until the active system's top reaches the screen top.
- Preserve the MVP path as a fallback so no page regresses.
- Keep detection pure/deterministic and unit-testable; keep the scroll core pure as today.

**Non-Goals:**
- Full OMR / symbol recognition, pitch, or measure detection.
- A learned/deep-learning detector (projection profile first; stable-paths only if needed).
- Handwritten-score robustness — target is printed solo piano (La Maja).
- Changing the render/crop pipeline or the resume/state model.

## Decisions

### D1: Detect on the rendered full-page bitmap, emit boxes in canvas coordinates
Run detection against the same full-page render the front-end already displays (reuse
`render_page_image` / the cached PNG), so boxes share the page's canvas pixel space and the
front-end maps them with the existing `stripWidth / canvasWidth` scale. Alternative —
detecting in PDF point space via pymupdf text/drawing extraction — was rejected: engraving
is vector graphics with no staff-line semantics, and the bitmap projection profile is
simpler and matches what the reader sees.

### D2: Classic projection-profile pipeline, escalate only if needed
Pipeline: binarize → horizontal projection histogram (black pixels per row) → peak-pick
staff lines → estimate interline spacing via run-length / peak spacing → group five
equally-spaced lines into a staff → pair consecutive staves into two-staff systems →
emit box = vertical span of the pair plus a ledger-line margin, horizontal span = music
column width. This is the Audiveris GRID logic minus the engine. If La Maja's tricky pages
(unclear inter-system spacing) defeat it, escalate to the stable-paths / connected-path
method — deferred, recorded as an open question, not built up front.

### D3: New `gazescroll/systems.py`, thin route, disk cache
Detection lives in its own module (pure functions over a page image + page size), mirroring
`render.py`'s shape. The route in `app.py` is thin (resolve root → call cached detector →
return JSON), like the existing `pages`/`page_image` routes. Cache reuses
`ingest._cache_dir()` under a `systems/{mtime_token}/{slug}/{page}.json` key, mirroring the
render cache so invalidation is automatic on archive change. Add `numpy` for the histogram
(already transitively present via pymupdf/PIL; declare it explicitly).

### D4: System-aware controller alongside the pure core, not a rewrite of it
Keep `createSmoother`/`isReading`/`estimateReadingVelocity`/`stepController` untouched —
they remain the fallback. Add a system-aware layer that, given the active page's scaled
system boxes plus the gaze sample, computes a target scrollTop from the **active system
alone**.

*Direction convention (used throughout this change):* **"scroll forward"** means `scrollTop`
**increases** — the viewport advances toward the end of the score and the page content moves
up the screen. The controller is **forward-only**: `scrollTop` never decreases. The terms
"down"/"up" are avoided for scroll direction; they are used only to describe where a system
*rests within the viewport* (its top/bottom).

Both interpolation endpoints are derived from that one system (in strip coords,
`sysTop`/`sysBottom`, viewport height `vh`, small top margin `m`):

- (a) Select the active system forward-only.
- (b) **Snap start = `sysBottom − vh`** — the minimal forward scroll that brings the whole
  system into view, leaving the system sitting at the bottom of the screen. This is the
  left-edge target.
- (c) **Sweep end = `sysTop − m`** — scrolled forward as far as possible (largest `scrollTop`)
  while keeping the system completely visible, leaving the system's top at the screen top. This is the
  right-edge target.
- During the sweep, interpolate `scrollTarget = lerp(sysBottom − vh, sysTop − m, fx)` where
  `fx` is the gaze-x fraction across the music column. So as gaze moves left→right the
  active system travels from the bottom of the screen to the top — then the next system
  becomes active and the cycle repeats.

The same bounded-step, forward-only, clamped `stepController` discipline applies to the
target, so the safety invariant (non-decreasing scrollTop, bounded per-frame delta) is
preserved. `main.js`/`reader.js` fetch systems once per score and thread the active page's
boxes into the controller each frame.

### D5: Fallback selection is per-page and silent
When the active page's system list is empty or the fetch failed, the controller routes the
frame through the existing vertical-gaze follower. No mode toggle in the UI; the decision is
data-driven per page so a mixed score (some pages detectable, some not) degrades smoothly.

### D6: Tuning via the existing store
New params (the sweep-end top margin `m`, snap/interpolation smoothing) join the existing tuning object,
surfaced in `tuning.js` and persisted through `/api/tuning`, so the dev panel updates them
live exactly like today's params.

## Risks / Trade-offs

- **Projection profile fails on curved/skewed staves** → boxes wrong or empty. Mitigation:
  empty-list degradation routes to the vertical-gaze follower; stable-paths escalation is the
  planned next step if La Maja needs it.
- **Mis-paired staves (odd staff, three-staff organ-like layouts)** → wrong system spans.
  Mitigation: spec requires an unpaired staff to surface as a single-staff system rather
  than be dropped/merged; pairing validated on the La Maja golden.
- **Snap/interpolation feels jerky** → poor UX. Mitigation: reuse the bounded-step controller
  so motion stays smooth; expose smoothing as a tuning param.
- **Detection latency on first request** → endpoint slow on cold cache. Mitigation: disk
  cache keyed by mtime; detection is per-page and cheap (one histogram); front-end fetches
  systems for the whole score once, off the render path.
- **Coordinate drift between render and detection** → boxes misregistered. Mitigation:
  detect on the exact cached render and emit in canvas space; golden test asserts box
  positions against a known page.

## Migration Plan

- Additive only: new module, new endpoint, new opt-in scroll path. No schema or render
  changes, no breaking API changes.
- Rollback: the system-aware controller is gated on non-empty systems; disabling the fetch
  (or detection returning empty) reverts every page to the MVP vertical-gaze follower with
  no code removal.

## Open Questions

- Does the projection profile hold on La Maja's pages with unclear inter-system spacing, or
  is stable-paths required for acceptable detection? (Resolve in the detection spike.)
- Binarization threshold: fixed vs. Otsu/adaptive — decide during the spike against real renders.
- Horizontal music-column extent: reuse the gaze `columnX0/columnX1` tuning, or derive it
  per-page from the detected staff extents?
- Top margin `m` for the sweep-end target: fixed px, fraction of viewport, or a tuning param?
- Systems taller than the viewport (rare for solo piano): the fully-visible snap start
  (`sysBottom − vh`) would exceed the top-aligned end (`sysTop − m`) — clamp so the sweep
  degrades to a plain top-align rather than scrolling backward. Confirm on real renders.
