---
name: crop-v1-overshoots-canvas
description: "gaze-scroll page render model: v3 (2026-06-21) fits the WHOLE page to width for display and moves zoom/trOffset into the OVERLAY transform; v2 (Phase 13) baked forScore's zoom-crop into the base render. Annotation registration validated by tests/test_render_golden.py"
metadata: 
  node_type: memory
  type: project
  originSessionId: 12e7ea26-d963-4741-bfae-6f9fa28a864d
---

**SUPERSEDED 2026-06-21 → see "v3" below.** The Phase-13 model (v2) baked
forScore's zoom-crop into the base render. That made the displayed page a
magnified middle slice (zoom≈1.1–1.25 → ~15–25% larger, side margins cropped),
which the user reported as "way too large / doesn't fit the window width." The
v2 facts about *forScore's* crop are still correct and now live in the overlay
transform; the base render no longer applies them.

**v3 display model (`gazescroll/crop.py`, 2026-06-21).** Fit the **whole page**
width to the canvas width for display; keep annotations registered by un-zooming
the overlay instead of zoom-cropping the page.
- `page_to_canvas_matrix(page_rect)` = plain `fit = 2160 / page_width`, top-left,
  no zoom, no translate. `canvas_size(page_rect)` = `(2160, round(page_h*fit))`
  — **per-page height** (page_dimensions returns real per-page sizes now; the
  front-end already lays out per-page aspect ratios, so the page fits the window
  width and the height extends below).
- `overlay_affine(page_params)` = `(zoom,0,tx,0,zoom,ty)`, `tx,ty =
  -0.8*trOffset*PX_PER_PT` — the **inverse** of forScore's crop, used by
  `render.transform_overlay` (PIL `Image.transform(AFFINE)`) to resample the aux
  overlay (authored in forScore's zoomed-crop space) onto the full page so
  annotations land on the same music.
- Golden test (`tests/test_render_golden.py`) now validates in **forScore's
  export space**: re-crop our full-page render back (inverse affine) and compare
  to the export — IoU 0.68–0.96 across the 6 La Maja pages. (Comparing in
  full-page space is invalid: the export only contains the cropped view, so it
  cannot recover the full page — that scored ~0.23.)

---

**v2 — RESOLVED 2026-06-20 (Phase 13) [now folded into the overlay transform].**
The reader misregistration/"clipping" was the
backend crop (`gazescroll/crop.py`), confirmed against forScore's own
standardized-dimensions annotated export of `4 La Maja y el Ruisenor` (the ground
truth, kept outside the repo). Registration metric = dark-pixel IoU vs that export.

The faithful model (validated, IoU 0.65–0.999 on all 6 pages):
- **Scale** `fit × zoom`, `fit = 2160 / page_width`. The scale was already correct
  in v1 — content scale == manifest `zoom` (the documented measurement). `zoom > 1`
  makes the page wider than the canvas, so side margins ARE clipped — and that is
  **faithful**: forScore's export clips identically (the old "open question" is
  answered: yes, the margin crop is real, the user zoomed in).
- **Translate** `-0.8 × trOffset × PX_PER_PT` in **both** axes (the vertical term
  ~-236px on p1 was the dominant bug; v1 only had the horizontal term and used
  `offset[1]` for y). `offset` is not needed for registration.
- **Paste at the transformed origin** `page_rect * matrix` with clipping. v1's
  `render.py` pasted at (0,0), which silently discarded the whole translation —
  so even the horizontal term v1 "had" never took effect.

The **`rect`-based crop hypothesis was WRONG** — mapping the manifest `rect` onto
the full canvas scored IoU 0.10 vs the export (it looked plausible only because
the different scale hid loose alignment). Do not pursue rect; it is discarded.
The remaining deferred item is the *general* closed-form decomposition for pages
without `trOffset`/the empirical -0.8 coefficient's origin, but registration works.

See `tests/test_render_golden.py`, [[forscore-open-questions]],
[[gaze-scroll-web-app-design]].
