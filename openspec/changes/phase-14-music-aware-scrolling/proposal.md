## Why

The gaze-scroll MVP works end-to-end, but scrolling is driven solely by the vertical
direction of the gaze. To the system the page is just an image of known dimensions with
unknown contents: it has no idea where the staff systems sit, so it cannot guarantee that
an entire system stays visible rather than being clipped above or below the screen. The
result is unpredictable framing and "a lot of tuning needed." Detecting system positions
lets the reader keep a whole system in view and advance predictably, system by system.

## What Changes

- Add a backend staff-system detector: for a rendered page, find staff lines via a
  horizontal projection profile, group them into 5-line staves, and pair consecutive
  staves into 2-staff grand-staff systems, emitting a bounding box per system in
  full-page canvas coordinates (the same space `page_dimensions` reports). System boxes
  **may overlap vertically** — engravers pack systems tightly with a jagged (not straight
  horizontal) divide to save vertical space, so consecutive systems' rectangular boxes can
  share rows. Detection must therefore not assume a clean horizontal whitespace gap between
  systems.
- Expose detected systems via a new read endpoint `GET /api/score/{score_file}/systems`,
  cached on disk alongside the rendered PNGs (keyed by archive mtime + score + page).
- Rewrite the front-end gaze→scroll logic to be system-aware: track which system the
  gaze is in, snap the active system fully into view when gaze reaches the left edge of
  the music column, and interpolate scroll as gaze sweeps left→right so the active
  system's top reaches the screen-top boundary by the right edge. Because boxes can
  overlap vertically, active-system **advancement** is driven by the left→right sweep
  completing and gaze saccading back to the left edge (a new reading line), not by
  vertical containment alone — vertical position only disambiguates forward, never
  regressing to an earlier system.
- Add a **debug visualization toggle** for system boxes: render a faint background shading
  rectangle behind the *active* system that crossfades (fade-out the old, fade-in the new)
  whenever the active system advances. This serves a double purpose — it shows the detected
  bounding box and gives visible confirmation that the system detected a gaze shift to the
  next system.
- Keep the existing **vertical-gaze follower** (the current MVP controller, driven only by
  the vertical component of gaze) available as a fallback for pages where detection fails
  or returns no systems (graceful degradation, no regression to MVP).
- Add tuning parameters for the system-aware path (sweep-end top margin, snap/interpolation
  smoothing) surfaced through the existing tuning panel and persisted via `/api/tuning`.

## Capabilities

### New Capabilities
- `staff-system-detection`: Backend detection of grand-staff systems on a rendered
  score page (projection-profile staff-line detection → staff grouping → system
  pairing) and the `/api/score/{score_file}/systems` endpoint that serves the cached
  per-page system bounding boxes.
- `system-aware-scrolling`: Front-end gaze-driven scroll behavior that uses detected
  system boxes to snap the active system into view on left-edge gaze and to interpolate
  scroll across a left→right reading sweep, advancing to the next system on sweep
  completion / left-edge return (robust to vertically-overlapping boxes), with fallback to
  the vertical-gaze follower when no systems are available, plus a debug visualization that
  shades the active system and crossfades on gaze shift.

### Modified Capabilities
<!-- No existing OpenSpec specs; all behavior here is introduced as new capabilities. -->

## Impact

- **Backend (new)**: `gazescroll/systems.py` (detection), wired into `gazescroll/app.py`
  as a new route; disk cache reusing `ingest._cache_dir()`. Depends on `pymupdf`/`PIL`
  already in use plus `numpy` for the projection histogram.
- **Frontend**: `web/js/gaze/control.js` (new system-aware controller alongside the
  existing pure functions), `web/js/reader.js`/`web/js/main.js` (fetch + thread systems
  into the controller, render + crossfade the active-system debug overlay), `web/js/tuning.js`
  (new params + the debug-visualization toggle). The existing vertical-gaze follower
  functions remain as the fallback path.
- **Tests**: new `tests/test_systems.py` (detection + golden boxes on a synthetic/known
  page) and `web/tests/control.test.js` cases for snap/interpolation; existing render,
  API, and control tests must stay green.
- **Test case**: La Maja (all two-staff systems, includes pages with unclear inter-system
  spacing) is the acceptance target.
- **Non-breaking**: new endpoint and opt-in scroll mode; the MVP path is preserved.
