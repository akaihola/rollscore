# rollscore

A sheet-music reader that does away with page turns. Instead of flipping discrete pages,
rollscore renders the whole score as one continuous strip and **scrolls it for you,
automatically, from sensor input** — so your hands stay on the instrument.

The sensor today is **gaze**: a webcam tracks where you're reading on the page and the music
keeps pace with your eyes. The architecture treats the read-position signal as pluggable, so
other sensors (head pose, a foot pedal, audio-following, …) can drive the same scroll later.

It runs entirely on your own machine — a local FastAPI server plus a thin browser front-end,
no cloud, no account.

## Running the reader web app

The `rollscore` package is a local FastAPI server for reading scores. Once dependencies are
synced (`uv sync`), start it with the console script:

```bash
uv run rollscore                 # http://127.0.0.1:8765/
uv run rollscore --port 9000     # custom port
uv run rollscore --reload        # auto-reload on code changes (development)
```

Host and port also read from `ROLLSCORE_HOST` / `ROLLSCORE_PORT`; explicit flags win.
The extraction cache location is `ROLLSCORE_CACHE` (default `~/.cache/rollscore`).

> **Run it in your own shell, not via an agent.** A server an agent backgrounds lands
> in a sandboxed network namespace and is unreachable from your browser. Use your real
> terminal (in Claude Code, prefix with `!`). Browsers treat `127.0.0.1` as a secure
> context, so the webcam works there over plain HTTP — use `127.0.0.1`, not the LAN IP.

## Status

- [x] Container format decoded (`4SBV03`)
- [x] Annotation encoding decoded (manifest `bplist00`)
- [x] Extractor script — dump original PDFs + export annotations
- [x] Reader web app — continuous render, gaze-driven auto-scroll, annotation overlays

---

## forScore import compatibility

rollscore reads sheet music exported from [forScore](https://forscore.co/) (the iPad app),
so you can carry an existing annotated library over to Linux. This required reverse-engineering
forScore's `.4sb` **Archive** backup format — documents **and** their annotations — with no Mac,
no jailbreak, and no forScore install. Reverse-engineered from a real 151 MB Archive on
2026-06-07.

See [memory/forscore-annotation-extraction.md](memory/forscore-annotation-extraction.md) for
the wider context (how forScore stores data, backup strategy, destination apps) and
[memory/forscore-open-questions.md](memory/forscore-open-questions.md) for the research trail.
For the feature mapping, see [docs/feature-coverage.md](docs/feature-coverage.md) — a
forScore-feature ↔ archive-data coverage matrix with MVP scope recommendations.

### The `4SBV03` container format

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

### Annotation encoding (manifest `bplist00`, entry 1)

A single **flat dict** (~2300 keys for this library); keys are pipe/namespace-delimited paths.
No raw binary annotation blobs — everything is structured strings / lists / dicts:

| Data           | Key pattern                                                                                                         | Encoding                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Freehand ink   | `file.pdf&BLU;<pg>&BLU;bluePoints`                                                                                  | list of normalized stroke points `x&BLU;y&BLU;idx&ORG;…` (vector, recoverable)                                   |
| Text boxes     | `file.pdf\|<pg>\|textAnnotations`                                                                                   | dicts: `text`, `fontFace/Size/Color/Weight`, normalized `origin.x/y`, `size.x/y`, `layerID` UUID, `layerVisible` |
| Stamps         | `stamps.plist` / `stamps2.plist`                                                                                    | list of **PNG bytes** (`\x89PNG…`)                                                                               |
| Crop / view    | `…\|rect`, `\|offset`, `\|trOffset`, `\|zoom`, `\|half`, `\|rotation`, `\|croppedLandscape`                         | stringified `CGRect`/`CGPoint` + scalars                                                                         |
| Bookmarks      | `file.pdf\|bookmarks`                                                                                               | dicts: Title, Composer, First/Last Page, Identifier UUID, Label, BPM, Key                                        |
| Score metadata | `file.pdf\|title`/`composer`/`genre`/`keywords`/`added`/`printNumber`/`version`/`difficulty`/`labels`/`pitch`/`key` | scalars / datetime                                                                                               |
| Setlists       | `&SYS;setlists` → `&SET;<name>`                                                                                     | ordered lists of filenames                                                                                       |
| App settings   | ~90 `&SYS;…` keys                                                                                                   | brushes, ruler, tuner, metronome, pen presets, …                                                                 |

### Usage

```bash
./extract_4sb.py "Archive ….4sb" -o out      # uv run --script: auto-installs deps
uv run pytest                                 # run the tests
```

Output: `out/pdfs/` (original documents), `out/manifest.json` (restructured metadata +
annotations), `out/stamps/*.png`, `out/setlists.json`. Auxiliary assets forScore stores
alongside scores (rendered page PNGs, `.4se` layer files) land in `out/aux/`.
