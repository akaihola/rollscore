import pymupdf

from gazescroll.crop import CANVAS_PX, page_to_canvas_matrix


def test_identity_when_no_crop_fields():
    # No zoom/offset → fit page to canvas width, top-left anchored.
    page_rect = pymupdf.Rect(0, 0, 612, 792)
    m = page_to_canvas_matrix({}, page_rect)
    # A page-width point maps to canvas width.
    p = pymupdf.Point(612, 0) * m
    assert round(p.x) == CANVAS_PX[0]
    assert round(p.y) == 0  # top-left anchored


def test_zoom_scales_content():
    page_rect = pymupdf.Rect(0, 0, 612, 792)
    base = page_to_canvas_matrix({}, page_rect)
    zoomed = page_to_canvas_matrix({"zoom": 1.18}, page_rect)
    # Zoom magnifies relative to the no-zoom mapping.
    assert zoomed.a > base.a
