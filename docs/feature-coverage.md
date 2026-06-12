# forScore feature ↔ archive coverage matrix

Decision tool for scoping the web-app MVP. Maps each end-user-facing forScore feature to
**(a)** whether the data backing it is present in an extracted archive (`out/`), **(b)** where
that data lives, and **(c)** the recommended web-app priority.

- forScore feature inventory: sourced from forScore's official docs/KB/App Store listing
  (see "Sources" below). Adversarial cross-verification was rate-limited during research, so
  treat the feature list as **vendor-documentation-sourced** (high trust) rather than
  independently triangulated.
- Archive facts: measured directly against the example extraction in `out/` on 2026-06-13
  (70 documents). For the container/manifest format itself see [../README.md](../README.md).

## What an extraction (`out/`) actually contains

```
out/
  manifest.json     # {documents, stamps, system, unparsed}
  setlists.json     # named, ordered playlists
  pdfs/             # 70 original PDFs
  aux/              # per-page annotation layers (the {%AUX_DIR%} data)
  stamps/           # 104 rasterized stamp PNGs
```

- **`manifest.json.documents`** — object keyed by title; each `{meta, pages}`.
  - `meta` keys seen: `title, composer, genre, key, pitch, difficulty, labels, keywords,
    bookmarks, added, printNumber, version`.
  - `pages` is an object keyed by page number; per-page keys seen across the library:
    `offset, zoom, trOffset, rect, rotation, croppedLandscape, half, ink, textAnnotations`.
