# Gaze-scroll Score Reader — MVP Implementation Plan

> **Migrated to OpenSpec.** The shipped behavior now lives in
> `openspec/specs/{score-rendering,setlist-navigation,reader-controls}/spec.md`
> (gaze-specific capabilities under `openspec/specs/gaze-*` and `system-aware-scrolling`).
> This plan is kept as historical reference.

> **Phase status is tracked in `TASKS.md` at the repo root (on `main`)** — this doc
> defines *what* each phase entails; `TASKS.md` records *which* phase is done. Keep
> the two in sync as phases complete.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each task is TDD (@superpowers:test-driven-development): write the failing test, watch it fail, implement, watch it pass, commit. When a bug or surprise appears, stop and use @superpowers:systematic-debugging. Request review at phase boundaries with @superpowers:requesting-code-review.

**Goal:** A personal, localhost web app that reads your annotated forScore library, renders each score as a continuous cropped+annotated vertical strip, and auto-scrolls it from webcam gaze so you can play hands-free.

**Architecture:** A thin browser front-end (plain ES-module JS, no build step) talks to a small local FastAPI backend over HTTP on localhost. The backend owns archive parsing and rendering (reusing `extract_4sb.py`), lazily renders per-page crop+overlay composites cached as PNGs keyed by archive mtime, and persists resume/tuning/calibration state as JSON. The browser owns the reading surface, a `GazeSource`-abstracted webcam gaze loop (WebGazer.js), and keyboard/tap controls. The gaze controller is a set of **pure functions** unit-tested against synthetic traces.

**Tech Stack:** Python 3.11+, FastAPI + uvicorn, PyMuPDF (`pymupdf`/`fitz`), Pillow, pytest + httpx (backend). Plain JavaScript ES modules + Vitest (front-end). WebGazer.js for the MVP webcam estimator. State as a local JSON file. `uv` for Python deps, `npm` for JS dev tooling.

**Decisions already locked (do not re-litigate — from `docs/plans/2026-06-13-gaze-scroll-web-app-design.md`):** personal localhost tool, no auth/multi-user; backend FastAPI+pymupdf reusing the extractor; lazy server-side crop+overlay render cached by archive mtime, crop empirical per page (closed-form transform deferred to backlog); plain-JS front-end + Vitest; gaze behind `GazeSource`, MVP = WebGazer; vertical-only read-position follower (smooth → on-music gate → reading-velocity → setpoint controller with dead-zone + velocity limit; coast-then-freeze; forward-only, never jump) implemented as pure functions; chooser = setlists + composer-sorted list + bookmark/piece jump + resume; keyboard + invisible tap zones, no on-screen buttons, foot-pedal deferred behind the input abstraction; setlist end = stop and wait; JSON state store.

---

## Conventions

- **Repo layout introduced by this plan:**
  - `gazescroll/` — backend Python package (`ingest.py`, `library.py`, `crop.py`, `render.py`, `state.py`, `app.py`).
  - `web/` — front-end static assets served by FastAPI (`index.html`, `js/`, `vendor/`).
  - `web/js/gaze/control.js` — the pure gaze-control core (the most-tested file).
  - `tests/` — backend pytest tests (extends the existing dir).
  - `web/tests/` — Vitest unit tests for the front-end pure logic.
  - `web/spike/` — the throwaway webcam-accuracy spike (Phase 0).
- **Backend tests are hermetic by default:** build tiny synthetic fixtures (a 2-page PDF made with pymupdf, a synthetic manifest dict, a synthetic RGBA overlay). Tests that need the *real* library read `out/` and **skip** when it is absent (it is gitignored — never commit copyrighted PDFs). Follow the existing `tests/conftest.py` synthetic-archive style.
- **Commit after every green step.** Conventional commit messages. Never commit anything under `out/`, `*.4sb`, or `web/vendor/webgazer.js` if it is large — vendor via a pinned URL fetch documented in the task.
- **Run backend tests:** `uv run pytest` (from repo root). **Run front-end tests:** `cd web && npm test`.
- **Canvas constants (verified in `docs/feature-coverage.md#overlay-registration`):** forScore's standardized display canvas is `612×800 pt` rendered at `2160×2824 px` (≈3.53 px/pt, aspect 0.765); the aux overlay is **top-left anchored** in that canvas with the per-page `zoom` baked in.

---

## Phase 0 — Webcam gaze-accuracy spike (MAKE-OR-BREAK, do this first)

> **Why first:** The design names webcam gaze accuracy the top risk. Before building the app, answer one question: *can a plain laptop webcam drive a comfortable vertical read-position follower?* This phase is a throwaway harness with a hard GO/NO-GO gate. Do not start Phase 1 until you have a verdict.

### Task 0.1: Vendor WebGazer and stand up a static spike page

**Files:**
- Create: `web/vendor/webgazer.js` (fetched, pinned)
- Create: `web/spike/gaze-accuracy.html`
- Create: `web/spike/serve.py` (tiny stdlib http.server wrapper, so the page is same-origin and the webcam permission sticks)

**Step 1: Fetch WebGazer pinned.**

```bash
mkdir -p web/vendor web/spike
# Pin to a specific release commit/tag; record the URL in a comment at top of the file.
curl -L -o web/vendor/webgazer.js https://webgazer.cs.brown.edu/webgazer.js
# Verify it is non-empty JS, not an error page:
head -c 80 web/vendor/webgazer.js
```

Expected: starts with JS (e.g. `(function`/`"use strict"`), file > 100 KB.

**Step 2: Write the spike page** `web/spike/gaze-accuracy.html` — load `../vendor/webgazer.js`, start WebGazer, run a short calibration (9-point click grid), then show a horizontally-full **target band** that descends the screen at a configurable speed while logging, each frame, `{t, targetY, gazeY, confidence}`. Display live: current vertical error (`|gazeY-targetY|` as % of viewport height) and a rolling median. Provide a "download CSV" button.

**Step 3: Serve same-origin.**

```bash
python3 web/spike/serve.py   # serves web/ on http://localhost:8000
```

Open `http://localhost:8000/spike/gaze-accuracy.html` in Chromium, grant camera.

**Step 4: Commit the harness.**

```bash
git add web/vendor/webgazer.js web/spike/
git commit -m "feat(spike): webcam gaze-accuracy harness with WebGazer"
```

### Task 0.2: Run the spike and record a GO/NO-GO verdict

