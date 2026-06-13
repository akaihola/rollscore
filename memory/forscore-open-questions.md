---
name: forscore-open-questions
description: "4SB Archive container + annotation encoding SOLVED, extractor built, and the {%AUX_DIR%} `.4se` layer files decoded (raster per-layer PNGs, not vector) — all open questions answered"
metadata: 
  node_type: memory
  type: project
  originSessionId: eda0b83c-b3fb-481e-b214-23c91957b38d
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

## A working extractor now exists (built 2026-06-08)

`extract_4sb.py` in this repo (`/home/akaihola/prg/forscore`) — a standalone `uv run --script`,
stdlib-only tool, 22 passing tests, validated against the real archive. It dumps documents to
`out/pdfs/`, a restructured **lossless** `manifest.json` (`unparsed == {}` on real data),
`stamps/*.png`, `setlists.json`. See README.md for the format spec, docs/plans/ for the design.

## `.4se` layer files — SOLVED (2026-06-13)

`decode_4se.py` (repo root) decodes a `.4se`: gunzip → NSKeyedArchiver bplist → resolve graph.
**Result: `.4se` is RASTER, not vector.** Each page `.4se` is a `scoreLayers`/`layers` graph of
named annotation layers, and every layer's `image` is a full-page RGBA **PNG** — scanning all
`$objects` across all 62 files for any non-PNG payload returned **0** stroke-geometry blobs. A
page = a document-wide named layer (`Fingerings`, stable `layerID` from `…|template.4se`) +
page-local `Layer 1`. `alpha_composite` of the visible layers == the flat `aux/<file>|<page>.png`
overlay **pixel-for-pixel**; the flat overlay is the superset (125 overlay PNGs vs 50 `.4se`).
Manifest inline vector `ink` (`bluePoints`) exists for only **1/125** annotated pages. So:
**vector annotations are not recoverable from the archive** — ship raster `aux/*.png` overlays for
the web-app MVP; `.4se` decode is only worth it for a per-layer show/hide toggle (compositing
PNGs). See [docs/feature-coverage.md#4se-decode-result] and BACKLOG.md.

## Overlay REGISTRATION — corrected via forScore ground-truth export (2026-06-13)

`aux/<file>|<page>.png` is a fixed **2160×2824** canvas (=612×800 pt, aspect 0.7649) constant
across all pages regardless of MediaBox. **It is NOT raw-page-box aligned.** Ground truth: a
forScore "annotated PDF (standardized aspect)" export of `4 La Maja y el Ruisenor` — the aux PNG
is **pixel-identical** to the export's baked annotations, and the export's content scale equals
the manifest **per-page `zoom`** on all 6 pages (1.18/1.11/1.10/1.08/1.12/1.10). ⟹ the overlay
lives in forScore's **cropped/zoomed display space** (per-page `zoom`+`offset` applied, then
placed in the standardized-aspect canvas). **Composite the overlay onto the CROPPED page render
(needs manifest `zoom`/`offset`), NOT the raw page box; do not "composite then crop."** All
archive rasters (aux PNG *and* `.4se` layer PNGs) are crop-baked → re-cropping/uncropping is
lossy. The earlier "aspect-fit raw MediaBox, no manifest needed" conclusion was eyeball-only and
WRONG; corrected in [docs/feature-coverage.md#overlay-registration]. Both forScore export modes
(standardized 612×800 AND "native dimensions" 612×792) bake the crop zoom — aspect choice only
changes the output page box, so **no uncropped-annotations export exists**. Overlay is
**top-left anchored** in the canvas (8pt gap at bottom); native cropped view = overlay's top
792/800. Still open: closed-form page→cropped-view transform from `rect`/`offset`/`trOffset`/
`zoom` (horizontal `t ≈ −0.8·trOffset_x`, not fully pinned).

## (orig) NEW open question — second placeholder `{%AUX_DIR%}/` and `.4se` layer files (found 2026-06-08)

The real archive has **258 document entries, not ~71**: only ~71 are `{%DOCUMENTS_DIR%}/*.pdf`;
**~187 are `{%AUX_DIR%}/` auxiliary assets** the extractor now routes to `out/aux/`. These are
**rendered page PNGs** plus **`.4se` files**. Unknown: are `.4se` files ForScore's real
per-score **editable annotation-layer** format (richer than the manifest's `bluePoints`/
`textAnnotations`)? If so they may be the key to faithful annotation rendering/round-trip.

**Framing identified (2026-06-13):** each `.4se` is **gzip → `bplist00`** (NSKeyedArchiver);
`…|template.4se` = per-document layer template. In `out/`, manifest ink is near-empty
(1/70 docs inline `ink`, 4/70 `textAnnotations`) while `aux/` holds 62 `.4se` + 125 RGBA
full-page **transparent overlay PNGs** — i.e. the real annotations live in `.4se` + the
raster overlays, not the manifest. Still open: decode the NSKeyedArchiver graph to stroke
geometry. Web-app impact + an MVP feature/data coverage matrix are written up in this repo's
[docs/feature-coverage.md]; raster overlays are the easy MVP path, `.4se` vector decode is
phase 2. Tracked in BACKLOG.md.
