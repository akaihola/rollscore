"""Render a PDF page into forScore's standardized canvas and composite overlays.

Each page is rendered through its empirical per-page crop (`gazescroll.crop`)
onto a white CANVAS_PX RGBA canvas, top-left anchored. The aux overlay (when
present) is alpha-composited 1:1. Composited PNGs are cached on disk keyed by
the archive mtime, score, page, and annotation flag.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pymupdf
from PIL import Image

from gazescroll.crop import CANVAS_PX, page_to_canvas_matrix
from gazescroll.ingest import ExtractionRoot, _cache_dir


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


def composite_overlay(base: Image.Image, overlay: Image.Image) -> Image.Image:
    """Alpha-composite the aux `overlay` onto `base` 1:1, top-left anchored.

    Overlays are authored at CANVAS_PX already; the resize is a no-op safety net
    for any that arrive at a different size.
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

    image = render_page_image(pdf_path, page_index=page - 1, page_params=page_params)

    if annotated:
        overlay_path = root.aux_dir / f"{raw_name}|{page}.png"
        if overlay_path.exists():
            with Image.open(overlay_path) as overlay:
                image = composite_overlay(image, overlay.convert("RGBA"))

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(cache_path)
    return cache_path