**Step 1: Calibrate** (≈20 s, the 9-point grid) seated at the instrument under normal lighting.

**Step 2: Follow the descending band** through 3–4 passes at reading-ish speeds. Save the CSV.

**Step 3: Compute the gate metrics** from the CSV:
- **Median vertical error** as % of viewport height (after the same median+EMA smoothing the app will use — see Phase 9; you can post-process the CSV with a 5-sample median + `alpha=0.3` EMA).
- **Jitter:** std-dev of smoothed `gazeY` while the eyes are deliberately still.
- **Recovery:** after looking away (hands) and back, how many seconds until error re-settles.

**Step 4: Decide and write it down.** Append a short "Spike result (YYYY-MM-DD)" section to `docs/feature-coverage.md` (or a new `docs/notes/gaze-spike.md`) with the numbers and verdict.

**GO/NO-GO gate (decision, not a unit test):**
- **GO** if smoothed median vertical error ≲ 10–12 % of viewport height and jitter is small enough that heavy smoothing + dead-zone (Phase 9) would not lurch. Proceed to Phase 1.
- **MARGINAL** → still GO, but note that the on-music gate and coast must carry more weight; consider larger smoothing windows as defaults.
- **NO-GO** if error is so large/jittery that even vertical-only following is uncomfortable. **Stop and report** — re-evaluate gaze hardware (MediaPipe Iris spike, or an eye-tracker) before building the full app. The rest of this plan (backend, chooser, render) is still valuable as a manual-scroll reader, so a fallback is: build Phases 1–8 and 11 (manual controls) and defer the gaze loop.

```bash
git add docs/   # the spike-result note
git commit -m "docs(spike): record webcam gaze-accuracy verdict"
```

---

## Phase 1 — Project scaffolding

### Task 1.1: Add backend dependencies and package skeleton

**Files:**
- Modify: `pyproject.toml`
- Create: `gazescroll/__init__.py`

**Step 1: Write a failing import test.** Create `tests/test_scaffold.py`:

```python
def test_package_imports():
    import gazescroll  # noqa: F401
    assert gazescroll.__name__ == "gazescroll"
```

**Step 2: Run it — expect failure.**

```bash
uv run pytest tests/test_scaffold.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'gazescroll'`.

**Step 3: Add deps + package.** Edit `pyproject.toml` to add runtime deps and dev deps:

```toml
[project]
name = "forscore-archive"
version = "0.1.0"
description = "Extract ForScore .4sb Archive files (documents + annotations) on Linux"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "pymupdf>=1.24",
    "pillow>=10",
]

[dependency-groups]
dev = ["pytest>=8", "httpx>=0.27"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
addopts = "-q"
```

Create `gazescroll/__init__.py`:

```python
"""Gaze-scroll score reader — local web app backend.

Reads an extracted forScore library and serves it to a browser front-end that
auto-scrolls each score from webcam gaze. See
docs/plans/2026-06-13-gaze-scroll-web-app-mvp.md.
"""
```

**Step 4: Run the test — expect pass.**

```bash
uv run pytest tests/test_scaffold.py -q
```

Expected: PASS. Also run the full suite to confirm nothing regressed: `uv run pytest` (should still be 21 passed, 1 skipped, +1 new).

> **Note — keep the extractor stdlib-only at runtime.** `extract_4sb.py` declares `dependencies = []` in its PEP-723 header so it still runs standalone via `uv run --script`. Adding deps to `pyproject.toml` does not change that. The backend imports the extractor's *functions*; it does not run it as a script.

**Step 5: Commit.**

```bash
git add pyproject.toml gazescroll/__init__.py tests/test_scaffold.py
git commit -m "chore: add gazescroll package + web-app backend deps"
```

### Task 1.2: Front-end dev tooling (Vitest)

**Files:**
- Create: `web/package.json`
- Create: `web/vitest.config.js`
- Create: `web/tests/smoke.test.js`

**Step 1: Write a failing smoke test.** `web/tests/smoke.test.js`:

```javascript
import { describe, it, expect } from "vitest";

describe("vitest is wired", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 2: Add tooling.** `web/package.json`:

```json
{
  "name": "gazescroll-web",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "jsdom": "^24.0.0"
  }
}
```

`web/vitest.config.js`:

```javascript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",            // pure-logic tests need no DOM
    include: ["tests/**/*.test.js"],
  },
});
```

**Step 3: Install and run — expect pass.**

```bash
cd web && npm install && npm test
```

Expected: 1 test passing. (Run `npm install` via the long-running pattern if it is slow.)

**Step 4: Commit.**

```bash
git add web/package.json web/vitest.config.js web/tests/smoke.test.js web/package-lock.json
git commit -m "chore(web): add Vitest dev tooling"
```

> **`node_modules/` gitignore:** add `web/node_modules/` to `.gitignore` in this task if not already covered.

### Task 1.3: FastAPI app that serves the front-end

**Files:**
- Create: `gazescroll/app.py`
- Create: `web/index.html` (placeholder)
- Create: `tests/test_app_smoke.py`

**Step 1: Failing test.** `tests/test_app_smoke.py`:

```python
from fastapi.testclient import TestClient
from gazescroll.app import create_app


def test_healthz_ok():
    client = TestClient(create_app())
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

**Step 2: Run — expect failure** (`ModuleNotFoundError: gazescroll.app`).

**Step 3: Implement** `gazescroll/app.py`:

```python
"""FastAPI application factory for the gaze-scroll reader."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def create_app() -> FastAPI:
    app = FastAPI(title="gaze-scroll score reader")

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    # Static front-end (js/, vendor/, spike/). Mounted last so API routes win.
    app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")
    return app
```

Create a placeholder `web/index.html` with a `<div id="app"></div>` and a `<script type="module" src="/web/js/main.js">` (main.js arrives in Phase 7).

**Step 4: Run — expect pass.**

```bash
uv run pytest tests/test_app_smoke.py -q
```

**Step 5: Manual smoke** — `uv run uvicorn gazescroll.app:create_app --factory --reload`, open `http://localhost:8000/healthz`.

**Step 6: Commit.**

```bash
git add gazescroll/app.py web/index.html tests/test_app_smoke.py
git commit -m "feat(backend): FastAPI app factory with healthz + static serving"
```

---

## Phase 2 — Ingest layer

