# 4SB Archive Extractor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A standalone Python tool that extracts a ForScore `.4sb` Archive into original
documents plus a restructured, lossless `manifest.json` (metadata + annotations), stamps,
and setlists.

**Architecture:** Pure functions for the two hard parts — walking the `[ASCII header][gzip
member]` container and restructuring the flat `bplist00` manifest into nested per-document
JSON — wrapped by a thin `argparse` CLI. All parsing functions are side-effect-free and
unit-tested against a synthetic archive built in-memory; file I/O is isolated in the CLI/
output layer. Rendering annotations onto PDFs is explicitly **out of scope** (see
[BACKLOG.md](../../BACKLOG.md)).

**Tech Stack:** Python ≥3.11, stdlib only at runtime (`zlib`, `gzip`, `plistlib`, `json`,
`pathlib`, `argparse`, `re`, `unicodedata`, `datetime`). `pytest` as the only dev dependency.
Packaged as a `uv run --script` PEP 723 file plus a minimal `pyproject.toml` that carries the
`dev` dependency group and pytest config.

**Format reference:** see [README.md](../../README.md) for the decoded `4SBV03` container and
annotation encoding. Reverse-engineered facts the code relies on:
- Container = entries concatenated, each `[ASCII header][gzip member]`; no index. Scan for
  gzip magic `1f 8b 08`; bytes before it are that member's header.
- Header = `[path-byte-length][gzip-compressed-byte-length][path]` (space-padded decimal).
  Only entry 1 is prefixed with the literal `<--4SBV03-->`. **path-len is a BYTE count**
  (UTF-8; some names use NFD combining marks).
- Entry 1 payload = `bplist00` manifest; entries 2..N = the document bytes.
- Manifest is one flat dict; key shapes: `&SYS;k`, `&SET;name`, `stamps.plist`/`stamps2.plist`,
  `file&BLU;pg&BLU;bluePoints`, `file|pg|prop`, `file|prop`.

---

## Conventions

- TDD throughout: failing test → run (see it fail) → minimal code → run (see it pass) → commit.
- Run tests with `uv run pytest`. One logical change per commit; conventional-commit messages.
- End every commit message with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.
- The real archive `Archive 2026-06-07 23-15-54.4sb` is git-ignored; never read it in unit
  tests. Task 9 adds one opt-in smoke test that skips when the file is absent.

---

### Task 0: Scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `extract_4sb.py`
- Create: `tests/__init__.py` (empty)
- Create: `tests/conftest.py`

