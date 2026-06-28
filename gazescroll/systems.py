"""Detect grand-staff systems on a rendered score page.

Classic projection-profile pipeline (validated on La Maja in the Phase 14 spike):
binarize the full-page render → horizontal black-pixel projection → pick staff
lines as near-full-width peaks → group five equally-spaced lines into a staff →
cluster consecutive staves into systems by the *smaller* (intra-system) inter-staff
gap → emit one bounding box per system in full-page canvas coordinates (the same
space `render.page_dimensions` reports).

Systems are grouped by **staff-line structure, not by a horizontal whitespace cut**:
the split between systems is the larger inter-staff gap, found per-page at the
biggest relative jump in the sorted gaps. This adapts per page to N-staff systems:
La Maja is two-staff piano on most pages but grows to three-staff systems where the
piano texture is rich (pages 4-5). It lets consecutive system boxes overlap
vertically when engravers pack systems with a jagged divide — boxes are never
merged or clipped on overlap.

All functions are pure over a PIL image so they unit-test without a server; the
detector never raises — an undetectable page yields an empty list.
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from gazescroll.ingest import ExtractionRoot, _cache_dir
from gazescroll.render import _slug, render_cached

# --- Tuned in the Phase 14 spike (scratchpad/spike2.py over La Maja) ----------
_INK_THRESHOLD = 160        # grayscale < this is ink (clean black-on-white renders)
_LINE_COVERAGE = 0.6        # a staff-line row's ink ≥ this fraction of the page max
_LINE_MERGE_PX = 4          # rows within this distance are one (thick) line
_STAFF_GAP_RATIO = 2.0      # gap > this × interline separates two staves
_MIN_STAFF_LINES = 4        # keep 4-6 line groups as staves; drop text/lyric rows
_MAX_STAFF_LINES = 6
_OUTER_REACH_RATIO = 3.0    # outer box edge grows up to ratio × interline to reach ledger ink
_INK_COL_MIN = 4            # min ink pixels in a column for it to count toward L/R extent
_CONNECTOR_COVERAGE = 0.8   # a between-staff gap with a vertical run ≥ this is within-system
_SKEW_RANGE = 1.5           # search ±this many degrees for page skew
_SKEW_STEP = 0.1            # angle search granularity (deg); grid includes 0.0
_SKEW_MIN_ANGLE = 0.25      # only rotate when skew exceeds this (keep level pages pristine)


def _deskew(image: Image.Image) -> np.ndarray:
    """Grayscale array of ``image`` rotated to level its staff lines.

    A fraction-of-a-degree skew smears each thin staff line across many rows and
    collapses the projection profile (La Maja p1 is tilted ~0.5°). Search a small
    angle range for the rotation that maximizes the *variance* of the projection
    profile — a level page concentrates ink into sharp staff-line peaks (high
    variance); skew spreads it out. The search runs on a downscaled copy for
    speed. A near-level page (best |angle| < `_SKEW_MIN_ANGLE`) is returned
    unrotated so a clean profile is never perturbed by a needless resample.

    When rotation is applied, boxes are emitted in the deskewed frame and used as
    canvas coords. For a sub-degree angle the error is ``tan(angle)·x`` — ≤~12 px
    at the page edge, inside the ledger margin — so the boxes need no inverse map.
    """
    base = image.convert("L")
    small = base.resize((max(1, base.width // 4), max(1, base.height // 4)))
    best_angle, best_var = 0.0, -1.0
    for angle in np.arange(-_SKEW_RANGE, _SKEW_RANGE + 1e-9, _SKEW_STEP):
        rotated = small.rotate(float(angle), resample=Image.Resampling.NEAREST, fillcolor=255)
        prof = (np.asarray(rotated) < _INK_THRESHOLD).sum(axis=1).astype(np.float64)
        variance = float(np.var(prof))
        if variance > best_var:
            best_var, best_angle = variance, float(angle)
    if abs(best_angle) < _SKEW_MIN_ANGLE:  # already level — skip the rotation
        return np.asarray(base, dtype=np.float64)
    leveled = base.rotate(best_angle, resample=Image.Resampling.BILINEAR, fillcolor=255)
    return np.asarray(leveled, dtype=np.float64)


def _staff_line_rows(gray: np.ndarray) -> tuple[list[float], float]:
    """Centers of near-full-width horizontal ink runs (staff-line candidates).

    Threshold is relative to the page's own strongest horizontal feature so an
    indented first system (narrower lines) is still found.
    """
    prof = (gray < _INK_THRESHOLD).sum(axis=1).astype(np.float64)
    if prof.max() == 0:
        return [], 0.0
    rows = np.where(prof >= _LINE_COVERAGE * prof.max())[0]
    lines: list[float] = []
    start = prev = None
    for r in rows:
        if prev is None:
            start = prev = r
        elif r - prev > _LINE_MERGE_PX:
            lines.append((start + prev) / 2)
            start = r
        prev = r
    if prev is not None:
        lines.append((start + prev) / 2)
    return lines, float(prof.max())


def _group_staves(lines: list[float]) -> tuple[list[list[float]], float]:
    """Split line centers into staves wherever a gap exceeds ``2×interline``."""
    gaps = np.diff(np.asarray(lines, dtype=float))
    med = float(np.median(gaps))
    small = gaps[gaps < med]
    interline = float(np.median(small)) if small.size else med
    staves: list[list[float]] = []
    cur = [lines[0]]
    for gap, ln in zip(gaps, lines[1:]):
        if gap > _STAFF_GAP_RATIO * interline:
            staves.append(cur)
            cur = [ln]
        else:
            cur.append(ln)
    staves.append(cur)
    return staves, interline


def _group_systems(staves: list[list[float]], ink: np.ndarray) -> list[list[int]]:
    """Cluster staves into systems by the barline/brace connector between them.

    Staves of one system (a grand staff) are joined by vertical barlines that span
    the inter-staff gap; between two systems that gap is blank. So for each adjacent
    staff pair, scan the columns strictly between them and ask whether any column
    has a near-continuous vertical ink run (a barline) covering ``_CONNECTOR_COVERAGE``
    of the gap band — if so they belong to the same system, else it is a boundary.

    This is the classic Audiveris cue, and it is far more robust than inter-staff
    *spacing*: on a title page the engraver compresses inter-system spacing
    irregularly (La Maja p1's gaps are non-bimodal), but the barline either spans a
    gap or it does not. It also groups mixed N-staff pages (La Maja p5 is 3,3,2,2)
    correctly without any per-page threshold.
    """
    systems: list[list[int]] = [[0]] if staves else []
    for i in range(len(staves) - 1):
        top = int(max(staves[i])) + 3
        bot = int(min(staves[i + 1])) - 3
        if bot - top < 6:  # staves nearly touch → unambiguously one system
            connected = True
        else:
            band = ink[top:bot]
            connected = float((band.sum(axis=0) / band.shape[0]).max()) >= _CONNECTOR_COVERAGE
        if connected:
            systems[-1].append(i + 1)
        else:
            systems.append([i + 1])
    return systems


def _h_extent(ink: np.ndarray, top: int, bottom: int, width: int) -> tuple[int, int]:
    """Left/right ink columns within a row band (the system's engraved width)."""
    band = ink[max(0, top):bottom]
    cols = np.where(band.sum(axis=0) >= _INK_COL_MIN)[0]
    if len(cols) == 0:
        return 0, width
    return int(cols[0]), int(cols[-1]) + 1


def _split_gap(band: np.ndarray) -> tuple[int, int]:
    """Jagged divide of the gap band strictly between two staff groups.

    The divide between two systems is rarely a straight horizontal line — engravers
    let one system's low notes/ledgers sit beside the next system's high notes. So
    split *per column* at the blank row nearest the band's full-width valley (the
    least-ink row). Where the valley is a truly blank row the divide is flat and the
    boxes barely touch; where notes interleave the divide wanders and the resulting
    rectangular boxes overlap. Returns ``(low, high)`` band-relative rows: the
    lowest ink above the divide (the upper system's reach) and the highest ink below
    it (the lower system's reach). ``low > high`` ⇒ the two boxes overlap.
    """
    rows, cols = band.shape
    valley = int(np.argmin(band.sum(axis=1)))
    low, high = 0, rows
    saw_above = saw_below = False
    for x in range(cols):
        ink_rows = np.flatnonzero(band[:, x])
        if ink_rows.size == 0:
            continue
        blanks = np.flatnonzero(~band[:, x])
        divide = int(blanks[np.argmin(np.abs(blanks - valley))]) if blanks.size else valley
        above = ink_rows[ink_rows < divide]
        below = ink_rows[ink_rows > divide]
        if above.size:
            low = max(low, int(above[-1]))
            saw_above = True
        if below.size:
            high = min(high, int(below[0]))
            saw_below = True
    if not saw_above:
        low = valley
    if not saw_below:
        high = valley
    return low, high


def _grow_to_ink(ink: np.ndarray, edge: int, reach: int, down: bool) -> int:
    """Furthest ink row within ``reach`` px of an outer system edge (ledger margin).

    Used only above the first system and below the last — there is no neighbour to
    interleave with, so the box simply grows from the outer staff line to the
    farthest note/ledger ink, capped at ``reach`` so a title or footer is excluded.
    """
    height = ink.shape[0]
    if down:
        band = ink[edge:min(height, edge + reach)]
        rows = np.flatnonzero(band.any(axis=1))
        return edge + int(rows[-1]) if rows.size else edge
    band = ink[max(0, edge - reach):edge]
    rows = np.flatnonzero(band.any(axis=1))
    return max(0, edge - reach) + int(rows[0]) if rows.size else edge


def detect_systems(image: Image.Image) -> list[dict]:
    """Detect grand-staff systems; return ordered boxes in canvas px.

    Each box is ``{top, bottom, left, right}`` (ints, full-page canvas pixels),
    ordered top-to-bottom by staff-pair center. The vertical span follows the
    system's actual content: internal edges come from the jagged per-column divide
    against the neighbour (`_split_gap`), so consecutive boxes **overlap** where the
    music interleaves and barely touch where a blank row separates them — they are
    never merged or clipped. Outer edges grow to the farthest ledger ink within a
    cap (`_grow_to_ink`). Returns ``[]`` (never raises) when staff structure can't
    be recovered: fewer than two staff lines, or no groupable staff.
    """
    gray = _deskew(image)
    height, width = gray.shape
    ink = gray < _INK_THRESHOLD

    lines, _ = _staff_line_rows(gray)
    if len(lines) < 2:
        return []
    staves, interline = _group_staves(lines)
    staves = [s for s in staves if _MIN_STAFF_LINES <= len(s) <= _MAX_STAFF_LINES]
    if not staves:
        return []

    spans = [
        (int(min(ln for i in m for ln in staves[i])), int(max(ln for i in m for ln in staves[i])))
        for m in _group_systems(staves, ink)
    ]
    reach = int(round(_OUTER_REACH_RATIO * interline))
    tops = [a for a, _ in spans]
    bottoms = [b for _, b in spans]
    for i in range(len(spans) - 1):
        gap_top, gap_bottom = spans[i][1], spans[i + 1][0]
        low, high = _split_gap(ink[gap_top:gap_bottom])
        bottoms[i] = gap_top + low
        tops[i + 1] = gap_top + high
    tops[0] = _grow_to_ink(ink, spans[0][0], reach, down=False)
    bottoms[-1] = _grow_to_ink(ink, spans[-1][1], reach, down=True)

    boxes = []
    for top, bottom in zip(tops, bottoms):
        left, right = _h_extent(ink, top, bottom, width)
        boxes.append({"top": top, "bottom": bottom, "left": left, "right": right})
    return boxes


def detect_cached(root: ExtractionRoot, score_file: str, page: int) -> list[dict]:
    """Detect (or reuse cached) systems for a 1-based page.

    Cached under ``{cache}/systems/{mtime_token}/{slug}/{page}.json`` mirroring the
    render cache, so a changed archive (newer mtime) yields a fresh namespace.
    Detection runs on the plain (un-annotated) cached render so ink annotations
    don't perturb the projection profile.
    """
    cache_path = (
        _cache_dir()
        / "systems"
        / root.mtime_token
        / _slug(score_file)
        / f"{page}.json"
    )
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    png = render_cached(root, score_file, page=page, annotated=False)
    with Image.open(png) as img:
        boxes = detect_systems(img)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(boxes))
    return boxes
