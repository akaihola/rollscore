"""Parse manifest.json + setlists.json into the chooser model.

Setlists (ordered), composer-sorted scores, per-score metadata, and bookmark
ranges for multi-piece PDFs.

forScore stores document filenames as macOS-style NFD (decomposed) Unicode. We
normalize every filename key (score keys, bookmark/setlist `FilePath` refs) to
NFC so lookups with ordinary NFC string literals succeed.
"""
from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf  # PyMuPDF; module also importable as `fitz`

from gazescroll.ingest import ExtractionRoot


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def _pdf_page_count(pdf_path: Path) -> int:
    with pymupdf.open(pdf_path) as doc:
        return doc.page_count


@dataclass(frozen=True)
class Score:
    """A single PDF document with its forScore metadata."""

    filename: str
    title: str
    composer: str
    page_count: int


@dataclass(frozen=True)
class ComposerGroup:
    """Scores by one composer, title-sorted."""

    composer: str
    scores: list[Score]


UNKNOWN_COMPOSER = "(Unknown)"


@dataclass
class Library:
    """The full chooser model: scores keyed by (NFC) filename."""

    scores: dict[str, Score] = field(default_factory=dict)

    def by_composer(self) -> list[ComposerGroup]:
        """Group scores by composer, sorted by composer then title.

        Scores with no composer are grouped under ``(Unknown)``, sorted last.
        """
        groups: dict[str, list[Score]] = {}
        for score in self.scores.values():
            key = score.composer or UNKNOWN_COMPOSER
            groups.setdefault(key, []).append(score)

        def composer_key(name: str) -> tuple[int, str]:
            return (1, "") if name == UNKNOWN_COMPOSER else (0, name)

        return [
            ComposerGroup(
                composer=name,
                scores=sorted(groups[name], key=lambda s: s.title),
            )
            for name in sorted(groups, key=composer_key)
        ]


def load_library(root: ExtractionRoot) -> Library:
    manifest = json.loads(root.manifest_path.read_text())
    documents = manifest.get("documents", {})

    scores: dict[str, Score] = {}
    for raw_name, doc in documents.items():
        filename = _nfc(raw_name)
        meta = doc.get("meta", {})
        pages = doc.get("pages", {})
        pdf_path = root.pdfs_dir / raw_name
        page_count = (
            _pdf_page_count(pdf_path) if pdf_path.exists() else len(pages)
        )
        scores[filename] = Score(
            filename=filename,
            title=meta.get("title", filename),
            composer=meta.get("composer", ""),
            page_count=page_count,
        )

    return Library(scores=scores)
