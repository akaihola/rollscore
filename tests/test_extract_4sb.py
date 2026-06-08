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
