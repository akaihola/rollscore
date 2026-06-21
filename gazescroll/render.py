"""Render a PDF page to a full-page canvas and composite overlays.

Each page is fit to the canvas width (`gazescroll.crop`) onto a white per-page
RGBA canvas, top-left anchored — the whole page, never a zoom-cropped slice. The
aux overlay (authored in forScore's cropped/zoomed space) is resampled into that
full-page space (`transform_overlay`) so annotations stay registered, then
alpha-composited. Composited PNGs are cached on disk keyed by the archive mtime,
score, page, and annotation flag.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pymupdf
from PIL import Image

from gazescroll.crop import CANVAS_PT, canvas_size, overlay_affine, page_to_canvas_matrix
from gazescroll.ingest import ExtractionRoot, _cache_dir


def render_page_image(pdf_path: Path, page_index: int) -> Image.Image:
    """Render a single PDF page (0-based) onto a white full-page RGBA canvas.

    The page is fit to the canvas width and pasted top-left; the canvas height
    follows the page aspect, so the whole page is rendered with no zoom crop.
    """
    with pymupdf.open(pdf_path) as doc:
        page = doc[page_index]
        matrix = page_to_canvas_matrix(page.rect)
        size = canvas_size(page.rect)
        pix = page.get_pixmap(matrix=matrix, alpha=True)
        rendered = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)

    canvas = Image.new("RGBA", size, (255, 255, 255, 255))
    _paste_clipped(canvas, rendered, 0, 0)
    return canvas


def transform_overlay(
    overlay: Image.Image, page_params: dict, size: tuple[int, int]
) -> Image.Image:
    """Resample a forScore aux overlay into the full-page render ``size``.

    The overlay is authored in forScore's cropped/zoomed display space; the
    affine from ``crop.overlay_affine`` un-zooms and shifts it so each annotation
    lands on the same music in the full-page render.
    """
    return overlay.transform(
        size,
        Image.Transform.AFFINE,
        overlay_affine(page_params),
        resample=Image.Resampling.BILINEAR,
    )


def _paste_clipped(canvas: Image.Image, src: Image.Image, ox: int, oy: int) -> None:
    """Alpha-composite ``src`` onto ``canvas`` at (ox, oy), clipping overflow.

    Handles a negative origin (crop margin off the top/left) and a source larger
    than the canvas (crop margin off the right/bottom).
    """
    cw, ch = canvas.size
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx0, dy0 = max(0, ox), max(0, oy)
    w = min(src.width - sx0, cw - dx0)
    h = min(src.height - sy0, ch - dy0)
    if w <= 0 or h <= 0:
        return
    region = src.crop((sx0, sy0, sx0 + w, sy0 + h))
    canvas.alpha_composite(region, (dx0, dy0))


def composite_overlay(base: Image.Image, overlay: Image.Image) -> Image.Image:
    """Alpha-composite the `overlay` onto `base` 1:1, top-left anchored.

    The overlay should already match `base` (see `transform_overlay`); the resize
    is a no-op safety net for any that arrive at a different size.
    """
    if overlay.size != base.size:
        overlay = overlay.resize(base.size)
    return Image.alpha_composite(base, overlay)


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def _slug(name: str) -> str:
    """Filesystem-safe single path segment for a score filename."""
    return re.sub(r"[^\w.\- ]", "_", name)


def _resolve_doc(root: ExtractionRoot, score_file: str) -> tuple[str, dict]:
    """Map an NFC score filename to its raw manifest key + document entry.

    Filenames are stored NFD on disk/in the manifest; callers pass NFC.
    """
    manifest = json.loads(root.manifest_path.read_text())
    documents = manifest.get("documents", {})
    target = _nfc(score_file)
    for raw_name, doc in documents.items():
        if _nfc(raw_name) == target:
            return raw_name, doc
    raise KeyError(f"score not in manifest: {score_file!r}")


def render_cached(
    root: ExtractionRoot, score_file: str, page: int, annotated: bool
) -> Path:
    """Render (or reuse a cached) composited PNG for a 1-based page.

    Cached under ``{cache}/render/{mtime_token}/{slug}/{page}-{ann|plain}.png``,
    so a changed archive (newer mtime) yields a fresh cache namespace. The plain
    and annotated variants are distinct files.
    """
    variant = "ann" if annotated else "plain"
    cache_path = (
        _cache_dir()
        / "render"
        / root.mtime_token
        / _slug(score_file)
        / f"{page}-{variant}.png"
    )
    if cache_path.exists():
        return cache_path

    raw_name, doc = _resolve_doc(root, score_file)
    page_params = doc.get("pages", {}).get(str(page), {})
    pdf_path = root.pdfs_dir / raw_name

    image = render_page_image(pdf_path, page_index=page - 1)

    if annotated:
        overlay_path = root.aux_dir / f"{raw_name}|{page}.png"
        if overlay_path.exists():
            with Image.open(overlay_path) as overlay:
                mapped = transform_overlay(
                    overlay.convert("RGBA"), page_params, image.size
                )
            image = composite_overlay(image, mapped)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(cache_path)
    return cache_path


def page_dimensions(root: ExtractionRoot, score_file: str) -> list[dict]:
    """Per-page rendered size — the layout contract the front-end reads.

    Each page is fit to the canvas width, so the width is constant but the height
    follows the page aspect (`crop.canvas_size`). The front-end reserves each
    page's height from these before the image loads.
    """
    raw_name, doc = _resolve_doc(root, score_file)
    pdf_path = root.pdfs_dir / raw_name
    if pdf_path.exists():
        with pymupdf.open(pdf_path) as pdf:
            sizes = [canvas_size(page.rect) for page in pdf]
    else:
        # No PDF on disk (metadata-only): fall back to the standard canvas size.
        sizes = [canvas_size(pymupdf.Rect(0, 0, *CANVAS_PT))] * len(doc.get("pages", {}))
    return [{"width": w, "height": h} for w, h in sizes]
