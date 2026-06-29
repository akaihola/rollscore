## 1. Container parsing

- [x] 1.1 Parse each entry's ASCII header into `(path_len_bytes, comp_len, path)`, stripping the leading `<--4SBV03-->` magic on entry 1 and decoding the path as the last `path_len` UTF-8 bytes (`parse_entry_header`).
- [x] 1.2 Walk the concatenated `[ASCII header][gzip member]` entries by scanning for the gzip magic `1f 8b 08`, gzip-decompressing each member and tracking bytes consumed (`iter_entries`).
- [x] 1.3 Reject inputs that do not start with the `<--4SBV03-->` magic (`main`).

## 2. Manifest restructuring

- [x] 2.1 Restructure the flat `bplist00` manifest dict into nested `{documents, system, setlists, stamps, unparsed}`, routing every key so nothing is dropped (`restructure_manifest`).
- [x] 2.2 Parse CGPoint/CGRect geometry strings for `rect`/`offset`/`trOffset` page props (`parse_geometry`).
- [x] 2.3 Parse `&BLU;`/`&ORG;`-delimited inline ink point strings losslessly (raw + tagged tokens) (`parse_ink`).

## 3. Lossless extraction outputs

- [x] 3.1 Write archived documents byte-for-byte, routing `{%DOCUMENTS_DIR%}/` entries to `pdfs/` and `{%AUX_DIR%}/` entries (per-page annotation layers) to `aux/`, NFC-normalizing names and rejecting path traversal (`write_document`).
- [x] 3.2 Write stamp PNG bytes to `stamps/*.png` and replace them with `{"_png": path}` refs (`write_outputs`).
- [x] 3.3 Serialize `manifest.json` (sans setlists) and `setlists.json`, rendering datetimes as ISO-8601 (`write_outputs`).

## 4. CLI

- [x] 4.1 Provide a CLI taking an archive path, `-o/--out` (default `out`), and `--force`, refusing to clobber a non-empty output dir without `--force` (`main`).
- [x] 4.2 Warn when a header's declared compressed length disagrees with the bytes actually read; print an extraction summary on success (`main`).

## 5. Tests

- [x] 5.1 Unit tests against a synthetic in-memory archive plus an opt-in smoke test that round-trips the real archive (skipped when absent).
