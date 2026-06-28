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

### D2: Classic projection-profile pipeline — validated, with deskew + connector grouping
**As built and validated on all 6 La Maja pages** (see
`docs/notes/staff-system-detection-spike.md` for the full hypothesis/failure-mode log).
Pipeline: binarize (`gray<160`) → **deskew** → horizontal projection histogram → peak-pick
staff lines (≥`0.6×page-max`) → group five equally-spaced lines into a staff → group
staves into systems **by the barline/brace connector** → emit box vertical span from the
**jagged per-column content divide**, horizontal span = staff-line ink extent. This is the
Audiveris GRID logic minus the engine. **Stable-paths was not needed.**

Two steps proved essential beyond the textbook pipeline:

- **Deskew.** La Maja p1 is tilted ~0.6°, which smears thin staff lines across rows and
  collapses the projection profile (peak coverage 0.39 vs 0.84 on level pages). A
  variance-maximizing angle search (±1.5°, on a downscaled copy) levels the page before
  detection; level pages are left untouched. Without it, p1 detects nothing.

- **System grouping by the connector, NOT by spacing or whitespace.** The projection-profile
  peaks identify staff lines; staves are five equally-spaced peaks. Staves of one system (a
  grand staff) are joined by **vertical barlines spanning the inter-staff gap**; between
  systems that gap is blank. So the system boundary is decided by whether a barline connects
  two staves (max vertical ink-coverage in the gap ≥ 0.8), **not** by inter-staff *spacing*
  (which is non-bimodal on the title page — pairing-by-gap failed there) and **not** by a row
  of blank pixels. This also groups mixed N-staff pages with no per-page threshold (La Maja
  is two-staff on most pages but **three-staff where the piano texture is rich** — pp. 4–5,
  and p5 is a mix of 3- and 2-staff systems; it is *not* a song).

Engravers pack systems tightly with a **jagged divide** to save vertical space, so the tight
rectangular bounding box of system *i* (its lowest content on one side) can overlap in rows
with system *i+1* (its highest content on the other side). The box vertical span therefore
follows the **actual content** via a per-column divide anchored at the blank row nearest the
gap's full-width valley: where a truly blank row separates two systems the boxes barely touch,
where notes interleave the boxes **overlap** (verified on p1: 1/2 separated by 11px, 2/3 and
3/4 overlap by 7–15px). The detector allows consecutive boxes to overlap vertically and never
merges or clips on overlap. Boxes are ordered top-to-bottom by staff-pair center.

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

- (a) Select the active system forward-only. **Because boxes can overlap vertically
  (see D2), vertical containment alone is ambiguous and is not the advance trigger.**
  Advancement from system *i* to *i+1* is driven by the reading saccade: after gaze has
  swept into the right portion of the music column within system *i*, a return to the left
  region (the start of a new line) advances the active system by one. Vertical position is
  used only to keep selection consistent (pick the forward-most system whose span the gaze
  is plausibly in) and never selects an earlier system. This makes selection robust when
  box *i* and box *i+1* share rows.
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

### D7: Debug visualization — shaded active-system rectangle with crossfade
A debug toggle renders the detected system boxes for the current page. The primary visual is
a **faint background shading rectangle behind the active system** (a low-opacity fill, drawn
*behind* the music so it reads as a highlight, not an occlusion), positioned in strip
coordinates using the same `stripWidth / canvasWidth` scaling the controller uses. When the
active system advances (D4), the shading **crossfades**: the old box's rectangle fades out
while the new box's fades in over a short, tunable duration. Because boxes can overlap (D2),
two rectangles being partly visible mid-crossfade is expected and acceptable.

This crossfade is deliberately dual-purpose:
- **Bounding-box indicator** — confirms the detector's box for the active system is placed
  correctly against the rendered music.
- **Gaze-shift detector** — the fade *is* the visible signal that the controller decided the
  gaze moved to the next system (the D4 advance event). If the shading jumps too early/late
  or to the wrong box, the active-system advance logic is wrong — making this the primary
  debugging surface for the overlap-robust selection.

Implementation: a DOM overlay layer over the strip (absolutely-positioned divs, one per
system box) is preferred over canvas drawing — it composites with CSS opacity transitions
for free and needs no per-frame redraw, only a class/opacity change on active-system change.
The toggle is a tuning-panel control (and may also be a keyboard shortcut consistent with the
existing dev toggles); it is off by default and purely diagnostic — it never affects scroll.
When the page is in the vertical-gaze fallback (no systems, D5) there are no boxes to show, so
the overlay is empty.

## Risks / Trade-offs

- **Projection profile fails on curved/skewed staves** → boxes wrong or empty. Mitigation:
  empty-list degradation routes to the vertical-gaze follower; stable-paths escalation is the
  planned next step if La Maja needs it.
- **Mis-paired staves (odd staff, three-staff organ-like layouts)** → wrong system spans.
  Mitigation: spec requires an unpaired staff to surface as a single-staff system rather
  than be dropped/merged; pairing validated on the La Maja golden.
- **Vertically-overlapping boxes confuse active-system tracking** → the controller jumps to
  the wrong system or oscillates between two overlapping boxes. Mitigation: D4 advances on
  the left-edge reading saccade (forward-only), not on vertical containment; the D7
  crossfade makes any mis-selection immediately visible during tuning.
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

**Resolved in the detection spike** (2026-06-28, `docs/notes/staff-system-detection-spike.md`):

- ~~Does the projection profile hold on La Maja's unclear-spacing pages, or is stable-paths
  required?~~ **Resolved:** projection profile + a deskew step + connector-based grouping
  detects all 6 pages correctly. **Stable-paths not needed.**
- ~~Binarization threshold: fixed vs Otsu/adaptive?~~ **Resolved:** fixed `gray < 160`; the
  renders are clean black-on-white, Otsu added nothing.
- ~~Horizontal music-column extent: gaze tuning vs per-page staff extents?~~ **Resolved:**
  derived per-system from the detected staff-line ink extent (`_h_extent`).
- ~~How much do La Maja's boxes actually overlap?~~ **Resolved:** measured — consecutive
  boxes overlap by ~7–69 px where notes interleave and are separated by a few px where a
  blank row exists (p1: 1/2 sep 11px, 2/3 ovl 7px, 3/4 ovl 15px). Overlap is real and handled.

**Still open (frontend, Phase 5–6b):**

- Top margin `m` for the sweep-end target: fixed px, fraction of viewport, or a tuning param?
- Systems taller than the viewport: the snap start (`sysBottom − vh`) can exceed the
  top-aligned end (`sysTop − m`) — clamp to a plain top-align. **Now concretely relevant:**
  La Maja's 3-staff systems (pp. 4–5) are ~500–560 px tall and may exceed a short viewport.
- Is the left-edge-saccade advance rule (D4) sufficient on its own, or is a minimum dwell /
  sweep-progress threshold needed to avoid advancing on stray leftward glances?
- Crossfade duration and shading opacity for the D7 overlay: fixed defaults vs tuning params.

## Future refinement (far future, not in scope)

Boxes currently bound the staffline-anchored content. Stems, beams, slurs, octave brackets
and other markings can point **far** from the system (a long beam group or `8va` line well
above the top staff). A later pass could extend each box to include such connected markings —
e.g. connected-ink analysis attributing a marking to the system its stem roots in — for
tighter framing of extreme cases. Low priority: current boxes already frame the music well
(visually confirmed on all 6 pages) and the scroll logic only needs the system's bulk in view.
