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


def main(argv: list[str] | None = None) -> int:
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
