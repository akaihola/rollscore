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
  - `aux/<file>|<page>.4se` — 62 files, **gzip → `bplist00`** (NSKeyedArchiver). The vector
    annotation layer source. `…|template.4se` is the per-document layer template.
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
| **Ink annotations — vector** | ⚠️ partial | `aux/*.4se` (NSKeyedArchiver bplist) — **needs a decoder** | **High effort.** Defer; use raster overlays for MVP. Pairs with the "annotation tools" stretch goal. |
| **Ink annotations — raster** | ✅ 125 pages | `aux/<file>\|<page>.png` | **MVP-core, easy.** Transparent full-page overlay at the page rect → instant annotations-on-cropped-page. |
| **Text annotations** | ✅ 4 docs | `pages[].textAnnotations` (origin, size, font, color, `layerID`, `layerVisible`) | MVP-easy — positioned HTML text boxes. |
| **Annotation layers** | ✅ | `layerID`/`layerVisible` on text; `template.4se` per doc | Medium — layer show/hide toggle. |
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
2. **The annotation fork is the main decision.** Rasterized `aux/*.png` overlays give correct
   annotations on day one with near-zero parsing. The `.4se` vector layers
   (NSKeyedArchiver bplist) are decode-heavy. **Recommend: ship raster overlays for the MVP
   viewer; treat `.4se` decoding as phase 2** (and bundle it with editable "annotation tools").
3. **Setlists/playsets are trivial** — already clean JSON in `setlists.json`.

## Next steps (not yet done)

- [ ] Prototype a `.4se` decoder: gunzip → NSKeyedArchiver plist → stroke geometry, to scope
      whether vector annotations are viable for the web app. (Open question carried from
      [../memory/forscore-open-questions.md](../memory/forscore-open-questions.md).)
- [ ] Confirm `aux/*.png` overlays are pixel-aligned to the PDF page box (so they can be
      composited at the page rect without rescaling surprises).
- [ ] Decide annotation strategy (raster overlay vs. vector decode) for the MVP.

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
