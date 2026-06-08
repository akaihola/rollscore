#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Extract a ForScore .4sb Archive into documents + restructured manifest JSON.

See README.md for the decoded 4SBV03 container and annotation encoding.
"""
from __future__ import annotations

MAGIC = b"<--4SBV03-->"


def main(argv: list[str] | None = None) -> int:
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
