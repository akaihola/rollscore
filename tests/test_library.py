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


def test_bookmarks_become_pieces(tmp_path: Path):
    manifest = {"documents": {
        "Etudes.pdf": {
            "meta": {
                "title": "Etudes",
                "composer": "Chopin",
                "bookmarks": [
                    {"Title": "No. 2", "First Page": 4, "Last Page": 6},
                    {"Title": "No. 1", "First Page": 1, "Last Page": 3},
                ],
            },
            "pages": {"1": {}, "2": {}, "3": {}, "4": {}, "5": {}, "6": {}},
        },
        "Plain.pdf": {"meta": {"title": "Plain"}, "pages": {"1": {}}},
    }}
    lib = load_library(_make_root(tmp_path, manifest))
    pieces = lib.scores["Etudes.pdf"].pieces
    assert [(p.title, p.first_page, p.last_page) for p in pieces] == [
        ("No. 1", 1, 3),
        ("No. 2", 4, 6),
    ]
    assert lib.scores["Plain.pdf"].pieces == []


def test_setlists_resolve_to_ordered_scores(tmp_path: Path):
    manifest = {"documents": {
        "a.pdf": {"meta": {"title": "Aria"}, "pages": {"1": {}}},
        "b.pdf": {"meta": {"title": "Berceuse"}, "pages": {"1": {}}},
    }}
    setlists = {"Recital": [
        {"FilePath": "b.pdf", "Title": "Berceuse"},
        {"FilePath": "a.pdf", "Title": "Aria"},
    ]}
    lib = load_library(_make_root(tmp_path, manifest, setlists))
    assert list(lib.setlists) == ["Recital"]
    assert [s.title for s in lib.setlists["Recital"]] == ["Berceuse", "Aria"]
    # entries resolve to the same Score objects held in lib.scores
    assert lib.setlists["Recital"][1] is lib.scores["a.pdf"]


def test_setlists_skip_missing_filepaths(tmp_path: Path):
    manifest = {"documents": {
        "a.pdf": {"meta": {"title": "Aria"}, "pages": {"1": {}}},
    }}
    setlists = {"Recital": [
        {"FilePath": "gone.pdf", "Title": "Missing"},
        {"FilePath": "a.pdf", "Title": "Aria"},
    ]}
    lib = load_library(_make_root(tmp_path, manifest, setlists))
    assert [s.title for s in lib.setlists["Recital"]] == ["Aria"]
