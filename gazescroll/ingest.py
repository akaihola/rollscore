"""Resolve a data source (.4sb archive or extracted out/ dir) to an ExtractionRoot."""
from __future__ import annotations

import os
import plistlib
from dataclasses import dataclass
from pathlib import Path

import extract_4sb


def _cache_dir() -> Path:
    base = os.environ.get("GAZESCROLL_CACHE")
    return Path(base) if base else Path.home() / ".cache" / "gazescroll"


@dataclass(frozen=True)
class ExtractionRoot:
    """A resolved, extracted library on disk."""

    path: Path

    @property
    def manifest_path(self) -> Path:
        return self.path / "manifest.json"

    @property
    def setlists_path(self) -> Path:
        return self.path / "setlists.json"

    @property
    def pdfs_dir(self) -> Path:
        return self.path / "pdfs"

    @property
    def aux_dir(self) -> Path:
        return self.path / "aux"

    @property
    def mtime_token(self) -> str:
        """Cache key: max mtime of manifest + setlists, as an int-ns string."""
        mtimes = [
            p.stat().st_mtime_ns
            for p in (self.manifest_path, self.setlists_path)
            if p.exists()
        ]
        return str(max(mtimes)) if mtimes else "0"


def resolve_source(source: Path) -> ExtractionRoot:
    """Return an ExtractionRoot for either a pre-extracted dir or a .4sb archive.

    A directory is treated as an existing extraction (must contain manifest.json).
    A `.4sb` file is extracted+cached by `ensure_extracted` (Task 2.2).
    """
    source = Path(source)
    if source.is_dir():
        if not (source / "manifest.json").exists():
            raise ValueError(f"{source} is not an extraction (no manifest.json)")
        return ExtractionRoot(path=source)
    if source.is_file() and source.suffix == ".4sb":
        return ensure_extracted(source)
    raise ValueError(f"unrecognized source: {source}")


def ensure_extracted(archive: Path) -> ExtractionRoot:
    """Extract `archive` into a per-archive cache dir, keyed by archive mtime.

    Re-extracts only when the archive's mtime is newer than the cached marker.
    Reuses the extractor's library functions directly (no subprocess).
    """
    archive = Path(archive)
    key = f"{archive.stem}-{archive.stat().st_size}"
    dest = _cache_dir() / key
    marker = dest / ".archive_mtime"
    cur = str(archive.stat().st_mtime_ns)
    if (
        marker.exists()
        and marker.read_text() == cur
        and (dest / "manifest.json").exists()
    ):
        return ExtractionRoot(path=dest)

    dest.mkdir(parents=True, exist_ok=True)
    blob = archive.read_bytes()
    if not blob.startswith(extract_4sb.MAGIC):
        raise ValueError(f"{archive}: not a 4SBV0x archive")
    manifest_struct = None
    for i, entry in enumerate(extract_4sb.iter_entries(blob)):
        if i == 0:
            manifest_struct = extract_4sb.restructure_manifest(
                plistlib.loads(entry.payload)
            )
        else:
            extract_4sb.write_document(entry.path, entry.payload, dest)
    if manifest_struct is None:
        raise ValueError("no manifest entry in archive")
    extract_4sb.write_outputs(manifest_struct, dest)
    marker.write_text(cur)
    return ExtractionRoot(path=dest)
