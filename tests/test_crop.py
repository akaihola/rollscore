import pymupdf

from rollscore.crop import PX_PER_PT, canvas_size, overlay_affine, page_to_canvas_matrix


def test_page_fits_full_width_top_left():
    # The whole page width maps to the canvas width, top-left anchored — no zoom
    # crop. (Display goal: fit the full page width to the window width.)
    page_rect = pymupdf.Rect(0, 0, 612, 792)
    m = page_to_canvas_matrix(page_rect)
    corner = pymupdf.Point(612, 792) * m
    assert round(corner.x) == 2160                          # page width -> canvas
    assert round(corner.y) == round(792 * 2160 / 612)       # same fit on height
    origin = pymupdf.Point(0, 0) * m
    assert (round(origin.x), round(origin.y)) == (0, 0)     # top-left anchored


def test_base_matrix_is_plain_fit_no_zoom_no_translate():
    # forScore's per-page zoom/trOffset are applied only to the overlay (so
    # annotations keep registering); the base page render is always the full page
    # at the plain fit scale.
    m = page_to_canvas_matrix(pymupdf.Rect(0, 0, 612, 792))
    assert m.a == 2160 / 612
    assert m.b == m.c == m.e == m.f == 0


def test_canvas_size_is_per_page_height():
    # Canvas width is the standard 2160; height follows the page aspect at fit, so
    # a tall page is taller than a short one (no fixed-height bottom crop).
    assert canvas_size(pymupdf.Rect(0, 0, 612, 792)) == (2160, round(792 * 2160 / 612))
    assert canvas_size(pymupdf.Rect(0, 0, 612, 396))[1] == round(396 * 2160 / 612)


def test_overlay_affine_unzooms_and_shifts():
    # PIL AFFINE coeffs mapping a full-page-canvas pixel -> the matching pixel in
    # the forScore aux overlay (authored in the cropped/zoomed display space):
    # scale by `zoom`, translate by -0.8 * trOffset (points -> px). Identity with
    # no crop fields.
    assert overlay_affine({}) == (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
    a = overlay_affine({"zoom": 1.18, "trOffset": [79.0, 83.69]})
    assert a[0] == 1.18 and a[4] == 1.18
    assert round(a[2]) == round(-0.8 * 79.0 * PX_PER_PT)
    assert round(a[5]) == round(-0.8 * 83.69 * PX_PER_PT)
