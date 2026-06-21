import json
from pathlib import Path

import pytest

from gazescroll.ingest import ExtractionRoot, resolve_source


def test_resolve_prebuilt_out_dir(tmp_path: Path):
    out = tmp_path / "out"
    (out / "pdfs").mkdir(parents=True)
    (out / "manifest.json").write_text(json.dumps({"documents": {}}))
    (out / "setlists.json").write_text(json.dumps({}))

    root = resolve_source(out)
    assert isinstance(root, ExtractionRoot)
    assert root.path == out
    assert root.manifest_path == out / "manifest.json"
    assert root.mtime_token  # non-empty cache key


def test_resolve_rejects_unknown(tmp_path: Path):
    with pytest.raises(ValueError):
        resolve_source(tmp_path / "nope.txt")


def test_extract_4sb_then_reuse(tmp_path: Path, sample_archive: bytes, monkeypatch):
    archive = tmp_path / "Archive test.4sb"
    archive.write_bytes(sample_archive)
    cache = tmp_path / "cache"
    monkeypatch.setenv("GAZESCROLL_CACHE", str(cache))

    root = resolve_source(archive)
    assert root.manifest_path.exists()
    assert (root.pdfs_dir / "Song.pdf").exists()

    # Second call must not re-extract (same archive mtime): reuse marker stable.
    token1 = root.mtime_token
    root2 = resolve_source(archive)
    assert root2.path == root.path
    assert root2.mtime_token == token1
