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


def test_by_composer_sorted_groups(tmp_path: Path):
    manifest = {"documents": {
        "b.pdf": {"meta": {"title": "Zelda", "composer": "Bach"}, "pages": {"1": {}}},
        "a.pdf": {"meta": {"title": "Aria", "composer": "Bach"}, "pages": {"1": {}}},
        "c.pdf": {"meta": {"title": "Clair", "composer": "Debussy"}, "pages": {"1": {}}},
        "n.pdf": {"meta": {"title": "Nameless"}, "pages": {"1": {}}},
    }}
    lib = load_library(_make_root(tmp_path, manifest))
    groups = lib.by_composer()
    assert [g.composer for g in groups] == ["Bach", "Debussy", "(Unknown)"]
    # scores sorted by title within a group
    assert [s.title for s in groups[0].scores] == ["Aria", "Zelda"]
    assert [s.title for s in groups[2].scores] == ["Nameless"]
