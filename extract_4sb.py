#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Extract a ForScore .4sb Archive into documents + restructured manifest JSON.

See README.md for the decoded 4SBV03 container and annotation encoding.
"""
from __future__ import annotations

import argparse
import json
import plistlib
import re
import unicodedata
import zlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterator

MAGIC = b"<--4SBV03-->"
GZIP_MAGIC = b"\x1f\x8b\x08"


@dataclass
class Entry:
    """One archive entry; `consumed` is the gzip member's actual byte length, checkable against `comp_len`."""

    path: str
    payload: bytes      # decompressed
    comp_len: int       # from header
    consumed: int       # gzip bytes actually read


def parse_entry_header(header: bytes) -> tuple[int, int, str]:
    """Return (path_len_bytes, gzip_compressed_len, path) from an entry's ASCII header."""
    text = header[len(MAGIC):] if header.startswith(MAGIC) else header
    path_len_match = re.match(rb"\s*(\d+)", text)
    assert path_len_match is not None, f"no path length in header: {header!r}"
    path_len = int(path_len_match.group(1))
    path = header[-path_len:].decode("utf-8")
    comp_len_match = re.search(rb"(\d+)\s*$", header[:-path_len])
    assert comp_len_match is not None, f"no compressed length in header: {header!r}"
    comp_len = int(comp_len_match.group(1))
    return path_len, comp_len, path


def iter_entries(blob: bytes) -> Iterator[Entry]:
    """Walk the concatenated `[header][gzip member]` entries of a 4SBV0x blob."""
    pos = 0
    while (g := blob.find(GZIP_MAGIC, pos)) >= 0:
        path_len, comp_len, path = parse_entry_header(blob[pos:g])
        d = zlib.decompressobj(31)  # wbits=31 -> gzip framing
        payload = d.decompress(blob[g:]) + d.flush()
        consumed = len(blob) - g - len(d.unused_data)
        yield Entry(path=path, payload=payload, comp_len=comp_len, consumed=consumed)
        pos = g + consumed


_FLOAT = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?")


def parse_geometry(s: str) -> list:
    """Parse a CGPoint/CGRect string (`{a,b}` / `{{a,b},{c,d}}`) to float lists."""
    nums = [float(n) for n in _FLOAT.findall(s)]
    if len(nums) == 4:
        return [nums[:2], nums[2:]]
    return nums


def _num(s: str):
    f = float(s)
    return int(f) if f.is_integer() else f


def parse_ink(blue_points: list[str]) -> list[dict]:
    """Parse `&BLU;`/`&ORG;`-delimited ink point strings, lossless raw + tagged tokens."""
    out = []
    for raw in blue_points:
        tokens, marker = [], "start"
        for part in re.split(r"(&BLU;|&ORG;)", raw):
            if part in ("&BLU;", "&ORG;"):
                marker = part.strip("&;")
            elif part != "":
                try:
                    value = _num(part)
                except ValueError:
                    value = part
                tokens.append({"marker": marker, "value": value})
        out.append({"raw": raw, "tokens": tokens})
    return out


_GEOM_PROPS = {"rect", "offset", "trOffset"}


def restructure_manifest(flat: dict) -> dict:
    """Flat manifest dict -> nested `{documents, system, setlists, stamps, unparsed}`.

    Pure: stamp PNG bytes pass through unchanged. Every key lands somewhere;
    unrecognized keys go to `unparsed` so nothing is silently dropped.
    """
    docs: dict = defaultdict(lambda: {"meta": {}, "pages": defaultdict(dict)})
    system, setlists, stamps, unparsed = {}, {}, {}, {}

    for key, value in flat.items():
        if key in ("stamps.plist", "stamps2.plist"):
            stamps[key] = value
        elif key.startswith("&SET;"):
            setlists[key[len("&SET;"):]] = value
        elif key.startswith("&SYS;"):
            system[key[len("&SYS;"):]] = value
        elif key.count("&BLU;") == 2 and key.endswith("bluePoints"):
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
        out_docs[f] = {
            "meta": d["meta"],
            "pages": {p: dict(pg) for p, pg in d["pages"].items()},
        }
    return {
        "documents": out_docs,
        "system": system,
        "setlists": setlists,
        "stamps": stamps,
        "unparsed": unparsed,
    }


def _json_default(o):
    """JSON fallback encoder: render datetime/date as ISO-8601."""
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    raise TypeError(f"not JSON-serializable: {type(o).__name__}")


def write_outputs(structure: dict, outdir: Path) -> None:
    """Write stamps as PNG files, then manifest.json (sans setlists) + setlists.json."""
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
        json.dumps(serializable, indent=2, ensure_ascii=False, default=_json_default)
    )
    (outdir / "setlists.json").write_text(
        json.dumps(setlists, indent=2, ensure_ascii=False, default=_json_default)
    )


PLACEHOLDER = "{%DOCUMENTS_DIR%}/"
# Auxiliary assets (rendered page PNGs, .4se layer files) live under a separate
# placeholder; route them to `aux/` rather than mislabeling them as PDFs.
AUX_PLACEHOLDER = "{%AUX_DIR%}/"


def write_document(path: str, payload: bytes, outdir: Path) -> Path:
    """Write an archived file under `outdir/`, stripping placeholders; reject traversal.

    `{%DOCUMENTS_DIR%}/` entries land in `pdfs/`, `{%AUX_DIR%}/` entries in `aux/`.
    """
    if path.startswith(AUX_PLACEHOLDER):
        rel, subdir = path[len(AUX_PLACEHOLDER):], "aux"
    elif path.startswith(PLACEHOLDER):
        rel, subdir = path[len(PLACEHOLDER):], "pdfs"
    else:
        rel, subdir = path, "pdfs"
    rel = unicodedata.normalize("NFC", rel)
    root = (Path(outdir) / subdir).resolve()
    target = (root / rel).resolve()
    if not str(target).startswith(str(root) + "/") and target != root:
        raise ValueError(f"unsafe path escapes output dir: {path!r}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return target


def main(argv: list[str] | None = None) -> int:
    """Extract a .4sb archive: documents to pdfs/, restructured metadata to manifest.json."""
    ap = argparse.ArgumentParser(description="Extract a ForScore .4sb Archive.")
    ap.add_argument("archive")
    ap.add_argument("-o", "--out", default="out")
    ap.add_argument(
        "--force",
        action="store_true",
        help="write into an existing output directory",
    )
    args = ap.parse_args(argv)

    out = Path(args.out)
    if out.exists() and not args.force and any(out.iterdir()):
        raise SystemExit(f"{out} exists and is not empty (use --force)")

    blob = Path(args.archive).read_bytes()
    manifest_struct = None
    n_docs = 0
    for i, entry in enumerate(iter_entries(blob)):
        if entry.comp_len != entry.consumed:
            print(
                f"warning: {entry.path}: header len {entry.comp_len} "
                f"!= read {entry.consumed}"
            )
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


if __name__ == "__main__":
    raise SystemExit(main())
