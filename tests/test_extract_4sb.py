import pathlib

import pytest

import extract_4sb as x

REAL = pathlib.Path("Archive 2026-06-07 23-15-54.4sb")


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


def test_iter_entries_yields_all(sample_archive):
    entries = list(x.iter_entries(sample_archive))
    assert [e.path for e in entries] == ["Archive test.4sb", "{%DOCUMENTS_DIR%}/Song.pdf"]
    assert entries[0].payload.startswith(b"bplist00")
    assert entries[1].payload == b"%PDF-1.4 fake pdf bytes"


def test_iter_entries_validates_compressed_length(sample_archive):
    # comp_len in each header must equal the bytes actually consumed by the gzip member
    for e in x.iter_entries(sample_archive):
        assert e.comp_len == e.consumed


def test_parse_geometry_point_and_rect():
    assert x.parse_geometry("{2.5, -13.8}") == [2.5, -13.8]
    assert x.parse_geometry("{{1.0, 2.0}, {3.0, 4.0}}") == [[1.0, 2.0], [3.0, 4.0]]


def test_parse_geometry_scientific_notation():
    assert x.parse_geometry("{{-1.5, 2.0}, {3.0e2, 4.5E-1}}") == [
        [-1.5, 2.0],
        [300.0, 0.45],
    ]


def test_parse_ink_keeps_raw_and_tags_markers():
    out = x.parse_ink(["0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"])
    assert out[0]["raw"] == "0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"
    assert out[0]["tokens"][0] == {"marker": "start", "value": 0.1}
    assert out[0]["tokens"][2] == {"marker": "BLU", "value": 0.0}
    assert out[0]["tokens"][3] == {"marker": "ORG", "value": 0.3}


def test_parse_ink_keeps_non_numeric_token_as_string():
    out = x.parse_ink(["0.1&BLU;foo&ORG;2"])
    assert out[0]["raw"] == "0.1&BLU;foo&ORG;2"
    assert out[0]["tokens"][0] == {"marker": "start", "value": 0.1}
    assert out[0]["tokens"][1] == {"marker": "BLU", "value": "foo"}
    assert out[0]["tokens"][2] == {"marker": "ORG", "value": 2}


def test_restructure_malformed_ink_key_to_unparsed():
    s = x.restructure_manifest({"file.pdf&BLU;bluePoints": ["x"]})
    assert s["unparsed"] == {"file.pdf&BLU;bluePoints": ["x"]}


def test_restructure_wellformed_ink_key_routes_to_page():
    s = x.restructure_manifest({"file.pdf&BLU;3&BLU;bluePoints": ["0.1&BLU;0.2"]})
    assert "ink" in s["documents"]["file.pdf"]["pages"]["3"]


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
    # `Song.pdf|bookmarks` has one `|` -> rule 6 routes it to meta.
    assert doc["meta"]["bookmarks"][0]["Title"] == "Intro"
    assert s["system"]["rulerVisible"] is True
    assert s["setlists"]["Practice"] == ["Song.pdf"]
    assert s["stamps"]["stamps.plist"][0].startswith(b"\x89PNG")
    assert s["unparsed"] == {}


def test_restructure_routes_unknown_keys_to_unparsed():
    s = x.restructure_manifest({"weird&XYZ;thing": 1})
    assert s["unparsed"] == {"weird&XYZ;thing": 1}


@pytest.mark.skipif(not REAL.exists(), reason="real archive not present")
def test_real_archive_round_trips(tmp_path):
    import json

    assert x.main([str(REAL), "-o", str(tmp_path / "out")]) == 0
    m = json.loads((tmp_path / "out" / "manifest.json").read_text())
    assert m["unparsed"] == {}, f"unrouted keys: {list(m['unparsed'])[:10]}"
    assert len(m["documents"]) > 0


def test_write_outputs_creates_files_and_json(tmp_path):
    import json
    from datetime import datetime

    structure = {
        "documents": {
            "Song.pdf": {
                "meta": {"added": datetime(2020, 1, 2, 3, 4, 5)},
                "pages": {},
            }
        },
        "system": {},
        "setlists": {"Practice": ["Song.pdf"]},
        "stamps": {"stamps.plist": [b"\x89PNG\r\n\x1a\nFAKE"]},
        "unparsed": {},
    }
    x.write_outputs(structure, tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["documents"]["Song.pdf"]["meta"]["added"] == "2020-01-02T03:04:05"
    assert manifest["stamps"]["stamps.plist"][0] == {"_png": "stamps/stamps_0.png"}
    assert (tmp_path / "stamps" / "stamps_0.png").read_bytes().startswith(b"\x89PNG")
    assert json.loads((tmp_path / "setlists.json").read_text()) == {
        "Practice": ["Song.pdf"]
    }
    assert "setlists" not in manifest


def test_write_document_strips_placeholder_and_blocks_traversal(tmp_path):
    p = x.write_document("{%DOCUMENTS_DIR%}/sub/Song.pdf", b"%PDF", tmp_path)
    assert p == tmp_path / "pdfs" / "sub" / "Song.pdf"
    assert p.read_bytes() == b"%PDF"
    with pytest.raises(ValueError):
        x.write_document("{%DOCUMENTS_DIR%}/../escape.pdf", b"x", tmp_path)


def test_write_document_routes_aux_assets_to_aux_dir(tmp_path):
    p = x.write_document("{%AUX_DIR%}/Song.pdf|1.png", b"\x89PNG", tmp_path)
    assert p == tmp_path / "aux" / "Song.pdf|1.png"
    assert p.read_bytes() == b"\x89PNG"


def test_main_end_to_end(tmp_path, sample_archive):
    import json

    src = tmp_path / "in.4sb"
    src.write_bytes(sample_archive)
    out = tmp_path / "out"
    assert x.main([str(src), "-o", str(out)]) == 0
    assert (out / "pdfs" / "Song.pdf").read_bytes() == b"%PDF-1.4 fake pdf bytes"
    m = json.loads((out / "manifest.json").read_text())
    assert m["documents"]["Song.pdf"]["meta"]["title"] == "My Song"
    assert (out / "stamps" / "stamps_0.png").exists()


def test_main_rejects_non_archive_file(tmp_path):
    src = tmp_path / "junk.4sb"
    src.write_bytes(b"this is not an archive")
    with pytest.raises(SystemExit):
        x.main([str(src), "-o", str(tmp_path / "out")])


def test_main_rejects_plain_gzip_file(tmp_path):
    import gzip

    src = tmp_path / "plain.gz"
    src.write_bytes(gzip.compress(b"hello"))
    with pytest.raises(SystemExit):
        x.main([str(src), "-o", str(tmp_path / "out")])


def test_main_refuses_existing_outdir_without_force(tmp_path, sample_archive):
    src = tmp_path / "in.4sb"
    src.write_bytes(sample_archive)
    out = tmp_path / "out"
    out.mkdir()
    (out / "preexisting").write_text("x")
    with pytest.raises(SystemExit):
        x.main([str(src), "-o", str(out)])
    assert x.main([str(src), "-o", str(out), "--force"]) == 0
