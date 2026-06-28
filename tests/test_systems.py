"""Detection tests for `rollscore.systems`.

Two layers:

- **Real golden** — the detector is run on actual La Maja pages (public-domain
  Granados *Goyescas* first edition, IMSLP #877498, PDF pp. 39-44), downloaded on
  demand via the `goyescas_pdf` fixture and never committed (memory
  `no-copyrighted-pdfs-in-repo`). Asserts the hand-verified per-page system counts
  + structure (the full validation log is `docs/notes/staff-system-detection-spike.md`).
  Box *pixel* coords are not asserted: this IMSLP scan crops differently from the
  forScore-extracted PDF the spike measured, so heights differ — only counts and
  structure are stable across sources.
- **Synthetic** — for degradation/overlap/single-staff/cache the detector is driven
  with synthetic engraved pages (staff lines → grand staves joined by a barline
  connector, blank band between). Network-free and deterministic. Geometry mirrors
  a real fit-to-width render (~1200 px wide, ~24 px interline, ~3 px lines) so the
  deskew variance-search behaves as on real pages — a toy-scale page collapses
  under the deskew downscale.
"""
import json

import pymupdf
import pytest
from PIL import Image, ImageDraw

from rollscore import systems as systems_mod
from rollscore.ingest import ExtractionRoot
from rollscore.render import render_page_image
from rollscore.systems import detect_cached, detect_systems

from tests.conftest import LA_MAJA_PAGE1

# Hand-verified ground truth (spike): 1-based PDF page → grand-staff system count.
# pp. 39-44 = clean 2-staff pages, 3-staff systems from dense piano texture (p4),
# a mixed 3/3/2/2 page (p5), and a skewed title page (p1).
LA_MAJA_SYSTEM_COUNTS = {39: 4, 40: 5, 41: 5, 42: 4, 43: 4, 44: 5}


# --- Task 4.1: golden boxes on the real La Maja pages -----------------------

@pytest.mark.parametrize("page, expected", sorted(LA_MAJA_SYSTEM_COUNTS.items()))
def test_la_maja_golden_counts(goyescas_pdf, page, expected):
    img = render_page_image(goyescas_pdf, page - 1)
    boxes = detect_systems(img)
    assert len(boxes) == expected
    width, height = img.size
    # Ordered top-to-bottom; each box non-empty, in-bounds, spanning the engraving.
    tops = [b["top"] for b in boxes]
    assert tops == sorted(tops)
    for b in boxes:
        assert 0 <= b["top"] < b["bottom"] <= height
        assert 0 <= b["left"] < b["right"] <= width
        assert b["right"] - b["left"] > 0.6 * width


def test_la_maja_page1_systems_overlap(goyescas_pdf):
    """Page 1's engraver packs systems with a jagged divide, so consecutive boxes
    overlap in y where notes interleave (ground truth: systems 2/3 and 3/4 overlap).
    The detector retains and orders them — never merges or clips on overlap."""
    boxes = detect_systems(render_page_image(goyescas_pdf, LA_MAJA_PAGE1 - 1))
    assert any(
        boxes[i]["bottom"] > boxes[i + 1]["top"] for i in range(len(boxes) - 1)
    )

W = 1200
X0, X1 = 100, 1100
INTERLINE = 24
LINE_W = 3
INTRA = 72  # within-system staff gap: must exceed _STAFF_GAP_RATIO × interline
INTER = 120  # between-system blank gap
TOP = 80
STEM = 36  # note/ledger reach into a gap (small stems → boxes barely touch)


def _staff(draw: ImageDraw.ImageDraw, y_top: int) -> tuple[int, int]:
    ys = [y_top + i * INTERLINE for i in range(5)]
    for y in ys:
        draw.line([(X0, y), (X1, y)], fill=0, width=LINE_W)
    return ys[0], ys[-1]


def _system(draw: ImageDraw.ImageDraw, y_top: int, n_staves: int):
    """Draw an N-staff system; return (top_line, bottom_line, y_cursor)."""
    y = y_top
    bounds = []
    for k in range(n_staves):
        if k:
            y += INTRA
        bounds.append(_staff(draw, y))
        y = bounds[-1][1]
    # Barline connector spanning every staff of the system (the within-system cue).
    draw.line([(X0 + 4, bounds[0][0]), (X0 + 4, bounds[-1][1])], fill=0, width=LINE_W)
    return bounds[0][0], bounds[-1][1], y


