import gzip
import plistlib
import urllib.request
from pathlib import Path

import pytest

MAGIC = b"<--4SBV03-->"

# --- La Maja golden fixture (public-domain, downloaded on demand) ------------
# Granados, *Goyescas* first edition (Barcelona: Casa Dotésio, 1912), IMSLP
# #877498 — public domain. "La Maja y el Ruiseñor" is PDF pages 39-44. The scan
# is never committed (copyright-clean but large; see memory no-copyrighted-pdfs);
# it is fetched on first use and cached under the gitignored tests/fixtures/.
GOYESCAS_URL = (
    "https://s9.imslp.org/files/imglnks/usimg/2/27/"
    "IMSLP877498-PMLP03851-Granados-Goyescas-FE-mono.pdf"
)
GOYESCAS_PDF = Path(__file__).resolve().parent / "fixtures" / "goyescas-fe.pdf"
LA_MAJA_PAGE1 = 39  # 1-based PDF page where La Maja starts
_MIN_PDF_BYTES = 1_000_000  # real scan ~7.7 MB; reject an IMSLP HTML stub


@pytest.fixture(scope="session")
def goyescas_pdf() -> Path:
    """Path to the La Maja source PDF, downloading it if missing.

    IMSLP only serves the file with a ``Referer`` header; without one it returns a
    tiny HTML stub. If the download fails (offline / sandboxed network), skip with
    a copy-paste command so the user can place the file manually.
    """
    if GOYESCAS_PDF.exists() and GOYESCAS_PDF.stat().st_size >= _MIN_PDF_BYTES:
        return GOYESCAS_PDF
    GOYESCAS_PDF.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(
            GOYESCAS_URL, headers={"Referer": "https://imslp.org/"}
        )
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 (fixed https URL)
            data = resp.read()
        if len(data) < _MIN_PDF_BYTES:
            raise ValueError(f"got {len(data)} bytes — not the PDF (IMSLP stub?)")
        GOYESCAS_PDF.write_bytes(data)
    except Exception as exc:  # network blocked, offline, etc.
        pytest.skip(
            "La Maja golden fixture missing and auto-download failed "
            f"({exc}).\nIt is public-domain (Granados, Goyescas first edition, "
            "IMSLP #877498). Download it manually (IMSLP needs the Referer):\n"
            f"  xh --download --output {GOYESCAS_PDF} GET '{GOYESCAS_URL}' "
            "'Referer:https://imslp.org/'\n"
        )
    return GOYESCAS_PDF


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
