import json

import pymupdf
from PIL import Image

from gazescroll import render as render_mod
from gazescroll.crop import CANVAS_PX
from gazescroll.ingest import ExtractionRoot
from gazescroll.render import render_cached


def _make_root(tmp_path):
    root_dir = tmp_path / "out"
    (root_dir / "pdfs").mkdir(parents=True)
    (root_dir / "aux").mkdir()

    doc = pymupdf.open()
    for _ in range(2):
        page = doc.new_page(width=612, height=792)
        page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0, 0, 0))
    doc.save(root_dir / "pdfs" / "Sonata.pdf")
    doc.close()

    manifest = {
        "documents": {
            "Sonata.pdf": {
                "meta": {},
                "pages": {"1": {"zoom": 1.0}, "2": {"zoom": 1.0}},
            }
        }
    }
    (root_dir / "manifest.json").write_text(json.dumps(manifest))
    (root_dir / "setlists.json").write_text("{}")

    # Page-1 overlay: a single opaque red pixel near the top-left.
    overlay = Image.new("RGBA", CANVAS_PX, (0, 0, 0, 0))
    overlay.putpixel((10, 10), (255, 0, 0, 255))
    overlay.save(root_dir / "aux" / "Sonata.pdf|1.png")

    return ExtractionRoot(path=root_dir)


def test_render_cached_hits_and_variants(tmp_path, monkeypatch):
    monkeypatch.setenv("GAZESCROLL_CACHE", str(tmp_path / "cache"))
    root = _make_root(tmp_path)

    calls = []
    orig = render_mod.render_page_image

    def counting(*a, **k):
        calls.append(1)
        return orig(*a, **k)

    monkeypatch.setattr(render_mod, "render_page_image", counting)

    p1 = render_cached(root, "Sonata.pdf", page=1, annotated=True)
    assert p1.exists()
    assert len(calls) == 1

    # Second call for the same key is a cache hit — no re-render.
    p1_again = render_cached(root, "Sonata.pdf", page=1, annotated=True)
    assert p1_again == p1
    assert len(calls) == 1

    # The plain variant is a distinct file.
    p_plain = render_cached(root, "Sonata.pdf", page=1, annotated=False)
    assert p_plain != p1
    assert p_plain.exists()

    # Annotated has the overlay's red pixel; plain does not.
    assert Image.open(p1).convert("RGBA").getpixel((10, 10))[:3] == (255, 0, 0)
    assert Image.open(p_plain).convert("RGBA").getpixel((10, 10))[:3] != (255, 0, 0)
