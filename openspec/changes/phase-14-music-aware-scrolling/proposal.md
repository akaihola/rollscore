## Why

The gaze-scroll MVP works end-to-end, but scrolling is driven by raw pixel-chasing
of the gaze cursor with no awareness of the score's musical structure. On engraved
solo-piano scores where systems (grand staves) have no clear horizontal gap, the
controller has no natural pause points: pages don't fit predictably and users report
"a lot of tuning needed." Detecting staff systems gives us musically-coherent
boundaries to snap and interpolate against, replacing fragile pixel heuristics with
structure the reader can actually see.

## What Changes

- Add a backend staff-system detector: for a rendered page, find staff lines via a
  horizontal projection profile, group them into 5-line staves, and pair consecutive
  staves into 2-staff grand-staff systems, emitting a bounding box per system in
  full-page canvas coordinates (the same space `page_dimensions` reports).
- Expose detected systems via a new read endpoint `GET /api/score/{score_file}/systems`,
  cached on disk alongside the rendered PNGs (keyed by archive mtime + score + page).
- Rewrite the front-end gaze→scroll logic to be system-aware: track which system the
  gaze is in, snap the active system into full view when gaze reaches the left edge of
  the music column, and interpolate scroll as gaze sweeps left→right so the next
  system's top reaches the screen-top boundary by the right edge.
- Keep the existing pixel-chasing controller available as a fallback for pages where
  detection fails or returns no systems (graceful degradation, no regression to MVP).
- Add tuning parameters for the system-aware path (snap smoothing, interpolation
  setpoint) surfaced through the existing tuning panel and persisted via `/api/tuning`.

## Capabilities

### New Capabilities
- `staff-system-detection`: Backend detection of grand-staff systems on a rendered
  score page (projection-profile staff-line detection → staff grouping → system
  pairing) and the `/api/score/{score_file}/systems` endpoint that serves the cached
  per-page system bounding boxes.
- `system-aware-scrolling`: Front-end gaze-driven scroll behavior that uses detected
  system boxes to snap the active system into view on left-edge gaze and to interpolate
  scroll across a left→right reading sweep, with fallback to pixel-chasing when no
  systems are available.

### Modified Capabilities
<!-- No existing OpenSpec specs; all behavior here is introduced as new capabilities. -->

## Impact

- **Backend (new)**: `gazescroll/systems.py` (detection), wired into `gazescroll/app.py`
  as a new route; disk cache reusing `ingest._cache_dir()`. Depends on `pymupdf`/`PIL`
  already in use plus `numpy` for the projection histogram.
- **Frontend**: `web/js/gaze/control.js` (new system-aware controller alongside the
  existing pure functions), `web/js/reader.js`/`web/js/main.js` (fetch + thread systems
  into the controller), `web/js/tuning.js` (new params). Existing pixel-chasing functions
  remain as the fallback path.
- **Tests**: new `tests/test_systems.py` (detection + golden boxes on a synthetic/known
  page) and `web/tests/control.test.js` cases for snap/interpolation; existing render,
  API, and control tests must stay green.
- **Test case**: La Maja (all two-staff systems, includes pages with unclear inter-system
  spacing) is the acceptance target.
- **Non-breaking**: new endpoint and opt-in scroll mode; the MVP path is preserved.