def _page(specs, *, marks=None, height=1500):
    """Build a page of systems (`specs` = staves per system). `marks(draw, sb, next_top, i)`
    optionally draws note/ledger ink into the i-th inter-system gap."""
    img = Image.new("L", (W, height), 255)
    draw = ImageDraw.Draw(img)
    y, sysbounds = TOP, []
    for i, n in enumerate(specs):
        st, sb, y = _system(draw, y, n)
        sysbounds.append((st, sb))
        if i < len(specs) - 1:
            if marks:
                marks(draw, sb, sb + INTER, i)
            y = sb + INTER
    return img, sysbounds


# --- Task 4.1: golden boxes for a multi-system page -------------------------

def _small_stems(draw, sb, next_top, i):
    """A note hanging just below one system and rising just above the next,
    leaving a blank band between (boxes barely touch)."""
    draw.line([(200, sb), (200, sb + STEM)], fill=0, width=LINE_W)
    draw.line([(1000, next_top - STEM), (1000, next_top)], fill=0, width=LINE_W)


def test_golden_three_systems():
    img, sysbounds = _page([2, 2, 2], marks=_small_stems)
    boxes = detect_systems(img)

    assert len(boxes) == 3
    # Ordered top-to-bottom, each non-empty, spanning the engraved width.
    tops = [b["top"] for b in boxes]
    assert tops == sorted(tops)
    for b in boxes:
        assert b["top"] < b["bottom"]
        assert b["left"] <= X0 + 6 and b["right"] >= X1 - 6

    # Each box brackets its system's staff span (top above the first line, bottom
    # below the last) within a tolerance bounded by the stem reach.
    for b, (st, sb) in zip(boxes, sysbounds):
        assert st - STEM - 8 <= b["top"] <= st + 3
        assert sb - 3 <= b["bottom"] <= sb + STEM + 8


# --- Task 4.2: degradation, single-staff fallback, overlapping boxes --------

def test_blank_page_returns_empty():
    blank = Image.new("L", (W, 400), 255)
    assert detect_systems(blank) == []


def test_single_staff_fallback():
    img, _ = _page([1])
    boxes = detect_systems(img)
    assert len(boxes) == 1
    assert boxes[0]["top"] < boxes[0]["bottom"]


def _crossing(draw, sb, next_top, i):
    """Interleaved content: one system's note plunges deep on the left while the
    next system's note rises high on the right (different columns) → the jagged
    divide makes the two rectangular boxes overlap in y."""
    draw.line([(200, sb), (200, sb + 90)], fill=0, width=LINE_W)
    draw.line([(1000, next_top - 90), (1000, next_top)], fill=0, width=LINE_W)


def test_overlapping_boxes_retained_and_ordered():
    img, _ = _page([2, 2], marks=_crossing)
    boxes = detect_systems(img)
    assert len(boxes) == 2
    # Both retained, ordered, and vertically overlapping (never merged/clipped).
    assert boxes[0]["top"] < boxes[1]["top"]
    assert boxes[0]["bottom"] > boxes[1]["top"]


# --- Task 4.3: cache hit + mtime invalidation -------------------------------

def _make_root(tmp_path):
    out = tmp_path / "out"
    (out / "pdfs").mkdir(parents=True)
    (out / "aux").mkdir()
    doc = pymupdf.open()
    doc.new_page(width=612, height=792)
    doc.save(out / "pdfs" / "Sonata.pdf")
    doc.close()
    manifest = {"documents": {"Sonata.pdf": {"meta": {}, "pages": {"1": {"zoom": 1.0}}}}}
    (out / "manifest.json").write_text(json.dumps(manifest))
    (out / "setlists.json").write_text("{}")
    return ExtractionRoot(path=out)


def test_detect_cached_hits_and_invalidates(tmp_path, monkeypatch):
    monkeypatch.setenv("ROLLSCORE_CACHE", str(tmp_path / "cache"))
    root = _make_root(tmp_path)

    calls = []
    orig = systems_mod.detect_systems
    monkeypatch.setattr(
        systems_mod, "detect_systems", lambda img: calls.append(1) or orig(img)
    )

    first = detect_cached(root, "Sonata.pdf", page=1)
    assert isinstance(first, list)
    assert len(calls) == 1

    # Same mtime token → cache hit, no re-detection.
    again = detect_cached(root, "Sonata.pdf", page=1)
    assert again == first
    assert len(calls) == 1

    # Touch the manifest → newer mtime_token → fresh namespace → re-detect.
    (root.path / "manifest.json").write_text(
        (root.path / "manifest.json").read_text() + " "
    )
    detect_cached(root, "Sonata.pdf", page=1)
    assert len(calls) == 2