- **Annotation reality (important).** Ink is **mostly not inline in the manifest** — only
  1/70 docs carries inline `ink`, 4/70 carry `textAnnotations`. The real annotation data is
  in **`aux/`**:
  - `aux/<file>|<page>.png` — 125 files, RGBA full-page (e.g. 2160×2824) **transparent
    overlays** (rasterized render of that page's annotations).
  - `aux/<file>|<page>.4se` — 62 files, **gzip → `bplist00`** (NSKeyedArchiver). **Decoded
    2026-06-13 (`decode_4se.py`): these are NOT vector strokes** — each holds a
    `scoreLayers`/`layers` graph of named annotation layers, and every layer's `image` is a
    full-page RGBA **PNG** (already rasterized). `…|template.4se` is the per-document layer
    schema (named layers + stable `layerID`s, no images). See [#4se-decode-result](#4se-decode-result).
- **`manifest.json.stamps`** — `stamps.plist` (102 built-in) + `stamps2.plist` (2 custom);
  PNGs in `stamps/`.
- **`setlists.json`** — here 3 lists (`Luen`/`Osaan`/`Treenaan`), each an ordered array of
  `{Title, Identifier, FilePath}`.
- **`manifest.json.system`** — app-wide defaults: `halfTurns:true`, `fitMode:0`,
  `pageTransition:3`, `twoTapAction:3`, pen presets, ruler state, metronome/tuner/MIDI/pitch
  config, setlist folders/libraries.

## Coverage matrix

| forScore feature | In `out/`? | Where | Web-app priority |
|---|---|---|---|
| **Per-page crop** (pan + zoom) | ✅ 37/70 docs | `pages[].offset`, `.zoom`, `.rect`, `.trOffset` | **MVP-core.** The "user-set crop dimensions." Apply as a viewport/CSS transform on the PDF page. |
| **Page rotation** | ✅ 2/70 | `pages[].rotation` | MVP-core (cheap once the crop transform exists). |
| **Landscape crop variant** | ✅ | `pages[].croppedLandscape` | Needed for view modes 2/3 — crop differs by orientation. |
| **Half-page-turn split** | ✅ 26/70 | `pages[].half` (0–1 fraction) + system `halfTurns` | **Directly powers view mode 2.** Divider position already stored per page — read `half` as the split point. |
| **Ink annotations — vector** | ❌ not in archive | manifest inline `ink` (`bluePoints`) exists for only **1/125 annotated pages**; `.4se` is raster, not strokes | **Not viable from the archive.** Freehand ink is stored rasterized. Defer any vector path to a re-annotate-on-Linux feature, not extraction. |
| **Ink annotations — raster** | ✅ 125 pages | `aux/<file>\|<page>.png` | **MVP-core, easy.** Transparent full-page overlay at the page rect → instant annotations-on-cropped-page. |
| **Text annotations** | ✅ 4 docs | `pages[].textAnnotations` (origin, size, font, color, `layerID`, `layerVisible`) | MVP-easy — positioned HTML text boxes. |
| **Annotation layers** | ✅ | `template.4se` (named layers + `layerID`); page `.4se` carries one raster PNG per layer; `layerID`/`layerVisible` on text | Medium — layer show/hide toggle. The `.4se` gives a per-layer raster breakdown (e.g. a "Fingerings" layer) on top of the flat overlay. |
| **Stamps** | ✅ 104 | `stamps/*.png` + manifest `stamps` plists | Low for a viewer; needed only for the editor. |
| **Setlists / playsets** | ✅ | `setlists.json` (ordered `FilePath` refs) | **MVP-easy.** Maps 1:1 to "playsets." |
| **Library metadata** (composer/genre/key/difficulty/labels/keywords) | ✅ | `documents[].meta` | Low — browsing/filtering. |
| **Bookmarks / internal index** (multi-piece PDFs) | ✅ 6 docs | `meta.bookmarks` (Title, First/Last Page, Key, BPM) | Medium — needed for collection PDFs (e.g. Chopin Études). |
| **View mode 1** — vertical whole screen (cropped) | ✅ config | system `fitMode` + crop | **MVP-core.** |
| **View mode 2** — horizontal fill-width, top-to-bottom + page turn | ✅ config + data | landscape Scroll + `half` split | **MVP-core.** |
| **View mode 3** — horizontal auto-scroll / eye-tracking | ❌ no data | forScore's Reflow is content-aware system detection; **nothing in archive** | **Future/experiment.** Naive width-fill scroll first; Reflow-grade detection is a separate large effort. |
| Metronome / tuner / pitch pipe / MIDI / audio | ✅ config only | system keys | **Out of scope** for a viewer. |

## Recommendations for MVP scope

1. **The three view modes are well-backed by the data.** Crop (`offset`/`zoom`/`rect`),
   half-turn split (`half`), and landscape crop (`croppedLandscape`) are all stored per page.
   Mode 3 (Reflow / eye-tracking) has **no** archive backing — confirms it belongs in "future
   experiment."
2. **The annotation fork is decided — raster, both for MVP and beyond.** The `.4se` decode
   (below) settled the question: forScore stores freehand annotations **rasterized**, even in
   the `.4se` "layer source." There is no vector geometry to recover (1/125 annotated pages
   has inline `bluePoints`; the rest is pixels). So `aux/*.png` overlays are not just the easy
   path — they're the *faithful* path. **Ship the flat `aux/*.png` overlay for the MVP viewer.**
   Decode `.4se` only when you want the **per-layer toggle** (e.g. hide "Fingerings"), and even
   then you're compositing PNGs, not rendering strokes.
3. **Setlists/playsets are trivial** — already clean JSON in `setlists.json`.

## .4se decode result (2026-06-13) {#4se-decode-result}

Prototype: [`../decode_4se.py`](../decode_4se.py) (gzip → NSKeyedArchiver → resolve graph →
extract layer PNGs). Surveyed all 62 `.4se` in `out/aux/`:

- **No vector strokes anywhere.** Every page `.4se` is a `scoreLayers`/`layers` graph of named
  annotation layers; each layer's `image` is a full-page RGBA PNG. Scanning all `$objects` for
  any non-PNG binary payload across all 62 files returned **0** — there is no stroke geometry to
  decode. The hoped-for "vector layer source" is rasterized.
- **Two layers per page:** a document-wide named layer (here always `Fingerings`, with a stable
  `layerID` defined in `…|template.4se`) from `scoreLayers`, plus a page-local default `Layer 1`
  from `layers`. 50 page files → 100 layers, all 2160×2824.
- **The flat overlay is the composite.** `alpha_composite(Fingerings, Layer 1)` equals
  `aux/<file>|<page>.png` **pixel-for-pixel** (diff bbox `None`, per-channel max 0). The `.4se`
  adds zero pixels — only the per-layer split.
- **The flat overlay is the superset.** All 50 page `.4se` have a matching overlay PNG, but
  **75 of the 125 overlay PNGs have no `.4se`** — so the flat overlay covers more annotated pages
  than the layer files do. The overlay is the authoritative annotation render; `.4se` is a subset.
- **Manifest cross-check:** inline vector `ink` exists for **1** page (`4 Impromptus op. 90.pdf`
  p30); structured `textAnnotations` for 4 pages. Everything else is raster-only.

**Decision:** raster overlays (`aux/*.png`) for the MVP; `.4se` decode reserved for the optional
layer-toggle feature (compositing PNGs, not strokes). Vector ink is not recoverable from the
archive and belongs to a future re-annotate-on-Linux feature, not extraction.

## Next steps (not yet done)

- [x] Prototype a `.4se` decoder — **done**, see above. Verdict: `.4se` is raster, not vector.
- [ ] Confirm `aux/*.png` overlays are pixel-aligned to the PDF page box (so they can be
      composited at the page rect without rescaling surprises). Note the layer PNGs are
      2160×2824 @ `UIScale` 2.0 — i.e. a 1080×1412 point page; verify against each PDF MediaBox.
- [x] Decide annotation strategy — **raster overlay** for the MVP (see decode result above).

## Sources (forScore feature documentation)

Primary vendor docs, fetched during research:

- App Store listing — https://apps.apple.com/us/app/forscore/id363738376
- Cropping — https://forscore.co/kb/cropping/
- Display modes — https://forscore.co/kb/understanding-display-modes/
- Half-page turns — https://forscore.co/half-page-turns/
- Reflow — https://forscore.co/kb/reflow/
- Annotation — https://forscore.co/documentation/annotation/
- Annotation layers — https://forscore.co/10-4-annotation-layers/
- Annotation tools — https://forscore.co/annotation-tools/
- Design overview — https://forscore.co/about-design/
