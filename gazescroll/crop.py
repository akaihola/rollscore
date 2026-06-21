"""Per-page geometry: fit a PDF page to the canvas width, and map overlays in.

Display model (v3) — fit the **whole page** width to the canvas width:

  * **Base render**: scale the page by ``fit = 2160 / page_width`` (top-left
    anchored, no zoom, no translate). The full page width maps to the canvas
    width, so on screen the page fits the window width and its height extends
    below — never a zoom-cropped slice. The canvas height is per-page
    (``page_height * fit``), so tall pages aren't bottom-cropped.

  * **Overlay**: forScore's aux annotations are authored in its *cropped/zoomed*
    display space (content scale == manifest ``zoom``; the page is also shifted by
    ``-0.8 * trOffset`` points in both axes — derived by registering against
    forScore's standardized-dimensions export, tests/test_render_golden.py). To
    place them on the un-cropped full page, resample the overlay with the inverse
    of that crop: ``overlay_affine`` gives the PIL AFFINE coefficients mapping a
    full-page canvas pixel back to the overlay pixel (scale by ``zoom``, translate
    by ``-0.8 * trOffset`` px) — see ``gazescroll.render.transform_overlay``.

Earlier models (v1/v2) baked forScore's zoom crop into the base render to mirror
its export 1:1; that magnified the music ~15-25% and dropped the side margins,
which read as "too large" on a wide window. v3 trades that exact-export fidelity
for full-page display while keeping annotations registered via the overlay map.
"""
from __future__ import annotations

import pymupdf

CANVAS_W = 2160                          # standard canvas width (px)
CANVAS_PT = (612.0, 800.0)
CANVAS_PX = (2160, 2824)                 # forScore's standardized export size
PX_PER_PT = CANVAS_PX[0] / CANVAS_PT[0]  # ~3.529

# Empirical translation coefficient: forScore shifts the zoomed page by this
# fraction of -trOffset in both axes (fit to the La Maja export ground truth).
_TROFFSET_COEFF = -0.8


def page_to_canvas_matrix(page_rect: pymupdf.Rect) -> pymupdf.Matrix:
    """Matrix mapping page user-space -> full-page canvas pixels (plain fit).

    The whole page width maps to ``CANVAS_W``, top-left anchored — no zoom and no
    translate, so the full page (margins and all) fits the canvas width.
    """
    fit = CANVAS_W / page_rect.width
    return pymupdf.Matrix(fit, 0.0, 0.0, fit, 0.0, 0.0)


def canvas_size(page_rect: pymupdf.Rect) -> tuple[int, int]:
    """Full-page canvas size for a page: standard width, height scaled by fit."""
    fit = CANVAS_W / page_rect.width
    return (CANVAS_W, round(page_rect.height * fit))


def overlay_affine(page_params: dict) -> tuple[float, float, float, float, float, float]:
    """PIL AFFINE coeffs mapping a full-page canvas pixel -> aux-overlay pixel.

    The overlay lives in forScore's cropped/zoomed space, where a page point ``P``
    sits at ``fit*zoom*P + t`` (``t = -0.8*trOffset`` px); the full-page render
    puts ``P`` at ``fit*P``. So overlay = ``zoom * full-page + t``, which is
    exactly the (output -> input) map PIL's ``Image.transform(AFFINE)`` wants.
    Identity when the page has no crop fields.
    """
    zoom = float(page_params.get("zoom", 1.0))
    troffset = page_params.get("trOffset") or [0.0, 0.0]
    tx = _TROFFSET_COEFF * troffset[0] * PX_PER_PT
    ty = _TROFFSET_COEFF * troffset[1] * PX_PER_PT
    return (zoom, 0.0, tx, 0.0, zoom, ty)
