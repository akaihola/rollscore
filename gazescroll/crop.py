"""Empirical per-page crop: map a PDF page into forScore's standardized canvas.

Verified facts (docs/feature-coverage.md#overlay-registration):
  * Standardized canvas: 612x800 pt rendered at 2160x2824 px (~3.53 px/pt).
  * The aux overlay is TOP-LEFT anchored, with the per-page `zoom` baked in
    (content scale == manifest `zoom`, measured on all 6 La Maja pages).
  * Horizontal shift tracks ~ -0.8 * trOffset_x on clean pages.

This is the EMPIRICAL v1 model. The closed-form rect/offset/trOffset/zoom
decomposition is deferred (BACKLOG.md). The Phase 13 golden test validates
fidelity; this module is the single place to tune.
"""
from __future__ import annotations

import pymupdf

CANVAS_PT = (612.0, 800.0)
CANVAS_PX = (2160, 2824)
PX_PER_PT = CANVAS_PX[0] / CANVAS_PT[0]  # ~3.529


def page_to_canvas_matrix(page_params: dict, page_rect: pymupdf.Rect) -> pymupdf.Matrix:
    """Return a pymupdf Matrix mapping page user-space -> canvas pixels.

    v1: fit the page width to the canvas width, top-left anchored, then apply
    the per-page `zoom` and an empirical translation from offset/trOffset.
    """
    fit = CANVAS_PX[0] / page_rect.width            # page-width -> canvas-width
    zoom = float(page_params.get("zoom", 1.0))
    scale = fit * zoom
    m = pymupdf.Matrix(scale, scale)

    # Empirical translation (points -> px). offset moves the cropped view;
    # trOffset contributes the measured horizontal ~ -0.8*trOffset_x term.
    offset = page_params.get("offset") or [0.0, 0.0]
    troffset = page_params.get("trOffset") or [0.0, 0.0]
    tx = (offset[0] - 0.8 * troffset[0]) * PX_PER_PT
    ty = offset[1] * PX_PER_PT
    m = m * pymupdf.Matrix(1, 0, 0, 1, tx, ty)
    return m
