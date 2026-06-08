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


def test_parse_ink_keeps_raw_and_tags_markers():
    out = x.parse_ink(["0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"])
    assert out[0]["raw"] == "0.1&BLU;0.2&BLU;0&ORG;0.3&ORG;0.4&ORG;1"
    assert out[0]["tokens"][0] == {"marker": "start", "value": 0.1}
    assert out[0]["tokens"][2] == {"marker": "BLU", "value": 0.0}
    assert out[0]["tokens"][3] == {"marker": "ORG", "value": 0.3}
