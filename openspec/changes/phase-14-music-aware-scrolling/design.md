## Context

The MVP renders each page fit-to-width onto a per-page canvas (`gazescroll/render.py`,
`gazescroll/crop.py`) and serves it as a strip of lazily-loaded PNGs (`web/js/reader.js`).
Scrolling is a pure gaze→scroll pipeline (`web/js/gaze/control.js`): smooth gaze-y, gate
on the music column, estimate reading velocity by least-squares slope, and nudge
`scrollTop` toward a setpoint. It is forward-only and clamped, but knows nothing about the
score: on engraved scores with no inter-system gap there are no natural pause points, so
fit is unpredictable and tuning-heavy.

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
- Replace pixel-chasing with system-aware scroll: snap the active system into view on
  left-edge gaze, interpolate scroll across the left→right reading sweep.
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
system boxes plus the gaze sample, computes a target scrollTop by (a) selecting the active
system forward-only, (b) on left-edge entry choosing a snap target = active system top −
setpoint·viewportH, and (c) during the sweep interpolating between the active system's
snap target and the next system's snap target by gaze-x fraction across the music column.
The same bounded-step, forward-only, clamped `stepController` discipline applies to the
target, so the safety invariant (non-decreasing scrollTop, bounded per-frame delta) is
preserved. `main.js`/`reader.js` fetch systems once per score and thread the active page's
boxes into the controller each frame.

### D5: Fallback selection is per-page and silent
When the active page's system list is empty or the fetch failed, the controller routes the
frame through the existing pixel-chasing path. No mode toggle in the UI; the decision is
data-driven per page so a mixed score (some pages detectable, some not) degrades smoothly.

### D6: Tuning via the existing store
New params (`topSetpoint`, snap/interpolation smoothing) join the existing tuning object,
surfaced in `tuning.js` and persisted through `/api/tuning`, so the dev panel updates them
live exactly like today's params.

## Risks / Trade-offs

- **Projection profile fails on curved/skewed staves** → boxes wrong or empty. Mitigation:
  empty-list degradation routes to the MVP fallback; stable-paths escalation is the planned
  next step if La Maja needs it.
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
  (or detection returning empty) reverts every page to the MVP pixel-chasing behavior with
  no code removal.

## Open Questions

- Does the projection profile hold on La Maja's pages with unclear inter-system spacing, or
  is stable-paths required for acceptable detection? (Resolve in the detection spike.)
- Binarization threshold: fixed vs. Otsu/adaptive — decide during the spike against real renders.
- Horizontal music-column extent: reuse the gaze `columnX0/columnX1` tuning, or derive it
  per-page from the detected staff extents?
- Should the interpolation target the *next* system's top (look-ahead) or the *active*
  system's bottom? Validate which feels predictable in user testing.
