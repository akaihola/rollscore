import json
from pathlib import Path

from gazescroll.ingest import ExtractionRoot
from gazescroll.library import load_library


def _make_root(tmp_path, manifest, setlists=None):
    out = tmp_path / "out"
    (out / "pdfs").mkdir(parents=True)
    (out / "manifest.json").write_text(json.dumps(manifest))
    (out / "setlists.json").write_text(json.dumps(setlists or {}))
    return ExtractionRoot(path=out)


def test_scores_have_meta_and_pagecount(tmp_path: Path):
    manifest = {"documents": {
        "Sonata.pdf": {"meta": {"title": "Sonata", "composer": "Beethoven"},
                       "pages": {"1": {}, "2": {}, "3": {}}},
    }}
    lib = load_library(_make_root(tmp_path, manifest))
    score = lib.scores["Sonata.pdf"]
    assert score.title == "Sonata"
    assert score.composer == "Beethoven"
    assert score.page_count == 3