**Step 1: Write `pyproject.toml`** (project metadata is minimal; runtime deps stay in the
script's PEP 723 block — this file exists for the dev/test workflow and pytest config).

```toml
[project]
name = "forscore-archive"
version = "0.1.0"
description = "Extract ForScore .4sb Archive files (documents + annotations) on Linux"
requires-python = ">=3.11"

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
addopts = "-q"
```

**Step 2: Write the `extract_4sb.py` skeleton** (shebang + PEP 723; importable — no work at
import time).

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Extract a ForScore .4sb Archive into documents + restructured manifest JSON.

See README.md for the decoded 4SBV03 container and annotation encoding.
"""
from __future__ import annotations

import re

MAGIC = b"<--4SBV03-->"


def main(argv: list[str] | None = None) -> int:
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
```

**Step 3: Write `tests/conftest.py`** — the synthetic-archive builder fixture (no real file).

```python
import gzip
import plistlib

import pytest

MAGIC = b"<--4SBV03-->"


def make_entry(path: str, payload: bytes, first: bool) -> bytes:
    """One archive entry: [ASCII header][gzip member]. Mirrors the 4SBV03 framing."""
    gz = gzip.compress(payload)
    pbytes = path.encode("utf-8")
    prefix = (MAGIC if first else b"") + f"{len(pbytes):>12}{len(gz):>16}".encode()
    return prefix + pbytes + gz


def build_archive(entries: list[tuple[str, bytes]]) -> bytes:
    """entries[0] is the manifest entry; the rest are documents."""
    return b"".join(make_entry(p, d, i == 0) for i, (p, d) in enumerate(entries))


@pytest.fixture
def sample_archive() -> bytes:
    manifest = plistlib.dumps(
        {
            "Song.pdf|title": "My Song",
            "Song.pdf|composer": "J. S. Test",
            "Song.pdf|3|rect": "{{1.0, 2.0}, {3.0, 4.0}}",
            "Song.pdf|3|zoom": 1.5,
            "Song.pdf|3|textAnnotations": [{"text": "hi", "origin.x": 0.5}],
            "Song.pdf&BLU;3&BLU;bluePoints": ["0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"],
            "Song.pdf|bookmarks": [{"Title": "Intro", "First Page": 1}],
            "stamps.plist": [b"\x89PNG\r\n\x1a\nFAKE"],
            "&SYS;setlists": ["&SET;Practice"],
            "&SET;Practice": ["Song.pdf"],
            "&SYS;rulerVisible": True,
        },
        fmt=plistlib.FMT_BINARY,
    )
    return build_archive(
        [
            ("Archive test.4sb", manifest),
            ("{%DOCUMENTS_DIR%}/Song.pdf", b"%PDF-1.4 fake pdf bytes"),
        ]
    )
```

**Step 4: Verify collection works.** Run: `uv run pytest` — Expected: "no tests ran"
(0 tests collected, exit 5) with no import/collection errors.

**Step 5: Commit**
```bash
git add pyproject.toml extract_4sb.py tests/
git commit -m "chore: scaffold 4sb extractor (pyproject, skeleton, test fixture)"
```

---

### Task 1: Parse one entry header

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

Parsing rule (unambiguous even when the path starts with digits or contains spaces):
strip the optional magic, the **first** integer is `path_len`, the path is the **last
`path_len` bytes**, and `comp_len` is the trailing integer of the remaining prefix.

**Step 1: Write the failing test**
```python
import extract_4sb as x

def test_parse_header_entry1_with_magic():
    header = b"<--4SBV03-->              31          404337Archive 2026-06-07 23-15-54.4sb"
    path_len, comp_len, path = x.parse_entry_header(header)
    assert path_len == 31
    assert comp_len == 404337
    assert path == "Archive 2026-06-07 23-15-54.4sb"

def test_parse_header_entry_no_magic_with_placeholder_path():
    header = b"              30          137345{%DOCUMENTS_DIR%}/Vocalise.pdf"
    path_len, comp_len, path = x.parse_entry_header(header)
    assert (path_len, comp_len, path) == (30, 137345, "{%DOCUMENTS_DIR%}/Vocalise.pdf")

def test_parse_header_utf8_path_len_is_bytes():
    name = "Saẗ.pdf"  # multi-byte char -> byte length > char length
    pbytes = name.encode("utf-8")
    header = f"{len(pbytes):>6}{99:>10}".encode() + pbytes
    path_len, comp_len, path = x.parse_entry_header(header)
    assert path == name and comp_len == 99 and path_len == len(pbytes)
```

**Step 2: Run** `uv run pytest tests/test_extract_4sb.py -k parse_header` — Expected: FAIL
(`AttributeError: module 'extract_4sb' has no attribute 'parse_entry_header'`).

**Step 3: Implement**
```python
def parse_entry_header(header: bytes) -> tuple[int, int, str]:
    """Return (path_len_bytes, gzip_compressed_len, path) from an entry's ASCII header."""
    text = header[len(MAGIC):] if header.startswith(MAGIC) else header
    path_len = int(re.match(rb"\s*(\d+)", text).group(1))
    path = header[-path_len:].decode("utf-8")
    comp_len = int(re.search(rb"(\d+)\s*$", header[:-path_len]).group(1))
    return path_len, comp_len, path
```

**Step 4: Run** the same -k selection — Expected: PASS.

**Step 5: Commit** `feat: parse 4sb entry headers`.

---

### Task 2: Walk the container

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

**Step 1: Write the failing test** (uses the `sample_archive` fixture)
```python
def test_iter_entries_yields_all(sample_archive):
    entries = list(x.iter_entries(sample_archive))
    assert [e.path for e in entries] == ["Archive test.4sb", "{%DOCUMENTS_DIR%}/Song.pdf"]
    assert entries[0].payload.startswith(b"bplist00")
    assert entries[1].payload == b"%PDF-1.4 fake pdf bytes"

def test_iter_entries_validates_compressed_length(sample_archive):
    # comp_len in each header must equal the bytes actually consumed by the gzip member
    for e in x.iter_entries(sample_archive):
        assert e.comp_len == e.consumed
```

**Step 2: Run** `-k iter_entries` — Expected: FAIL (no `iter_entries`).

**Step 3: Implement**
```python
import zlib
from dataclasses import dataclass
from typing import Iterator

GZIP_MAGIC = b"\x1f\x8b\x08"


@dataclass
class Entry:
    path: str
    payload: bytes      # decompressed
    comp_len: int       # from header
    consumed: int       # gzip bytes actually read


def iter_entries(blob: bytes) -> Iterator[Entry]:
    pos = 0
    while (g := blob.find(GZIP_MAGIC, pos)) >= 0:
        path_len, comp_len, path = parse_entry_header(blob[pos:g])
        d = zlib.decompressobj(31)  # wbits=31 -> gzip framing
        payload = d.decompress(blob[g:]) + d.flush()
        consumed = len(blob) - g - len(d.unused_data)
        yield Entry(path=path, payload=payload, comp_len=comp_len, consumed=consumed)
        pos = g + consumed
```

**Step 4: Run** `-k iter_entries` — Expected: PASS.

**Step 5: Commit** `feat: walk the 4sb container into entries`.

---

### Task 3: Parse geometry strings (`rect`/`offset`)

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

**Step 1: Failing test**
```python
def test_parse_geometry_point_and_rect():
    assert x.parse_geometry("{2.5, -13.8}") == [2.5, -13.8]
    assert x.parse_geometry("{{1.0, 2.0}, {3.0, 4.0}}") == [[1.0, 2.0], [3.0, 4.0]]
```

**Step 2: Run** `-k geometry` — Expected: FAIL.

**Step 3: Implement** (extract floats by regex; shape by count)
```python
_FLOAT = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?")

def parse_geometry(s: str) -> list:
    nums = [float(n) for n in _FLOAT.findall(s)]
    if len(nums) == 4:
        return [nums[:2], nums[2:]]
    return nums
```

**Step 4: Run** — Expected: PASS.  **Step 5: Commit** `feat: parse CGRect/CGPoint strings`.

---

### Task 4: Parse freehand ink (`bluePoints`)

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

Ink values are strings of numbers separated by `&BLU;`/`&ORG;`. Semantics of the two markers
are not certain, so keep it **lossless + best-effort**: return the raw string plus a parsed
token list tagging each number with its preceding marker.

**Step 1: Failing test**
```python
def test_parse_ink_keeps_raw_and_tags_markers():
    out = x.parse_ink(["0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"])
    assert out[0]["raw"] == "0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"
    assert out[0]["tokens"][0] == {"marker": "start", "value": 0.1}
    assert out[0]["tokens"][2] == {"marker": "BLU", "value": 0.0}
    assert out[0]["tokens"][3] == {"marker": "ORG", "value": 0.3}
```

**Step 2: Run** `-k ink` — Expected: FAIL.

**Step 3: Implement**
```python
def _num(s: str):
    f = float(s)
    return int(f) if f.is_integer() else f

def parse_ink(blue_points: list[str]) -> list[dict]:
    out = []
    for raw in blue_points:
        tokens, marker, i = [], "start", 0
        for part in re.split(r"(&BLU;|&ORG;)", raw):
            if part in ("&BLU;", "&ORG;"):
                marker = part.strip("&;")
            elif part != "":
                tokens.append({"marker": marker, "value": _num(part)})
        out.append({"raw": raw, "tokens": tokens})
    return out
```

**Step 4: Run** — Expected: PASS.  **Step 5: Commit** `feat: parse freehand ink points`.

---

### Task 5: Restructure the manifest

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

Pure function: flat dict → `{documents, system, setlists, stamps, unparsed}`. Stamp PNG
bytes are carried through unchanged (the output layer writes them). **Every** key must land
somewhere; unrecognized keys go to `unparsed` so nothing is silently dropped.

Dispatch order (first match wins):
1. key `stamps.plist` / `stamps2.plist` → `stamps[name] = [bytes, ...]`
2. startswith `&SET;` → `setlists[name_after_prefix] = value`
3. startswith `&SYS;` → `system[key_after_prefix] = value`
4. contains `&BLU;...&BLU;bluePoints` → `documents[file].pages[pg]["ink"] = parse_ink(value)`
5. `file|pg|prop` (3 `|`-fields, middle is an int) → `documents[file].pages[pg][prop]`,
   running `rect`/`offset`/`trOffset` through `parse_geometry`
6. `file|prop` (2 `|`-fields) → `documents[file].meta[prop]`
7. else → `unparsed[key] = value`

**Step 1: Failing test**
```python
def test_restructure_buckets_keys(sample_archive):
    manifest = next(x.iter_entries(sample_archive)).payload
    import plistlib
    s = x.restructure_manifest(plistlib.loads(manifest))
    doc = s["documents"]["Song.pdf"]
    assert doc["meta"]["title"] == "My Song"
    assert doc["pages"]["3"]["rect"] == [[1.0, 2.0], [3.0, 4.0]]
    assert doc["pages"]["3"]["zoom"] == 1.5
    assert doc["pages"]["3"]["ink"][0]["raw"].startswith("0.1&BLU;")
    assert doc["pages"]["3"]["textAnnotations"][0]["text"] == "hi"
    assert doc["bookmarks"][0]["Title"] == "Intro"
    assert s["system"]["rulerVisible"] is True
    assert s["setlists"]["Practice"] == ["Song.pdf"]
    assert s["stamps"]["stamps.plist"][0].startswith(b"\x89PNG")
    assert s["unparsed"] == {}

def test_restructure_routes_unknown_keys_to_unparsed():
    s = x.restructure_manifest({"weird&XYZ;thing": 1})
    assert s["unparsed"] == {"weird&XYZ;thing": 1}
```
Note: `bookmarks` is a per-document list (rule 6 gives `meta`/list at the `file|prop`
level); place `bookmarks`/`textAnnotations` lists appropriately — adjust the test to match
the chosen home if needed, but keep them under their document.

**Step 2: Run** `-k restructure` — Expected: FAIL.

**Step 3: Implement** (`documents` auto-vivifies `meta`/`pages`; helper keeps it DRY)
```python
from collections import defaultdict

_GEOM_PROPS = {"rect", "offset", "trOffset"}

def restructure_manifest(flat: dict) -> dict:
    docs: dict = defaultdict(lambda: {"meta": {}, "pages": defaultdict(dict)})
    system, setlists, stamps, unparsed = {}, {}, {}, {}

    for key, value in flat.items():
        if key in ("stamps.plist", "stamps2.plist"):
            stamps[key] = value
        elif key.startswith("&SET;"):
            setlists[key[len("&SET;"):]] = value
        elif key.startswith("&SYS;"):
            system[key[len("&SYS;"):]] = value
        elif "&BLU;" in key and key.endswith("bluePoints"):
            file, pg = key.split("&BLU;")[0], key.split("&BLU;")[1]
            docs[file]["pages"][pg]["ink"] = parse_ink(value)
        elif key.count("|") == 2:
            file, pg, prop = key.split("|")
            docs[file]["pages"][pg][prop] = (
                parse_geometry(value) if prop in _GEOM_PROPS else value
            )
        elif key.count("|") == 1:
            file, prop = key.split("|")
            docs[file]["meta"][prop] = value
        else:
            unparsed[key] = value

    # freeze defaultdicts -> plain dicts for JSON
    out_docs = {}
    for f, d in docs.items():
        out_docs[f] = {"meta": d["meta"], "pages": {p: dict(pg) for p, pg in d["pages"].items()}}
    return {"documents": out_docs, "system": system, "setlists": setlists,
            "stamps": stamps, "unparsed": unparsed}
```
> During Task 5, if real-manifest props like `bookmarks`, `textAnnotations`, `added`,
> `composer` land somewhere awkward, refine the dispatch — but keep rule 7 (`unparsed`) as
> the safety net and assert `unparsed == {}` against the real archive in Task 9.

**Step 4: Run** `-k restructure` — Expected: PASS.

**Step 5: Commit** `feat: restructure flat manifest into nested per-document JSON`.

---

### Task 6: Output layer (write files + JSON-safe serialization)

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

Two concerns: (a) move stamp `bytes` out to PNG files and replace them with `{"_png": path}`
refs; (b) JSON-encode the rest (`datetime` → ISO-8601). Write to `tmp_path` in tests.

**Step 1: Failing test**
```python
import json
from datetime import datetime

def test_write_outputs_creates_files_and_json(tmp_path):
    structure = {
        "documents": {"Song.pdf": {"meta": {"added": datetime(2020, 1, 2, 3, 4, 5)},
                                   "pages": {}}},
        "system": {}, "setlists": {"Practice": ["Song.pdf"]},
        "stamps": {"stamps.plist": [b"\x89PNG\r\n\x1a\nFAKE"]}, "unparsed": {},
    }
    x.write_outputs(structure, tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["documents"]["Song.pdf"]["meta"]["added"] == "2020-01-02T03:04:05"
    assert manifest["stamps"]["stamps.plist"][0] == {"_png": "stamps/stamps_0.png"}
    assert (tmp_path / "stamps" / "stamps_0.png").read_bytes().startswith(b"\x89PNG")
    assert json.loads((tmp_path / "setlists.json").read_text()) == {"Practice": ["Song.pdf"]}
```

**Step 2: Run** `-k write_outputs` — Expected: FAIL.

**Step 3: Implement**
```python
import json
from datetime import datetime, date
from pathlib import Path

def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    raise TypeError(f"not JSON-serializable: {type(o).__name__}")

def write_outputs(structure: dict, outdir: Path) -> None:
    outdir = Path(outdir)
    (outdir / "stamps").mkdir(parents=True, exist_ok=True)
    stamps = structure.get("stamps", {})
    refs = {}
    for name, blobs in stamps.items():
        base = name.replace(".plist", "")
        out = []
        for i, blob in enumerate(blobs):
            fn = f"{base}_{i}.png"
            (outdir / "stamps" / fn).write_bytes(blob)
            out.append({"_png": f"stamps/{fn}"})
        refs[name] = out
    serializable = {**structure, "stamps": refs}
    setlists = serializable.pop("setlists", {})
    (outdir / "manifest.json").write_text(
        json.dumps(serializable, indent=2, ensure_ascii=False, default=_json_default))
    (outdir / "setlists.json").write_text(
        json.dumps(setlists, indent=2, ensure_ascii=False, default=_json_default))
```

**Step 4: Run** — Expected: PASS.  **Step 5: Commit** `feat: write stamps + JSON outputs`.

---

### Task 7: Document-writing helper + CLI wiring

**Files:** Modify `extract_4sb.py`; Test `tests/test_extract_4sb.py`.

`write_document` strips the `{%DOCUMENTS_DIR%}/` placeholder, rejects path traversal, NFC-
normalizes the name, creates parent dirs, and writes under `out/pdfs/`. `main` ties
everything together.

**Step 1: Failing tests**
```python
def test_write_document_strips_placeholder_and_blocks_traversal(tmp_path):
    p = x.write_document("{%DOCUMENTS_DIR%}/sub/Song.pdf", b"%PDF", tmp_path)
    assert p == tmp_path / "pdfs" / "sub" / "Song.pdf"
    assert p.read_bytes() == b"%PDF"
    import pytest
    with pytest.raises(ValueError):
        x.write_document("{%DOCUMENTS_DIR%}/../escape.pdf", b"x", tmp_path)

def test_main_end_to_end(tmp_path, sample_archive):
    src = tmp_path / "in.4sb"; src.write_bytes(sample_archive)
    out = tmp_path / "out"
    assert x.main([str(src), "-o", str(out)]) == 0
    assert (out / "pdfs" / "Song.pdf").read_bytes() == b"%PDF-1.4 fake pdf bytes"
    import json
    m = json.loads((out / "manifest.json").read_text())
    assert m["documents"]["Song.pdf"]["meta"]["title"] == "My Song"
    assert (out / "stamps" / "stamps_0.png").exists()

def test_main_refuses_existing_outdir_without_force(tmp_path, sample_archive):
    src = tmp_path / "in.4sb"; src.write_bytes(sample_archive)
    out = tmp_path / "out"; out.mkdir()
    import pytest
    with pytest.raises(SystemExit):
        x.main([str(src), "-o", str(out)])
    assert x.main([str(src), "-o", str(out), "--force"]) == 0
```

**Step 2: Run** `-k "write_document or main_"` — Expected: FAIL.

**Step 3: Implement**
```python
import argparse
import unicodedata

PLACEHOLDER = "{%DOCUMENTS_DIR%}/"

def write_document(path: str, payload: bytes, outdir: Path) -> Path:
    rel = path[len(PLACEHOLDER):] if path.startswith(PLACEHOLDER) else path
    rel = unicodedata.normalize("NFC", rel)
    pdfs = (Path(outdir) / "pdfs").resolve()
    target = (pdfs / rel).resolve()
    if not str(target).startswith(str(pdfs) + "/") and target != pdfs:
        raise ValueError(f"unsafe path escapes output dir: {path!r}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return target

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Extract a ForScore .4sb Archive.")
    ap.add_argument("archive")
    ap.add_argument("-o", "--out", default="out")
    ap.add_argument("--force", action="store_true",
                    help="write into an existing output directory")
    args = ap.parse_args(argv)

    out = Path(args.out)
    if out.exists() and not args.force and any(out.iterdir()):
        raise SystemExit(f"{out} exists and is not empty (use --force)")

    blob = Path(args.archive).read_bytes()
    import plistlib
    manifest_struct = None
    n_docs = 0
    for i, entry in enumerate(iter_entries(blob)):
        if entry.comp_len != entry.consumed:
            print(f"warning: {entry.path}: header len {entry.comp_len} != read {entry.consumed}")
        if i == 0:
            manifest_struct = restructure_manifest(plistlib.loads(entry.payload))
        else:
            write_document(entry.path, entry.payload, out)
            n_docs += 1
    if manifest_struct is None:
        raise SystemExit("no manifest entry found — not a 4SBV0x archive?")
    write_outputs(manifest_struct, out)
    print(f"extracted {n_docs} documents + manifest to {out}/")
    return 0
```

**Step 4: Run** `uv run pytest` (full suite) — Expected: PASS (all green).

**Step 5: Commit** `feat: document writer + extract CLI`.

---

### Task 8: `chmod +x` + manual smoke run against the real archive

**Files:** none new (manual verification step; no commit unless something changes).

**Step 1:** `chmod +x extract_4sb.py`

**Step 2:** Run the tool on the real archive into a temp dir:
`./extract_4sb.py "Archive 2026-06-07 23-15-54.4sb" -o /tmp/4sb-out`
Expected: prints `extracted N documents + manifest to /tmp/4sb-out/`, no tracebacks.

**Step 3:** Spot-check: `ls /tmp/4sb-out/pdfs | head`, open `manifest.json`, confirm
`unparsed` is empty (or note which keys fell through and refine Task 5's dispatch + add a
regression test). Confirm a known PDF opens.

**Step 4:** If dispatch needed refining, loop back to Task 5 (test-first), then commit.

---

### Task 9: Opt-in smoke test + README usage

**Files:** Modify `tests/test_extract_4sb.py`; Modify `README.md`.

**Step 1: Add a skipped-if-absent smoke test**
```python
import pathlib
import pytest

REAL = pathlib.Path("Archive 2026-06-07 23-15-54.4sb")

@pytest.mark.skipif(not REAL.exists(), reason="real archive not present")
def test_real_archive_round_trips(tmp_path):
    assert x.main([str(REAL), "-o", str(tmp_path / "out")]) == 0
    import json
    m = json.loads((tmp_path / "out" / "manifest.json").read_text())
    assert m["unparsed"] == {}, f"unrouted keys: {list(m['unparsed'])[:10]}"
    assert len(m["documents"]) > 0
```

**Step 2: Run** `uv run pytest` — Expected: PASS (smoke test runs locally, skips elsewhere).

**Step 3: Add a "Usage" section to `README.md`**
```markdown
## Usage

```bash
./extract_4sb.py "Archive ….4sb" -o out      # uv run --script: auto-installs deps
uv run pytest                                 # run the tests
```

Output: `out/pdfs/` (original documents), `out/manifest.json` (restructured metadata +
annotations), `out/stamps/*.png`, `out/setlists.json`.
```

**Step 4: Commit** `test: real-archive smoke test; docs: extractor usage`.

**Step 5:** Update `BACKLOG.md`: flip the extractor item `[~]` → `[x]`; commit
`docs: mark raw extractor done`.

---

## Done criteria

- `uv run pytest` green; smoke test confirms the real archive round-trips with `unparsed == {}`.
- `./extract_4sb.py ARCHIVE.4sb -o out` produces verbatim PDFs + restructured `manifest.json`
  + stamps + setlists, refusing to clobber a non-empty `out/` without `--force`.
- No runtime third-party deps; pytest only in the `dev` group.
