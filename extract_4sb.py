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
import zlib
from dataclasses import dataclass
from typing import Iterator

MAGIC = b"<--4SBV03-->"
GZIP_MAGIC = b"\x1f\x8b\x08"


@dataclass
class Entry:
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
    pos = 0
    while (g := blob.find(GZIP_MAGIC, pos)) >= 0:
        path_len, comp_len, path = parse_entry_header(blob[pos:g])
        d = zlib.decompressobj(31)  # wbits=31 -> gzip framing
        payload = d.decompress(blob[g:]) + d.flush()
        consumed = len(blob) - g - len(d.unused_data)
        yield Entry(path=path, payload=payload, comp_len=comp_len, consumed=consumed)
        pos = g + consumed


def main(argv: list[str] | None = None) -> int:
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
