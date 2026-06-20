import pymupdf
from PIL import Image

from gazescroll.crop import CANVAS_PX
from gazescroll.render import composite_overlay, render_page_image


def _one_page_pdf(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0, 0, 0))
    path = tmp_path / "x.pdf"
    doc.save(path)
    doc.close()
    return path


def test_render_page_to_canvas(tmp_path):
    pdf = _one_page_pdf(tmp_path)
    img = render_page_image(pdf, page_index=0, page_params={})
    assert isinstance(img, Image.Image)
    assert img.size == CANVAS_PX
    assert img.mode == "RGBA"


def test_overlay_composited_top_left():
    base = Image.new("RGBA", CANVAS_PX, (255, 255, 255, 255))
    overlay = Image.new("RGBA", CANVAS_PX, (0, 0, 0, 0))
    overlay.putpixel((10, 10), (255, 0, 0, 255))
    out = composite_overlay(base, overlay)
    assert out.getpixel((10, 10))[:3] == (255, 0, 0)
    assert out.getpixel((500, 500))[:3] == (255, 255, 255)