> Resolve the data source (a `.4sb` archive **or** a pre-extracted `out/` dir), extract+cache a `.4sb` on first use, and expose the resolved extraction root + an mtime token for cache keying.

### Task 2.1: `resolve_source` — accept a `.4sb` or an `out/` dir

**Files:**
- Create: `gazescroll/ingest.py`
- Create: `tests/test_ingest.py`

**Step 1: Failing test.** `tests/test_ingest.py` (reuses the synthetic-archive helpers from `conftest.py`):

```python
import json
from pathlib import Path

import pytest

from gazescroll.ingest import resolve_source, ExtractionRoot


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
```

**Step 2: Run — expect failure.**

**Step 3: Implement** `gazescroll/ingest.py`:

```python
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
        from gazescroll.ingest import ensure_extracted  # Task 2.2

        return ensure_extracted(source)
    raise ValueError(f"unrecognized source: {source}")
```

**Step 4: Run — expect pass. Step 5: Commit.**

```bash
git commit -am "feat(ingest): resolve_source for pre-extracted out/ dir"
```

### Task 2.2: `ensure_extracted` — extract a `.4sb` to a cache dir, skip if fresh

**Files:**
- Modify: `gazescroll/ingest.py`
- Modify: `tests/test_ingest.py`

**Step 1: Failing test** (uses `sample_archive` fixture from `conftest.py`):

```python
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
```

**Step 2: Run — expect failure.**

**Step 3: Implement** `ensure_extracted` in `gazescroll/ingest.py`. Reuse the extractor's library functions (do **not** shell out):

```python
import os
import plistlib
from gazescroll import _cache_dir  # helper below

import extract_4sb


def _cache_dir() -> Path:
    base = os.environ.get("GAZESCROLL_CACHE")
    return Path(base) if base else Path.home() / ".cache" / "gazescroll"


def ensure_extracted(archive: Path) -> ExtractionRoot:
    """Extract `archive` into a per-archive cache dir, keyed by archive mtime.

    Re-extracts only when the archive's mtime is newer than the cached marker.
    """
    archive = Path(archive)
    key = f"{archive.stem}-{archive.stat().st_size}"
    dest = _cache_dir() / key
    marker = dest / ".archive_mtime"
    cur = str(archive.stat().st_mtime_ns)
    if marker.exists() and marker.read_text() == cur and (dest / "manifest.json").exists():
        return ExtractionRoot(path=dest)

    dest.mkdir(parents=True, exist_ok=True)
    blob = archive.read_bytes()
    if not blob.startswith(extract_4sb.MAGIC):
        raise ValueError(f"{archive}: not a 4SBV0x archive")
    manifest_struct = None
    for i, entry in enumerate(extract_4sb.iter_entries(blob)):
        if i == 0:
            manifest_struct = extract_4sb.restructure_manifest(plistlib.loads(entry.payload))
        else:
            extract_4sb.write_document(entry.path, entry.payload, dest)
    if manifest_struct is None:
        raise ValueError("no manifest entry in archive")
    extract_4sb.write_outputs(manifest_struct, dest)
    marker.write_text(cur)
    return ExtractionRoot(path=dest)
```

Move `_cache_dir` to the top of `ingest.py` (drop the circular self-import; the snippet above shows intent — implement it cleanly as one module).

**Step 4: Run — expect pass.** **Step 5: Commit.**

```bash
git commit -am "feat(ingest): ensure_extracted caches .4sb extraction by mtime"
```

---

## Phase 3 — Library service (chooser model)

> Parse `manifest.json` + `setlists.json` into the chooser model: setlists (ordered), composer-sorted scores, per-score metadata, and bookmark ranges for multi-piece PDFs.

### Task 3.1: Load scores with metadata + page count

**Files:**
- Create: `gazescroll/library.py`
- Create: `tests/test_library.py`

**Step 1: Failing test.** Build a synthetic manifest inline:

```python
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
```

**Step 2: Run — fail. Step 3: Implement** `gazescroll/library.py` with dataclasses `Score`, `Bookmark`, `Setlist`, `Library` and `load_library(root) -> Library`. `page_count` = number of pages in the PDF (read via pymupdf is authoritative; fall back to max manifest page key). For MVP, open the PDF with pymupdf to get the true page count:

```python
import pymupdf  # PyMuPDF; module also importable as `fitz`

def _pdf_page_count(pdf_path: Path) -> int:
    with pymupdf.open(pdf_path) as doc:
        return doc.page_count
```

In tests we have no real PDF, so `load_library` must fall back to manifest page keys when the PDF file is missing (test uses synthetic manifest with no PDF). Implement: `page_count = pdf_page_count if pdf exists else len(manifest pages)`.

**Step 4: pass. Step 5: commit** `feat(library): load scores with metadata + page count`.

### Task 3.2: Composer-sorted grouping

**Step 1: Failing test** — three scores, two composers, assert `library.by_composer()` returns groups sorted by composer name, scores sorted by title within group; missing composer grouped under `"(Unknown)"`.

**Step 2–4:** implement `Library.by_composer() -> list[ComposerGroup]`. **Commit** `feat(library): composer-sorted grouping`.

### Task 3.3: Bookmarks → piece ranges

**Step 1: Failing test** — a doc with `meta.bookmarks` (use the real shape: `Title`, `First Page`, `Last Page`); assert `score.pieces` yields `Bookmark(title, first_page, last_page)` sorted by first page. A doc with no bookmarks → `pieces == []`.

**Step 2–4:** implement. Note the real key spelling is `"First Page"`/`"Last Page"` (see `out/` sample in design research). **Commit** `feat(library): bookmark piece ranges`.

### Task 3.4: Setlists (ordered, resolved to scores)

