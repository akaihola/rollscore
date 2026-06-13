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
| **Ink annotations — raster** | ✅ 125 pages | `aux/<file>\|<page>.png` | **MVP-core.** Transparent 2160×2824 overlay in forScore's **cropped/zoomed display space** — composite onto the *cropped* page render (needs manifest `zoom`/`offset`), not the raw page box. See [#overlay-registration](#overlay-registration). |
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
   then you're compositing PNGs, not rendering strokes. **Registration caveat:** the overlay is
   baked in forScore's per-page **cropped/zoomed** space — composite it onto the cropped page
   render (using manifest `zoom`/`offset`), not the raw page box. See
   [#overlay-registration](#overlay-registration).
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

## Overlay registration (2026-06-13) {#overlay-registration}

Verified the load-bearing MVP assumption — *can the web app composite `aux/*.png` onto the
rendered PDF page without rescaling surprises?* Measured 3 annotated pages against their PDFs
with pymupdf (`3 Preludes.pdf|2`, `4 La Maja y el Ruisenor.pdf|1`,
`Das wohltemperierte Klavier I, BWV 846-869 (Bach) Peters 1963.pdf|11`).

**The overlay is a fixed canvas, not a page-box render.** All three overlays are exactly
2160×2824 px (aspect 0.7649) even though the three PDF MediaBoxes have *different* aspects
(618×848 = 0.729, 612×792 = 0.773, 334.56×473.88 = 0.706). So you **cannot** assume
"overlay px == page box × UIScale," and a naive full-frame stretch onto the page box
mis-registers annotations.

> ⚠️ **CORRECTION (2026-06-13, after obtaining a forScore ground-truth export).** The first
> pass below concluded the overlay aspect-fits the **raw MediaBox** and needs *no* manifest
> data. A forScore-exported annotated PDF proved that **wrong**: the overlay sits in the
> **per-page cropped/zoomed display space**, so registration **does** need the manifest crop
> fields. The corrected model is in *"Ground truth"* below; the aspect-fit paragraph is kept
> only as the (superseded) first hypothesis.

**First hypothesis (SUPERSEDED — eyeball only, no ground truth).** Aspect-fit the raw page box
into the canvas: `s = min(2160/W_pt, 2824/H_pt)`, centered letterbox `ox/oy`, crop the overlay
to the page sub-rect. Measured letterbox 3 Preludes `ox=51`, La Maja `oy=14`, Bach `ox=83`;
red-tinted composites *looked* aligned on **center-of-page** marks. The flaw: I only checked
near-center annotations, where the error below is smallest, and had no ground truth to expose
it. **Do not use this model.**

**Ground truth — forScore "annotated PDF" export (`4 La Maja y el Ruisenor`, all 6 pages).**
Exporting at *standardized aspect ratio* yields 612×800 pt pages (aspect 0.7650 = the canvas
aspect, **not** the original 612×792) with annotations flattened into the page (Quartz
PDFContext, `annots=[]`). Two measurements settle the model:

1. **The overlay is pixel-identical to the export's baked annotations.** Render the export at
   2160×2824 and overlay `aux/...|1.png` (tinted): every red mark lands exactly on the export's
   black baked mark. So `aux/*.png` *is* forScore's standardized-canvas render — same coordinate
   space as the export.
2. **The export bakes the per-page crop zoom.** Measured content scale (export ink-bbox ÷
   original ink-bbox) equals the manifest `zoom` for every page:

   | page | manifest `zoom` | measured scale |
   |---|---|---|
   | 1 | 1.1817 | 1.182 |
   | 2 | 1.1073 | 1.107 |
   | 3 | 1.1036 | 1.105 |
   | 4 | 1.0813 | 1.082 |
   | 5 | 1.1193 | 1.119 |
   | 6 | 1.1038 | 1.104 |

   The page is **zoomed by the user's per-page `zoom` and shifted by `offset`/`trOffset`** before
   being placed in the standardized canvas — *then* the canvas-aspect letterbox applies. Both
   transforms compose.

**Corrected registration model.** The overlay's coordinate space is *forScore's standardized
display canvas with the per-page crop already applied.* To composite the overlay onto a page you
must render that page **through the same per-page crop** (`zoom`, `offset`/`trOffset`, `rect`)
into the 2160×2824 / 612×800-pt canvas, then drop the overlay on **1:1**. Registration is **not**
MediaBox-only — it needs the manifest crop fields.

**Consequences for the web app (revised):**

- The overlay **already encodes the crop**. Do **not** "composite on the full page box, then
  apply the crop viewport" (the earlier plan) — that double-applies nothing and mis-registers,
  because the overlay was never in raw-page space. Instead: render the cropped/zoomed page view,
  then overlay the aux PNG scaled to that view. **Composite onto the crop, not the page box.**
- This is *good* news for the MVP: the cropped view is MVP-core anyway, and the overlay drops
  straight onto it. The overlay is literally forScore's own rendered view.
- **Limitation — the raster is crop-baked.** Every raster in the archive (aux PNG *and* the
  `.4se` layer PNGs, which composite to the same pixels) is rendered at the user's per-page crop.
  Showing annotations on an **uncropped** page, or under a **different** crop (e.g. a "best fit"
  display mode), requires inverting the crop on the raster — lossy, and anything the user drew
  outside the crop is simply absent from these rasters. Crop-independent annotation data exists
  only as manifest vector `ink`/`bluePoints` (1 page) and `textAnnotations` (4 pages).
- **Canvas anchoring resolved (top-left).** A second ground truth — the *native-dimensions*
  export (612×792, see below) — sits at the **top-left** of the standardized canvas (612×800)
  with the 8 pt surplus entirely at the **bottom** (vertical/horizontal offset 0 pt, corr
  0.997/0.999). So the overlay is **top-left anchored**, gap at bottom — matching the KB's "left
  and right side *or bottom*." The clean web-app frame is the native cropped view: it is the
  overlay's top `792/800` (drop the bottom 8 pt ≈ 28 px of the 2824), at 1:1. Confirmed by
  compositing the aux PNG onto the native export — annotations land exactly.
- **Still open:** derive the closed-form page→cropped-view transform from `rect`/`offset`/
  `trOffset`/`zoom`. Per-page it's `~zoom·x + t`; horizontal `t` tracks `−0.8·trOffset_x` on the
  clean pages but the full decomposition (scale pivot, `offset` vs `trOffset` roles) isn't pinned
  yet. Until then, match forScore's crop empirically per page.

**Vendor corroboration (forScore KB, 2026-06-13 web research).** forScore's "Standard" display
mode "uses a common aspect ratio across all devices … even if doing so creates **gaps on the
left and right side or bottom of the page**" ([Understanding Display Modes](https://forscore.co/kb/understanding-display-modes/))
— that fixed-aspect canvas is the 2160×2824 overlay. forScore 12+ exposes the framing choice on
export: "forScore's **standardized aspect ratio**" *vs* "the **original file's native
dimensions**" — a per-share option behind the **… (ellipsis)**, not a prompt
([Sharing scores](https://forscore.co/kb/sharing-scores/), [forScore 12](https://forscore.co/twelve/),
[12.0 User Guide](https://forscore.co/forScore12-0.pdf)). We measured **both**: the *native
dimensions* export is 612×792 (the original page box) but **still bakes the per-page crop zoom**
(content scale = `zoom` on all 6 pages, same as the standardized export). So the aspect choice
changes only the **output page box**, not whether the crop is applied — *every* annotated export
is the user's cropped view. There is therefore **no forScore export of annotations on the
uncropped page**; the raw-page-box mapping I expected does not exist. Since iOS 11 forScore
renders annotations via Apple **PDFKit** and flattens layers on save
([10.3 PDF Annotations](https://forscore.co/10-3-pdf-annotations/)), consistent with the aux PNG
being a raster flatten of the current cropped view.

**Prior art: none found.** Web research (forScore forums, GitHub, Reddit, MobileSheets/Newzik
migration) turned up **no** third-party reverse-engineering of `.4sb`/`.4se`/AUX overlay
registration. [JeffRocchio/forScoreMigration](https://github.com/JeffRocchio/forScoreMigration)
explicitly skips annotations; only generic NSKeyedArchiver parsers exist
([ccl-bplist](https://github.com/cclgroupltd/ccl-bplist), [bpylist2](https://pypi.org/project/bpylist2/)).
This repo's extractor + decoder + this registration analysis appear to be novel; the only
authoritative external source is forScore's own KB above.

## Next steps (not yet done)

- [x] Prototype a `.4se` decoder — **done**, see above. Verdict: `.4se` is raster, not vector.
- [x] Confirm `aux/*.png` overlay registration — **done** (forScore export ground truth), see
      [#overlay-registration](#overlay-registration). Verdict: the overlay is a fixed 2160×2824
      canvas in forScore's **per-page cropped/zoomed display space** (content scale == manifest
      `zoom`, verified all 6 La Maja pages; aux PNG pixel-matches forScore's own export).
      Composite onto the **cropped page render**, not the raw page box — registration **needs**
      the manifest crop fields. (Earlier MediaBox-only conclusion was wrong, now corrected.)
- [x] Decide annotation strategy — **raster overlay** for the MVP (see decode result above).
- [x] Get a second ground truth (native-dimensions export) — **done**. Result: native dims
      (612×792) **also** bakes the crop; overlay is **top-left anchored** in the canvas (gap at
      bottom). No uncropped-annotations export exists. See [#overlay-registration](#overlay-registration).
- [ ] Derive the closed-form page→cropped-view transform from `rect`/`offset`/`trOffset`/`zoom`
      (per-page ≈ `zoom·x + t`; horizontal `t ≈ −0.8·trOffset_x`, full decomposition unpinned).
      Until then, match forScore's crop empirically per page.

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
