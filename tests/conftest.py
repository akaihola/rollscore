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
