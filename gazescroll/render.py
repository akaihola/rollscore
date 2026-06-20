"""Render a PDF page into forScore's standardized canvas and composite overlays.

Each page is rendered through its empirical per-page crop (`gazescroll.crop`)
onto a white CANVAS_PX RGBA canvas, top-left anchored. The aux overlay (when
present) is alpha-composited 1:1. Composited PNGs are cached on disk keyed by
the archive mtime, score, page, and annotation flag.
"""
from __future__ import annotations

from pathlib import Path

import pymupdf
from PIL import Image

from gazescroll.crop import CANVAS_PX, page_to_canvas_matrix


def render_page_image(
    pdf_path: Path, page_index: int, page_params: dict
) -> Image.Image:
    """Render a single PDF page (0-based) onto a white CANVAS_PX RGBA canvas."""
    with pymupdf.open(pdf_path) as doc:
        page = doc[page_index]
        matrix = page_to_canvas_matrix(page_params, page.rect)
        pix = page.get_pixmap(matrix=matrix, alpha=True)
        rendered = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)

    canvas = Image.new("RGBA", CANVAS_PX, (255, 255, 255, 255))
    canvas.alpha_composite(rendered, (0, 0))  # top-left anchored
    return canvas
