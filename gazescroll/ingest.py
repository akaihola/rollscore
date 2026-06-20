"""Resolve a data source (.4sb archive or extracted out/ dir) to an ExtractionRoot."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


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
        raise NotImplementedError("4sb extraction lands in Task 2.2")
    raise ValueError(f"unrecognized source: {source}")