**Step 1: Failing test** — `setlists.json` with one list `Luen` referencing two `FilePath`s; assert `library.setlists["Luen"]` is an ordered list of `Score` refs, skipping entries whose `FilePath` is absent from `documents` (log, don't crash).

**Step 2–4:** implement. **Commit** `feat(library): ordered setlists resolved to scores`.

### Task 3.5: Real-library smoke (skips without `out/`)

**Step 1:** add `tests/test_library_real.py`:

```python
import pytest
from pathlib import Path
from gazescroll.ingest import resolve_source
from gazescroll.library import load_library

OUT = Path(__file__).resolve().parent.parent / "out"


@pytest.mark.skipif(not (OUT / "manifest.json").exists(), reason="no extracted out/")
def test_real_library_loads():
    lib = load_library(resolve_source(OUT))
    assert len(lib.scores) == 70
    assert len(lib.setlists) == 3
    # Études, Op. 10.pdf has bookmarks (multi-piece).
    etudes = lib.scores.get("Études, Op. 10.pdf")
    assert etudes is not None and len(etudes.pieces) > 0
```

**Step 2:** run (`uv run pytest tests/test_library_real.py -q`) — passes locally against the real `out/`, skips in clean CI. **Commit** `test(library): real-library smoke against out/ (skips if absent)`.

---

## Phase 4 — Render service (crop + overlay composite + cache)

> The load-bearing rendering work. Render each page through its **empirical per-page crop** into the standardized canvas, alpha-composite the aux overlay 1:1 top-left, cache the PNG keyed by archive mtime + score + page + annotation flag.

### Task 4.1: Canvas constants + page→canvas matrix (empirical v1)

**Files:**
- Create: `gazescroll/crop.py`
- Create: `tests/test_crop.py`

**Step 1: Failing test** — test the *implementation* of the v1 transform deterministically (not its fidelity to forScore, which the golden test in Phase 13 checks):

```python
import pymupdf
from gazescroll.crop import CANVAS_PX, CANVAS_PT, page_to_canvas_matrix


def test_identity_when_no_crop_fields():
    # No zoom/offset → fit page to canvas width, top-left anchored.
    page_rect = pymupdf.Rect(0, 0, 612, 792)
    m = page_to_canvas_matrix({}, page_rect)
    # A page-width point maps to canvas width.
    p = pymupdf.Point(612, 0) * m
    assert round(p.x) == CANVAS_PX[0]
    assert round(p.y) == 0  # top-left anchored


def test_zoom_scales_content():
    page_rect = pymupdf.Rect(0, 0, 612, 792)
    base = page_to_canvas_matrix({}, page_rect)
    zoomed = page_to_canvas_matrix({"zoom": 1.18}, page_rect)
    # Zoom magnifies relative to the no-zoom mapping.
    assert zoomed.a > base.a
```

**Step 2: Run — fail. Step 3: Implement** `gazescroll/crop.py`:

```python
"""Empirical per-page crop: map a PDF page into forScore's standardized canvas.

Verified facts (docs/feature-coverage.md#overlay-registration):
  * Standardized canvas: 612x800 pt rendered at 2160x2824 px (~3.53 px/pt).
  * The aux overlay is TOP-LEFT anchored, with the per-page `zoom` baked in
    (content scale == manifest `zoom`, measured on all 6 La Maja pages).
  * Horizontal shift tracks ~ -0.8 * trOffset_x on clean pages.

This is the EMPIRICAL v1 model. The closed-form rect/offset/trOffset/zoom
decomposition is deferred (BACKLOG.md). The Phase 13 golden test validates
fidelity; this module is the single place to tune.
"""
from __future__ import annotations

import pymupdf

CANVAS_PT = (612.0, 800.0)
CANVAS_PX = (2160, 2824)
PX_PER_PT = CANVAS_PX[0] / CANVAS_PT[0]  # ~3.529


def page_to_canvas_matrix(page_params: dict, page_rect: pymupdf.Rect) -> pymupdf.Matrix:
    """Return a pymupdf Matrix mapping page user-space -> canvas pixels.

    v1: fit the page width to the canvas width, top-left anchored, then apply
    the per-page `zoom` and an empirical translation from offset/trOffset.
    """
    fit = CANVAS_PX[0] / page_rect.width            # page-width -> canvas-width
    zoom = float(page_params.get("zoom", 1.0))
    scale = fit * zoom
    m = pymupdf.Matrix(scale, scale)

    # Empirical translation (points -> px). offset moves the cropped view;
    # trOffset contributes the measured horizontal ~ -0.8*trOffset_x term.
    offset = page_params.get("offset") or [0.0, 0.0]
    troffset = page_params.get("trOffset") or [0.0, 0.0]
    tx = (offset[0] - 0.8 * troffset[0]) * PX_PER_PT
    ty = offset[1] * PX_PER_PT
    m = m * pymupdf.Matrix(1, 0, 0, 1, tx, ty)
    return m
```

> The `offset`/`trOffset` are stored as `[[x,y]]`-style geometry by the extractor's `parse_geometry` for `offset`/`trOffset` (they are in `_GEOM_PROPS`). Confirm the parsed shape (a flat `[x, y]` for CGPoint) when wiring real data and index accordingly; the test uses raw dicts.

**Step 4: pass. Step 5: commit** `feat(crop): empirical page-to-canvas matrix (v1)`.

### Task 4.2: Render a cropped page to a Pillow RGBA image

**Files:** Create `gazescroll/render.py`, `tests/test_render.py`.

**Step 1: Failing test** — make a 1-page synthetic PDF with pymupdf, render it, assert the output is a `PIL.Image` of size `CANVAS_PX`, mode `RGBA`:

```python
import pymupdf
from PIL import Image
from gazescroll.crop import CANVAS_PX
from gazescroll.render import render_page_image


def _one_page_pdf(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0, 0, 0))
    path = tmp_path / "x.pdf"
    doc.save(path); doc.close()
    return path


def test_render_page_to_canvas(tmp_path):
    pdf = _one_page_pdf(tmp_path)
    img = render_page_image(pdf, page_index=0, page_params={})
    assert isinstance(img, Image.Image)
    assert img.size == CANVAS_PX
    assert img.mode == "RGBA"
```

**Step 2: fail. Step 3: implement** `render_page_image(pdf_path, page_index, page_params) -> Image.Image`: open page, `pix = page.get_pixmap(matrix=page_to_canvas_matrix(...), alpha=True, clip=...)`, paste onto a white `CANVAS_PX` RGBA canvas at (0,0) (top-left anchor). Convert pixmap → PIL via `Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)`.

**Step 4: pass. Step 5: commit** `feat(render): render cropped page to RGBA canvas`.

### Task 4.3: Composite the aux overlay 1:1 top-left

**Step 1: Failing test** — synthesize an RGBA overlay (a `CANVAS_PX` transparent image with one opaque red pixel at (10,10)), composite it, assert the result has red at (10,10) and the page content elsewhere:

```python
from gazescroll.render import composite_overlay

def test_overlay_composited_top_left(tmp_path):
    base = Image.new("RGBA", CANVAS_PX, (255, 255, 255, 255))
    overlay = Image.new("RGBA", CANVAS_PX, (0, 0, 0, 0))
    overlay.putpixel((10, 10), (255, 0, 0, 255))
    out = composite_overlay(base, overlay)
    assert out.getpixel((10, 10))[:3] == (255, 0, 0)
```

**Step 2–4:** implement `composite_overlay(base, overlay)` = `Image.alpha_composite(base, overlay_resized_to_base)`. If overlay size != base size, resize overlay to `CANVAS_PX` (overlays are 2160×2824 already; resize is a no-op safety net). **Commit** `feat(render): alpha-composite aux overlay 1:1`.

### Task 4.4: Cache composited PNGs keyed by mtime + annotation flag

**Step 1: Failing test** — call `render_cached(root, "Sonata.pdf", page=1, annotated=True)` twice; assert it writes a PNG under the cache dir on the first call and returns the same path (no re-render) on the second. Use file mtime or a render-count monkeypatch to prove the second call is a cache hit. Also assert the **annotated** and **plain** variants are distinct files.

**Step 2–4:** implement `render_cached(root, score_file, page, annotated) -> Path`. Cache path: `{cache}/render/{root.mtime_token}/{slug(score_file)}/{page}-{ann|plain}.png`. The plan picks the **two-cached-variants** option for the annotation toggle (cheaper at serve time than browser compositing; design §4 left the choice to the plan). Plain variant skips `composite_overlay`. **Commit** `feat(render): cache composited page PNGs by mtime + annotation flag`.

> **Overlay lookup:** the aux file is `aux/<score_file>|<page>.png` (e.g. `aux/3 Preludes.pdf|2.png`). Some pages have no overlay → annotated variant == plain render (still cache both keys, or symlink; simplest: render plain and skip composite). Page numbering: forScore pages are **1-based** in manifest/aux; pymupdf `page_index` is **0-based** — convert at the boundary and unit-test the off-by-one.

### Task 4.5: Page dimensions metadata for layout

**Step 1: Failing test** — `page_dimensions(root, score_file)` returns a list of `{width, height}` per page (here always `CANVAS_PX`, but the function is the layout contract the front-end reads). Assert length == page count.

**Step 2–4:** implement (returns `CANVAS_PX` per page for MVP). **Commit** `feat(render): page-dimensions metadata endpoint helper`.

---

## Phase 5 — State store (JSON)

> Persist per-score resume position (last page + scroll offset), tuning parameters, and the session calibration blob to one local JSON file. Single-user, no concurrency.

### Task 5.1: Load/save round-trip with defaults

**Files:** Create `gazescroll/state.py`, `tests/test_state.py`.

**Step 1: Failing test:**

```python
from gazescroll.state import StateStore

def test_resume_roundtrip(tmp_path):
    store = StateStore(tmp_path / "state.json")
    assert store.get_resume("Sonata.pdf") is None
    store.set_resume("Sonata.pdf", page=4, scroll=1234.5)
    # New instance reads from disk.
    store2 = StateStore(tmp_path / "state.json")
    r = store2.get_resume("Sonata.pdf")
    assert r == {"page": 4, "scroll": 1234.5}

def test_tuning_defaults_and_override(tmp_path):
    store = StateStore(tmp_path / "state.json")
    t = store.get_tuning()
    assert t["setpoint"] == 0.4          # default
    store.set_tuning({"setpoint": 0.35})
    assert store.get_tuning()["setpoint"] == 0.35
    assert store.get_tuning()["deadzone"] > 0  # untouched default preserved
```

**Step 2: fail. Step 3: implement** `StateStore`: atomic write (write tmp + `os.replace`), tuning defaults dict (`setpoint=0.4`, `deadzone`, `coastMs`, `maxVelocity`, `medianWindow`, `alpha`, `columnX0`, `columnX1`, `minConfidence` — the Phase 9 params), `get/set_resume`, `get/set_tuning`, `get/set_calibration`. Tolerate a missing/corrupt file by starting empty.

**Step 4: pass. Step 5: commit** `feat(state): JSON state store (resume/tuning/calibration)`.

---

## Phase 6 — FastAPI routes

> Wire ingest + library + render + state behind HTTP. App is constructed with a resolved `ExtractionRoot` and a `StateStore` (from env/CLI).

### Task 6.1: App accepts a source + state path

**Step 1: Failing test** — `create_app(source=out_dir, state_path=tmp/state.json)` and `GET /api/library` returns `{scores, setlists, composers}` JSON for a synthetic `out/`.

**Step 2–4:** extend `create_app` to take `source`/`state_path` (default from env `GAZESCROLL_SOURCE`/`GAZESCROLL_STATE`), build `Library` once at startup, store on `app.state`. Implement `GET /api/library`. **Commit** `feat(api): /api/library chooser model`.

### Task 6.2: Page image endpoint (lazy render + cache)

**Step 1: Failing test** — `GET /api/score/{score_file}/page/{n}.png?annotated=1` returns `200`, `content-type: image/png`, and bytes that PIL can open to `CANVAS_PX`. Use a synthetic 1-page PDF placed in `out/pdfs/`.

**Step 2–4:** implement; lazily call `render_cached` and `FileResponse` the PNG. URL-encode the score file (it contains spaces/pipes). Add `GET /api/score/{score_file}/pages` → dimensions list. **Commit** `feat(api): lazy page-image + page-dimensions endpoints`.

### Task 6.3: Resume + tuning endpoints

**Step 1: Failing tests** — `GET/PUT /api/score/{file}/resume` round-trips `{page, scroll}`; `GET/PUT /api/tuning` round-trips params.

**Step 2–4:** implement against `StateStore`. **Commit** `feat(api): resume + tuning state endpoints`.

---

## Phase 7 — Front-end: API client + chooser view

### Task 7.1: API client module

**Files:** Create `web/js/api.js`, `web/tests/api.test.js`.

**Step 1: Failing test** — mock `fetch` (Vitest `vi.fn`), assert `getLibrary()` calls `/api/library` and returns parsed JSON; `pageUrl(file, n, annotated)` builds the correct **URL-encoded** path.

**Step 2–4:** implement thin wrappers (`getLibrary`, `pageUrl`, `getResume`, `putResume`, `getTuning`, `putTuning`). Keep DOM-free so it tests in `node` env. **Commit** `feat(web): API client module`.

### Task 7.2: Chooser render (pure DOM-building function)

**Files:** Create `web/js/chooser.js`, `web/tests/chooser.test.js` (set Vitest `environment: "jsdom"` for this file via a `// @vitest-environment jsdom` comment).

**Step 1: Failing test** — `buildChooser(libraryModel)` returns a DOM node containing a setlists section (one `<details>`/list per setlist, ordered) and a composer-sorted section; a multi-piece score exposes its pieces; clicking a piece fires an `onOpen({file, page})` callback.

**Step 2–4:** implement `buildChooser(model, handlers)` as a pure function returning an element (no global state). **Commit** `feat(web): chooser view DOM builder`.

### Task 7.3: Wire chooser into `main.js`

**Files:** Create `web/js/main.js`. Bootstrap: fetch library, render chooser into `#app`, route "open" → reader (Phase 8). **Manual smoke** in the browser. **Commit** `feat(web): bootstrap chooser in main.js`.

---

## Phase 8 — Front-end: reader view (scroll strip + lazy load + resume)

### Task 8.1: Build the vertical page-strip with lazy loading

**Files:** Create `web/js/reader.js`, `web/tests/reader.test.js` (jsdom).

**Step 1: Failing test** — `buildStrip({file, pageDims})` returns a container whose total height == sum of scaled page heights at a given strip width, and creates one `<img>` placeholder per page with `loading="lazy"` and the correct `pageUrl`. Assert page count and that `src` is set lazily (e.g. via `data-src` swapped by an IntersectionObserver shim, or assert `loading="lazy"` + correct `src`).

**Step 2–4:** implement. Strip width = container width; each page scaled to that width preserving `CANVAS_PX` aspect. **Commit** `feat(web): reader page-strip with lazy images`.

### Task 8.2: Resume position (scroll restore + throttled save)

**Step 1: Failing test** — pure helper `computeResumeScroll(pageDims, stripWidth, {page, scroll})` returns the pixel `scrollTop` for a saved `{page, scroll}`; and `throttle(fn, ms)` invokes at most once per window (fake timers).

**Step 2–4:** implement; on open, set `scrollTop` from resume; on scroll, throttled `putResume`. On unload, flush. **Commit** `feat(web): reader resume restore + throttled save`.

### Task 8.3: Piece jump + annotation toggle

**Step 1: Failing test** — `pageToScroll(pageDims, stripWidth, pageNumber)` maps a 1-based page to its strip offset (for bookmark jump); annotation toggle swaps `img.src` between `?annotated=1` and `?annotated=0` for all pages.

**Step 2–4:** implement; keyboard handler wiring deferred to Phase 11. **Commit** `feat(web): piece jump + annotation toggle`.

---

## Phase 9 — Gaze control pure functions (the unit-tested core)

> The heart of the experiment. **All control logic is pure** and unit-tested against synthetic gaze traces — no camera. This phase has the densest tests.

### Task 9.1: Smoothing (median window + EMA)

**Files:** Create `web/js/gaze/control.js`, `web/tests/control.test.js`.

**Step 1: Failing tests:**

```javascript
import { describe, it, expect } from "vitest";
import { createSmoother } from "../js/gaze/control.js";

describe("smoother", () => {
  it("rejects a single-frame spike via median window", () => {
    const s = createSmoother({ medianWindow: 5, alpha: 1 }); // alpha=1 → pure median
    [100, 100, 100, 100, 100].forEach((y) => s.push(y));
    const before = s.value();
    s.push(9999);                 // spike
    expect(Math.abs(s.value() - before)).toBeLessThan(5);
  });

  it("EMA lags toward a step change", () => {
    const s = createSmoother({ medianWindow: 1, alpha: 0.3 });
    s.push(0);
    s.push(100);
    expect(s.value()).toBeGreaterThan(0);
    expect(s.value()).toBeLessThan(100);
  });
});
```

**Step 2: fail. Step 3: implement** `createSmoother({medianWindow, alpha})` → `{push(y), value()}`: keep a ring buffer of the last `medianWindow` samples, take the median, then EMA: `ema = alpha*median + (1-alpha)*ema`.

**Step 4: pass. Step 5: commit** `feat(gaze): smoothing (median + EMA)`.

### Task 9.2: On-music gate

**Step 1: Failing tests** — `isReading(sample, params)`:
- high confidence + `x` inside `[columnX0, columnX1]` → `true`.
- low confidence → `false`.
- `x` outside the music column (hands/keyboard) → `false`.

**Step 2–4:** implement pure `isReading({x, confidence}, {columnX0, columnX1, minConfidence})`. **Commit** `feat(gaze): on-music gate`.

### Task 9.3: Reading-velocity estimator

**Step 1: Failing tests** — `estimateReadingVelocity(samples, {maxVelocity})` where `samples` is a short history of `{t, y}`:
- steadily increasing `y` (reading down the page) → positive velocity ≈ slope.
- velocity is **clamped** to `[0, maxVelocity]` (no negative, no runaway).
- noisy flat trace → velocity ≈ 0 (within tolerance).

**Step 2–4:** implement least-squares (or robust) slope of `y` vs `t`, clamp to `[0, maxVelocity]`. **Commit** `feat(gaze): reading-velocity estimator`.

### Task 9.4: Scroll controller (setpoint + dead-zone + velocity limit)

**Step 1: Failing tests** — `stepController(state, input)` where `input = {smoothedY, reading, readingVelocity, viewportH, scrollTop, contentH, dtMs, params}` and `params` has `setpoint`(0.4), `deadzone`(px), `maxStepPerFrame`(px), `coastMs`:

```javascript
// reading, gaze below setpoint → scroll forward, bounded
it("scrolls forward when reading point is below setpoint", () => {
  const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 800 };
  const out = stepController({}, {
    smoothedY: 600, reading: true, readingVelocity: 50,
    viewportH: 1000, scrollTop: 0, contentH: 10000, dtMs: 33, params,
  });
  expect(out.scrollTop).toBeGreaterThan(0);
  expect(out.scrollTop).toBeLessThanOrEqual(8); // velocity-limited, no jump
});

it("does nothing inside the dead-zone", () => {
  const params = { setpoint: 0.4, deadzone: 50, maxStepPerFrame: 8, coastMs: 800 };
  const out = stepController({}, {
    smoothedY: 410, reading: true, readingVelocity: 0,
    viewportH: 1000, scrollTop: 100, contentH: 10000, dtMs: 33, params,
  });
  expect(out.scrollTop).toBe(100);
});

it("never scrolls backward", () => {
  const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 800 };
  const out = stepController({}, {
    smoothedY: 100, reading: true, readingVelocity: 0, // gaze above setpoint
    viewportH: 1000, scrollTop: 500, contentH: 10000, dtMs: 33, params,
  });
  expect(out.scrollTop).toBe(500); // forward-only clamp
});

it("coasts when not reading, then freezes", () => {
  const params = { setpoint: 0.4, deadzone: 10, maxStepPerFrame: 8, coastMs: 100 };
  let st = { lastVelocity: 60 };
  let out = stepController(st, {
    smoothedY: 600, reading: false, readingVelocity: 0,
    viewportH: 1000, scrollTop: 0, contentH: 10000, dtMs: 50, params,
  });
  expect(out.scrollTop).toBeGreaterThan(0);   // still coasting at 50ms
  out = stepController(out.state, { ...{
    smoothedY: 600, reading: false, readingVelocity: 0,
    viewportH: 1000, scrollTop: out.scrollTop, contentH: 10000, dtMs: 100, params,
  } });
  const frozen = stepController(out.state, {
    smoothedY: 600, reading: false, readingVelocity: 0,
    viewportH: 1000, scrollTop: out.scrollTop, contentH: 10000, dtMs: 100, params,
  });
  expect(frozen.scrollTop).toBe(out.scrollTop); // past coast window → frozen
});

it("never exceeds content height", () => {
  const params = { setpoint: 0.4, deadzone: 1, maxStepPerFrame: 1000, coastMs: 800 };
  const out = stepController({}, {
    smoothedY: 999, reading: true, readingVelocity: 9999,
    viewportH: 1000, scrollTop: 9500, contentH: 10000, dtMs: 33, params,
  });
  expect(out.scrollTop).toBeLessThanOrEqual(10000 - 1000);
});
```

**Step 2: fail. Step 3: implement** `stepController(state, input)`:
- setpoint pixel = `viewportH * setpoint`; error = `smoothedY - setpointPx`.
- if `reading`: if `|error| <= deadzone` → no move; else desired step toward closing error, magnitude bounded by `min(maxStepPerFrame, readingVelocity*dt-derived, |error|)`; **clamp ≥ 0** (forward-only). Track `lastVelocity` and `coastRemainingMs = coastMs`.
- if `not reading`: decay `coastRemainingMs -= dtMs`; while `> 0`, step `lastVelocity * dt` (decaying), forward-only; at `<= 0`, freeze (no move).
- always clamp final `scrollTop` to `[0, contentH - viewportH]`.
- return `{scrollTop, state}` with updated `lastVelocity`, `coastRemainingMs`.

**Step 4: pass. Step 5: commit** `feat(gaze): scroll controller (setpoint, dead-zone, coast, forward-only)`.

### Task 9.5: Compose the pipeline + a synthetic end-to-end trace test

**Step 1: Failing test** — `createGazeController(params)` exposing `update(sample, view) -> scrollTop`. Feed a **synthetic descending-reading trace** (y climbs from 300→700 over many frames, high confidence, x in column): assert `scrollTop` increases monotonically and total scroll is within a sane band. Feed a **glance-away trace** (confidence drops mid-way): assert it coasts then freezes, never jumps.

**Step 2–4:** implement the composition (smoother → gate → velocity → controller). **Commit** `feat(gaze): compose smoothing→gate→velocity→controller pipeline`.

> **Hard safety invariant (assert in tests):** across every trace, `scrollTop` is non-decreasing and each frame's delta ≤ `maxStepPerFrame`. Encode this as a property-style test iterating random traces with a seeded PRNG.

---

## Phase 10 — GazeSource abstraction + WebGazer + calibration

### Task 10.1: `GazeSource` interface + a scripted fake source

**Files:** Create `web/js/gaze/source.js`, `web/tests/source.test.js`.

**Step 1: Failing test** — a `ScriptedGazeSource(samples)` implements the interface: `start()`, `stop()`, `onSample(cb)`; feeding it drives `cb` with each `{x, y, confidence, t}`. This fake is what the controller tests and manual demos use without a camera.

**Step 2–4:** define the interface (JSDoc `@typedef GazeSource`) + `ScriptedGazeSource`. **Commit** `feat(gaze): GazeSource interface + scripted fake source`.

### Task 10.2: WebGazer-backed source

**Files:** Create `web/js/gaze/webgazer-source.js`. (No unit test — exercised manually; keep it a thin adapter so logic stays in `control.js`.)

**Step 1:** implement `WebGazerGazeSource` wrapping `web/vendor/webgazer.js`: `start()` calls `webgazer.setGazeListener((data, t) => cb({x: data.x, y: data.y, confidence: ..., t}))`; map WebGazer's signal to a `[0,1]` confidence (it has no native confidence — derive from prediction stability or set constant and rely on the on-music gate + smoothing). `stop()` ends and clears.

**Step 2: Manual smoke** in the reader. **Step 3: Commit** `feat(gaze): WebGazer-backed GazeSource`.

### Task 10.3: Calibration UI + recenter

**Files:** Create `web/js/gaze/calibration.js`.

**Step 1:** implement a calibration overlay (the 9-point click grid, ≈20 s) feeding WebGazer's regression; persist the resulting blob via `PUT /api/calibration` (add the endpoint mirroring tuning in Phase 5/6 if not present). **Recenter:** a one-key action that re-anchors vertical drift (store a vertical offset added to subsequent `gazeY`). Unit-test only the pure **recenter-offset** math (`applyRecenter(y, offset)`); the UI is manual.

**Step 2–4:** implement + test the pure bit. **Commit** `feat(gaze): calibration overlay + recenter offset`.

---

## Phase 11 — Wire gaze loop + controls into the reader

### Task 11.1: Controls module (keyboard + invisible tap zones)

**Files:** Create `web/js/controls.js`, `web/tests/controls.test.js` (jsdom).

**Step 1: Failing test** — `bindControls(el, handlers)`:
- keydown `Space` → `handlers.togglePause`; `r` → `recenter`; `ArrowUp/Down` → `nudge(±)`; `[`/`]` or `PageUp/Down` → prev/next piece; `Escape` → `backToChooser`; `a` → `toggleAnnotations`; `c` → `startCalibration`.
- a click in the **center third** → `togglePause`; **top edge** → `nudge(-)`; **bottom edge** → `nudge(+)`; a **corner** → `recenter`. Assert via synthetic events with element bounds (mock `getBoundingClientRect`).

**Step 2–4:** implement pure-ish `bindControls` (returns an unbind fn). Keep the **input abstraction** so a foot pedal can later dispatch the same handler names. **Commit** `feat(web): keyboard + invisible tap-zone controls`.

### Task 11.2: Run the gaze loop against the reader's scroll container

**Files:** Modify `web/js/reader.js`.

**Step 1:** drive the loop: `requestAnimationFrame` → read latest gaze sample → `controller.update(sample, {viewportH, scrollTop, contentH})` → set `scrollContainer.scrollTop`. **Manual input preempts:** any keyboard/tap pauses gaze (sets a `paused` flag the loop checks); resume re-enables. Use the `ScriptedGazeSource` in a dev mode (`?fakegaze=1`) to demo without a camera.

**Step 2: Manual smoke** with `?fakegaze=1` (deterministic), then with WebGazer. **Step 3: Commit** `feat(web): gaze loop drives reader scroll; manual input preempts`.

### Task 11.3: Setlist context — stop and wait at end

**Step 1: Failing test** (jsdom or pure) — when a score opened from a setlist reaches its end, `onScoreEnd(context)` does **not** auto-advance; it surfaces a "setlist: next is X" affordance and waits for an explicit next-piece control.

**Step 2–4:** implement. **Commit** `feat(web): setlist end stops and waits (no auto-advance)`.

---

## Phase 12 — Dev tuning panel

### Task 12.1: Live-tunable params bound to the controller + persisted

**Files:** Create `web/js/tuning.js`.

**Step 1: Failing test** — `buildTuningPanel(params, onChange)` (jsdom) renders a slider per param (`setpoint`, `deadzone`, `coastMs`, `maxVelocity`/`maxStepPerFrame`, `medianWindow`, `alpha`, `columnX0/1`, `minConfidence`); moving a slider calls `onChange(key, value)`.

**Step 2–4:** implement; wire so changes update the live controller immediately and `PUT /api/tuning` (throttled) persists them. Toggle the panel with a key (e.g. `t`). **Commit** `feat(web): dev tuning panel bound to live controller + persisted`.

---

## Phase 13 — Acceptance: golden registration + end-to-end manual

### Task 13.1: Golden-image registration check (opt-in, real asset)

> Validates the **fidelity** of the empirical crop (Phase 4) against forScore ground truth — the registration question the research left "empirical per page." Uses `4 La Maja y el Ruisenor` (the established ground truth). Skips when the asset is absent (copyrighted — not in repo).

**Files:** Create `tests/test_render_golden.py`.

**Step 1:** write a test that, when `out/pdfs/4 La Maja y el Ruisenor.pdf` and its aux overlay exist, renders page 1 annotated and compares against a checked-in-locally golden (generated once from the forScore export, stored **outside** the repo under the cache or a gitignored `tests/golden/`). Compare with a tolerance (e.g. mean abs pixel diff < threshold, or annotation-bbox IoU > 0.9). `@pytest.mark.skipif` when assets are missing.

**Step 2:** run locally. If it fails, that is the **empirical-tuning loop**: adjust `page_to_canvas_matrix` (Task 4.1) — `offset`/`trOffset` coefficients — re-run until annotations land. Document the final coefficients in `crop.py`. (Use @superpowers:systematic-debugging if registration is badly off.)

**Step 3: Commit** `test(render): golden registration check vs forScore export (skips without asset)`.

### Task 13.2: End-to-end manual acceptance

**Step 1:** Launch `uv run uvicorn gazescroll.app:create_app --factory` with `GAZESCROLL_SOURCE=out`. In Chromium: open chooser → pick a setlist score → reader renders the cropped+annotated strip → calibrate (≈20 s) → play a piece end-to-end while gaze keeps pace → exercise pause/recenter/nudge/annotation-toggle/piece-jump → close and reopen (resume restores position).

**Step 2:** Tune via the dev panel; record good defaults into the state file / `StateStore` defaults.

**Step 3:** Write a short "MVP acceptance (YYYY-MM-DD)" note (what worked, what to tune next) and update `BACKLOG.md`: check off the web-app item's MVP, leave deferred items (closed-form crop transform, foot pedal, search/metadata filtering, setlist auto-advance, smarter calibration).

**Step 4: Commit** `docs: record gaze-scroll MVP acceptance + backlog update`.

---

## Test inventory (what proves the MVP works)

- **Backend (pytest, hermetic):** package import; FastAPI healthz + static; ingest of `out/` and `.4sb` (+ cache reuse); library model (meta, page count, composer grouping, bookmark ranges, ordered setlists); crop matrix v1; render to canvas; overlay composite; render caching + annotation variants + page numbering off-by-one; page dimensions; state round-trip + tuning defaults; all API endpoints.
- **Backend (pytest, real `out/`, skips if absent):** 70 scores / 3 setlists / Études bookmarks; golden registration vs forScore export.
- **Front-end (Vitest, hermetic):** API client URLs; chooser DOM; reader strip + lazy load + resume math + piece jump + annotation toggle; **gaze control core** (smoother, gate, velocity, controller, pipeline, safety invariants on random traces); GazeSource scripted fake; recenter math; controls (keyboard + tap zones); tuning panel.
- **Manual:** Phase 0 spike verdict; WebGazer + calibration; end-to-end acceptance + tuning.

## Risks carried from the design (watch during execution)

1. **Webcam gaze accuracy** — gated by Phase 0. If NO-GO, ship Phases 1–8 + 11 as a manual-scroll reader and defer the loop.
2. **Empirical crop drift** — Task 13.1 is the check; closed-form transform stays in `BACKLOG.md`.
3. **Calibration fragility** — mitigated by one-key recenter (Task 10.3) and tunable smoothing.

---

## Execution handoff

After this plan is saved, choose how to execute (see the writing-plans skill's handoff): subagent-driven in this session, or a separate session with @superpowers:executing-plans. Either way, **Phase 0 (the spike) runs before any app code** — it can change the rest of the plan.
