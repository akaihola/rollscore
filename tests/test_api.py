"""HTTP route tests for Phase 6: library, page image, resume + tuning."""
import io
import json

import pymupdf
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from gazescroll.app import create_app
from gazescroll.crop import CANVAS_PX

SCORE_FILE = "Sonata No. 1 | Test.pdf"  # spaces + pipe: must survive URL-encoding


def _make_out(tmp_path):
    """A synthetic extraction dir with one 1-page score + an overlay."""
    out = tmp_path / "out"
    (out / "pdfs").mkdir(parents=True)
    (out / "aux").mkdir()

    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0, 0, 0))
    doc.save(out / "pdfs" / SCORE_FILE)
    doc.close()

    manifest = {
        "documents": {
            SCORE_FILE: {
                "meta": {"title": "Sonata No. 1", "composer": "Test"},
                "pages": {"1": {"zoom": 1.0}},
            }
        }
    }
    (out / "manifest.json").write_text(json.dumps(manifest))
    (out / "setlists.json").write_text(
        json.dumps({"Recital": [{"FilePath": SCORE_FILE, "Title": "Sonata No. 1"}]})
    )

    overlay = Image.new("RGBA", CANVAS_PX, (0, 0, 0, 0))
    overlay.putpixel((10, 10), (255, 0, 0, 255))
    overlay.save(out / "aux" / f"{SCORE_FILE}|1.png")
    return out


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GAZESCROLL_CACHE", str(tmp_path / "cache"))
    out = _make_out(tmp_path)
    app = create_app(source=out, state_path=tmp_path / "state.json")
    return TestClient(app)


# --- Task 6.1: /api/library -------------------------------------------------

def test_library_endpoint(client):
    r = client.get("/api/library")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"scores", "setlists", "composers"}

    assert SCORE_FILE in body["scores"]
    score = body["scores"][SCORE_FILE]
    assert score["title"] == "Sonata No. 1"
    assert score["composer"] == "Test"
    assert score["page_count"] == 1

    assert body["setlists"]["Recital"][0]["filename"] == SCORE_FILE
    assert body["composers"][0]["composer"] == "Test"
    assert body["composers"][0]["scores"][0]["filename"] == SCORE_FILE


# --- Task 6.2: page image + dimensions --------------------------------------

def test_page_image_endpoint(client):
    r = client.get(f"/api/score/{SCORE_FILE}/page/1.png", params={"annotated": 1})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (2160, round(792 * 2160 / 612))  # full-page canvas
    # annotated overlay's red pixel composited in (opaque red over white)
    assert img.convert("RGBA").getpixel((10, 10)) == (255, 0, 0, 255)


def test_page_image_plain_variant(client):
    r = client.get(f"/api/score/{SCORE_FILE}/page/1.png", params={"annotated": 0})
    assert r.status_code == 200
    img = Image.open(io.BytesIO(r.content)).convert("RGBA")
    assert img.getpixel((10, 10)) != (255, 0, 0, 255)


def test_page_dimensions_endpoint(client):
    r = client.get(f"/api/score/{SCORE_FILE}/pages")
    assert r.status_code == 200
    dims = r.json()
    assert dims == [{"width": 2160, "height": round(792 * 2160 / 612), "zoom": 1.0, "trOffset": None}]


# --- Task 3: /systems endpoint ----------------------------------------------

def test_systems_endpoint(client):
    r = client.get(f"/api/score/{SCORE_FILE}/systems")
    assert r.status_code == 200
    body = r.json()
    # One per-page entry (1-page score); each is a list of boxes. The synthetic
    # page is a plain rectangle with no staves, so detection yields an empty list.
    assert body == [[]]


def test_systems_unknown_score_404(client):
    r = client.get("/api/score/Nonexistent.pdf/systems")
    assert r.status_code == 404


def test_systems_no_source_503():
    client = TestClient(create_app())  # no data source configured
    r = client.get(f"/api/score/{SCORE_FILE}/systems")
    assert r.status_code == 503


# --- Task 6.3: resume + tuning ----------------------------------------------

def test_resume_round_trip(client):
    # No resume stored yet.
    assert client.get(f"/api/score/{SCORE_FILE}/resume").json() is None

    r = client.put(
        f"/api/score/{SCORE_FILE}/resume", json={"page": 3, "scroll": 0.42}
    )
    assert r.status_code == 200
    got = client.get(f"/api/score/{SCORE_FILE}/resume").json()
    assert got == {"page": 3, "scroll": 0.42}


def test_tuning_round_trip(client):
    base = client.get("/api/tuning").json()
    assert base["setpoint"] == 0.4  # default

    r = client.put("/api/tuning", json={"setpoint": 0.6})
    assert r.status_code == 200
    got = client.get("/api/tuning").json()
    assert got["setpoint"] == 0.6
    assert got["deadzone"] == base["deadzone"]  # untouched default preserved


def test_calibration_round_trip(client):
    assert client.get("/api/calibration", params={"orientation": "landscape"}).json() is None

    entry = {"blob": [{"eyes": {}, "screenPos": [400, 300]}], "dpr": 2.0}
    r = client.put("/api/calibration", json=entry, params={"orientation": "landscape"})
    assert r.status_code == 200
    assert client.get("/api/calibration", params={"orientation": "landscape"}).json() == entry
    # Other orientation is untouched.
    assert client.get("/api/calibration", params={"orientation": "portrait"}).json() is None


def test_calibration_legacy_migration_via_api(tmp_path, monkeypatch):
    import json
    from gazescroll.app import create_app
    from fastapi.testclient import TestClient
    monkeypatch.setenv("GAZESCROLL_CACHE", str(tmp_path / "cache"))
    out = _make_out(tmp_path)
    legacy = [{"eyes": {}, "screenPos": [100, 200]}]
    state_file = tmp_path / "state.json"
    state_file.write_text(json.dumps({"calibration": legacy}))
    app2 = create_app(source=out, state_path=state_file)
    c2 = TestClient(app2)
    got = c2.get("/api/calibration", params={"orientation": "landscape"}).json()
    assert got == {"blob": legacy, "dpr": None}
    assert c2.get("/api/calibration", params={"orientation": "portrait"}).json() is None
