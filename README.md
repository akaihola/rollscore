# forscore-archive

Reverse-engineering and extraction of ForScore's `.4sb` **Archive** backup format, so
sheet-music PDFs **and** their annotations can be recovered on Linux — no Mac, no jailbreak,
no ForScore install. Reverse-engineered from a real 151 MB Archive on 2026-06-07.

See [memory/forscore-annotation-extraction.md](memory/forscore-annotation-extraction.md) for
the wider context (how ForScore stores data, backup strategy, destination apps) and
[memory/forscore-open-questions.md](memory/forscore-open-questions.md) for the research trail.

## The `4SBV03` container format

> Not a ZIP (a common web claim — wrong) and no SQLite file. The container is a flat,
> linear concatenation of entries; each entry is a fixed-width ASCII header immediately
> followed by a single **gzip** member. There is no central directory or index.

```
<--4SBV03-->          31        404337Archive 2026-06-07 23-15-54.4sb<gzip…>
                      30        137345{%DOCUMENTS_DIR%}/Vocalise.pdf<gzip…>
                      34      27076659{%DOCUMENTS_DIR%}/Works vol. 1.pdf<gzip…>
                      … one entry per document …
```

- **Header** = space-padded decimal `[path-byte-length] [gzip-compressed-byte-length] [path]`.
  Only the **first** entry is prefixed with the magic literal `<--4SBV03-->`; later entries
  begin directly at the numbers.
- **Entry 1** — path is the archive's own filename; its gzip payload is a **binary plist**
  (`bplist00`): the whole-library manifest (metadata + annotations + app settings).
- **Entries 2…N** — the document files themselves (real `%PDF-…`, MIDI `MThd`, …), each
  individually gzip-compressed, with paths like `{%DOCUMENTS_DIR%}/Name.pdf`.

Parse robustly by scanning for the gzip magic `1f 8b 08`; the bytes before each member are
its ASCII header. (`gzip.decompress()` fails — it trips over the text header after member 1;
use `zlib.decompressobj(31)` and read `unused_data` to find the next boundary.)

## Annotation encoding (manifest `bplist00`, entry 1)

A single **flat dict** (~2300 keys for this library); keys are pipe/namespace-delimited paths.
No raw binary annotation blobs — everything is structured strings / lists / dicts:

| Data | Key pattern | Encoding |
|------|-------------|----------|
| Freehand ink | `file.pdf&BLU;<pg>&BLU;bluePoints` | list of normalized stroke points `x&BLU;y&BLU;idx&ORG;…` (vector, recoverable) |
| Text boxes | `file.pdf\|<pg>\|textAnnotations` | dicts: `text`, `fontFace/Size/Color/Weight`, normalized `origin.x/y`, `size.x/y`, `layerID` UUID, `layerVisible` |
| Stamps | `stamps.plist` / `stamps2.plist` | list of **PNG bytes** (`\x89PNG…`) |
| Crop / view | `…\|rect`, `\|offset`, `\|trOffset`, `\|zoom`, `\|half`, `\|rotation`, `\|croppedLandscape` | stringified `CGRect`/`CGPoint` + scalars |
| Bookmarks | `file.pdf\|bookmarks` | dicts: Title, Composer, First/Last Page, Identifier UUID, Label, BPM, Key |
| Score metadata | `file.pdf\|title`/`composer`/`genre`/`keywords`/`added`/`printNumber`/`version`/`difficulty`/`labels`/`pitch`/`key` | scalars / datetime |
| Setlists | `&SYS;setlists` → `&SET;<name>` | ordered lists of filenames |
| App settings | ~90 `&SYS;…` keys | brushes, ruler, tuner, metronome, pen presets, … |

## Status

- [x] Container format decoded (`4SBV03`)
- [x] Annotation encoding decoded (manifest `bplist00`)
- [ ] Extractor script — dump original PDFs + export annotations (planned next)
