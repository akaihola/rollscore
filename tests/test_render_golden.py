"""Golden registration check: render fidelity vs forScore's own export.

Validates the empirical crop model (``rollscore.crop``) against ground truth —
forScore's *standardized-dimensions annotated export* of ``4 La Maja y el
Ruisenor`` (612x800-pt pages with annotations flattened in). Rendering that
export at the canvas resolution IS forScore's exact display, so a faithful crop
makes our render's dark pixels overlap forScore's.

Opt-in: skips unless the extracted ``out/`` library AND the export PDF are
present. The export is copyrighted (a personal forScore backup), so it lives
outside the repo. Point the test at it with ``ROLLSCORE_LAMAJA_EXPORT`` or drop
it at the default uploads path below.
"""
from __future__ import annotations

import json
import os
import unicodedata
from pathlib import Path

import pymupdf
import pytest
from PIL import Image, ImageChops

from rollscore.crop import overlay_affine
from rollscore.ingest import resolve_source
from rollscore.render import render_cached

OUT = Path(__file__).resolve().parent.parent / "out"
SCORE = "4 La Maja y el Ruisenor.pdf"
_DEFAULT_EXPORT = (
    Path.home()
    / ".claude/uploads/eda0b83c-b3fb-481e-b214-23c91957b38d"
    / "c414ae1b-4_La_Maja_y_el_Ruisenor.pdf"
)


def _export_path() -> Path:
    return Path(os.environ.get("ROLLSCORE_LAMAJA_EXPORT", _DEFAULT_EXPORT))


def _dark_mask(img: Image.Image) -> Image.Image:
    """Binary ('1') mask of dark (ink) pixels."""
    return img.convert("L").point(lambda v: 255 if v < 128 else 0).convert("1")


def _dark_iou(a: Image.Image, b: Image.Image) -> float:
    ma, mb = _dark_mask(a), _dark_mask(b)
    inter = ImageChops.logical_and(ma, mb).histogram()[255]
    union = ImageChops.logical_or(ma, mb).histogram()[255]
    return inter / union if union else 0.0


def _page_params(page: int) -> dict:
    """The forScore zoom/trOffset for a 1-based page, read from the manifest."""
    documents = json.loads((OUT / "manifest.json").read_text())["documents"]
    target = unicodedata.normalize("NFC", SCORE)
    for raw, doc in documents.items():
        if unicodedata.normalize("NFC", raw) == target:
            return doc.get("pages", {}).get(str(page), {})
    return {}


def _export_zoomed(export: pymupdf.Document, page_index: int) -> Image.Image:
    """forScore's standardized export page (612x800 pt) at canvas resolution.

    This is forScore's exact cropped/zoomed *display* — the registration ground
    truth. We compare in this space because the export only contains the cropped
    view (it cannot show the full page), so re-applying the crop to our full-page
    render is the faithful comparison.
    """
    rect = export[page_index].rect
    matrix = pymupdf.Matrix(2160 / rect.width, 2824 / rect.height)
    pix = export[page_index].get_pixmap(matrix=matrix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _recrop_to_export_space(
    rendered: Image.Image, page_params: dict, size: tuple[int, int]
) -> Image.Image:
    """Re-apply forScore's zoom crop to our full-page render -> export space.

    The base render fits the whole page to width; forScore's export is that page
    zoomed by ``zoom`` and shifted by ``-0.8*trOffset`` px. ``overlay_affine``
    gives the (export-pixel -> full-page-pixel) map; we need its inverse to fill
    export space from the full-page render.
    """
    z, _, tx, _, _, ty = overlay_affine(page_params)
    inverse = (1 / z, 0.0, -tx / z, 0.0, 1 / z, -ty / z)
    return rendered.transform(
        size, Image.Transform.AFFINE, inverse, resample=Image.Resampling.BILINEAR
    )


pytestmark = pytest.mark.skipif(
    not (OUT / "manifest.json").exists() or not _export_path().exists(),
    reason="needs extracted out/ and the La Maja forScore export (copyrighted)",
)


@pytest.fixture(autouse=True)
def _temp_cache(tmp_path_factory, monkeypatch):
    """Render into a throwaway cache so the test never touches ~/.cache."""
    monkeypatch.setenv("ROLLSCORE_CACHE", str(tmp_path_factory.mktemp("cache")))


@pytest.mark.parametrize("page", [1, 2, 3, 4, 5, 6])
def test_render_registers_with_forscore_export(page: int) -> None:
    root = resolve_source(OUT)
    rendered = Image.open(render_cached(root, SCORE, page, annotated=True)).convert("RGB")
    with pymupdf.open(_export_path()) as export:
        truth = _export_zoomed(export, page - 1)

    # Re-apply forScore's crop to our full-page render, then compare in forScore's
    # own display space: the page content AND the un-zoomed annotations must land
    # back on forScore's ink. Misregistration (e.g. the old v1 model, which
    # dropped the -0.8*trOffset shift) collapses this well below 0.5; the v3
    # pipeline scores ~0.68-0.96 across the 6 pages.
    recropped = _recrop_to_export_space(rendered, _page_params(page), truth.size)
    iou = _dark_iou(recropped, truth)
    assert iou > 0.55, f"page {page} registration IoU={iou:.3f} too low"
