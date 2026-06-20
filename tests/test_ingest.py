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
