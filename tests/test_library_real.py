from pathlib import Path

import pytest

from rollscore.ingest import resolve_source
from rollscore.library import load_library

OUT = Path(__file__).resolve().parent.parent / "out"


@pytest.mark.skipif(
    not (OUT / "manifest.json").exists(), reason="no extracted out/"
)
def test_real_library_loads():
    lib = load_library(resolve_source(OUT))
    assert len(lib.scores) == 70
    assert len(lib.setlists) == 3
    # Études, Op. 10.pdf has bookmarks (multi-piece).
    etudes = lib.scores.get("Études, Op. 10.pdf")
    assert etudes is not None and len(etudes.pieces) > 0
