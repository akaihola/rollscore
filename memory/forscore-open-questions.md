---
name: forscore-open-questions
description: RESOLVED — the 4SB Archive container format and annotation encoding, reverse-engineered from a real Archive on 2026-06-07
metadata:
  type: project
---

# ForScore 4SB Archive format — SOLVED (2026-06-07)

Context: see [[forscore-annotation-extraction]]. All four open questions below were
answered by inspecting a real `Archive 2026-06-07 23-15-54.4sb` (151 MB) on Linux.
**The container is NOT a ZIP** (the search-engine claim was wrong) and there is **no
SQLite file** in this backup format — annotations live in a binary plist manifest.

## Container format `4SBV03`

A flat concatenation of entries; each entry = `<fixed-width ASCII header><gzip member>`.
No central directory, no index — you walk it linearly. Parse robustly by scanning for the
gzip magic `1f 8b 08`; the bytes before each gzip member are that member's text header.

- **Header fields** (decimal, right-justified ASCII, space-padded): `[pathByteLength][gzipCompressedByteLength][path]`.
  Only the **first** entry is prefixed with the magic literal `<--4SBV03-->`; later entries
  start straight at the padded numbers. Example entry-2 header:
  `'              30          137345{%DOCUMENTS_DIR%}/Vocalise.pdf'` → path len 30,
  compressed len 137345 bytes.
- **Entry 1** path = the archive's own filename; its gzip payload is a **binary plist**
  (`bplist00`) = the whole library manifest (metadata + annotations + settings).
- **Entries 2..N** = the actual document files, gzip-compressed, paths like
  `{%DOCUMENTS_DIR%}/Name.pdf`. Payloads are real `%PDF-…`, MIDI (`MThd`), etc.

Extract/decompress with Python:
```python
import zlib
blob = open(path,'rb').read(); pos = 0
while (g := blob.find(b'\x1f\x8b\x08', pos)) >= 0:
    d = zlib.decompressobj(31)            # wbits=31 = gzip
    out = d.decompress(blob[g:]) + d.flush()
    consumed = len(blob) - g - len(d.unused_data)
    header = blob[pos:g]                  # ASCII: lengths + path
    pos = g + consumed                    # next entry
```
(`gzip.decompress()` fails here — it chokes on the text header after the first member.)

## Annotation encoding (manifest bplist00, entry 1)

A single **flat dict**, ~2300 keys, keys are pipe/namespace-delimited paths. No raw
binary annotation blobs at top level — everything is structured strings/lists/dicts:

- `file.pdf|<page>|rect` / `|offset` / `|trOffset` — stringified CGRect/CGPoint, e.g.
  `'{{13.46, 2.0}, {723.3, 945.6}}'` (crop rect / page & title-region offsets).
- `file.pdf|<page>|zoom` `|half` `|rotation` `|croppedLandscape` — view state.
- **Freehand ink:** `file.pdf&BLU;<page>&BLU;bluePoints` → list of strings of normalized
  stroke points delimited by `&BLU;`/`&ORG;`, e.g. `'0.734150&BLU;0.720768&BLU;29&ORG;…'`.
  So **freehand strokes ARE recoverable** (vector points, not bitmaps).
- **Text annotations:** `file.pdf|<page>|textAnnotations` → list of dicts
  (`text`, `fontFace`, `fontSize`, `fontColor`, `fontWeight`, normalized `origin.x/y`,
  `size.x/y`, `layerID` UUID, `layerVisible`).
- **Stamps:** `stamps.plist` / `stamps2.plist` → list of **PNG image bytes** (`\x89PNG…`).
- `file.pdf|bookmarks` → list of dicts (Title/Composer/First Page/Last Page/Identifier UUID/Label/BPM/Key).
- Per-score metadata keys: `|title` `|composer` `|genre` `|keywords` `|added`(datetime)
  `|printNumber` `|version` `|difficulty` `|labels` `|pitch` `|key`.
- Setlists: `&SYS;setlists` → `['&SET;Osaan', '&SET;Treenaan', '&SET;Luen']`; each
  `&SET;<name>` key → ordered list of filenames.
- App settings: ~90 `&SYS;…` scalar keys (brushes, ruler, metronome, tuner, pen presets, …).

## Practical upshot

A 4SB **Archive** is fully parseable on Linux with stdlib only (zlib + plistlib): you can
extract every original PDF, and read/convert annotations (ink as normalized vector points,
text boxes, stamps as PNG) — no Mac, no jailbreak, no ForScore needed. This supersedes the
"vendor-undocumented, no tool parses it" caveat in [[forscore-annotation-extraction]] for
the Archive variant specifically.
