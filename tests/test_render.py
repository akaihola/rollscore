import pymupdf
from PIL import Image

from gazescroll.crop import canvas_size
from gazescroll.render import composite_overlay, render_page_image, transform_overlay


def _one_page_pdf(tmp_path, width=612, height=792):
    doc = pymupdf.open()
    page = doc.new_page(width=width, height=height)
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0, 0, 0))
    path = tmp_path / "x.pdf"
    doc.save(path)
    doc.close()
    return path


def test_render_page_fills_full_page_canvas(tmp_path):
    pdf = _one_page_pdf(tmp_path)
    img = render_page_image(pdf, page_index=0)
    assert isinstance(img, Image.Image)
    assert img.size == canvas_size(pymupdf.Rect(0, 0, 612, 792))
    assert img.mode == "RGBA"


def test_overlay_composited_top_left():
    base = Image.new("RGBA", (2160, 2795), (255, 255, 255, 255))
    overlay = Image.new("RGBA", (2160, 2795), (0, 0, 0, 0))
    overlay.putpixel((10, 10), (255, 0, 0, 255))
    out = composite_overlay(base, overlay)
    assert out.getpixel((10, 10))[:3] == (255, 0, 0)
    assert out.getpixel((500, 500))[:3] == (255, 255, 255)


def test_transform_overlay_unzooms_to_full_page():
    # An annotation authored in the zoomed-crop overlay lands on the same music in
    # the larger full-page render: with zoom 2 and no offset, a block at
    # x,y in 40..59 of the overlay appears at 20..29 in the un-zoomed full page.
    overlay = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    for x in range(40, 60):
        for y in range(40, 60):
            overlay.putpixel((x, y), (255, 0, 0, 255))
    out = transform_overlay(overlay, {"zoom": 2.0}, (100, 100))
    assert out.getpixel((25, 25))[:3] == (255, 0, 0)
    assert out.getpixel((50, 50))[3] == 0  # original (un-zoomed) location is empty
