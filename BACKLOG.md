# Backlog — future features

Open work, roughly priority-ordered. Status: `[ ]` open · `[~]` in progress · `[x]` done.

## Extractor

- [x] **Raw lossless extractor** — dump original documents + restructured `manifest.json`
  + stamps + setlists from a `.4sb` Archive. Stdlib-only runtime. See
  [docs/plans/2026-06-08-4sb-extractor.md](docs/plans/2026-06-08-4sb-extractor.md).

## Reverse-engineering (next)

- [x] **Investigate `{%AUX_DIR%}/` `.4se` layer files.** Decoded 2026-06-13 with
  [`decode_4se.py`](decode_4se.py). Each `.4se` is **gzip → `bplist00`** (NSKeyedArchiver)
  holding a `scoreLayers`/`layers` graph of named annotation layers — but **every layer is a
  rasterized full-page PNG, NOT vector strokes** (0 non-PNG payloads across all 62 files). A
  page has a document-wide named layer (`Fingerings`, stable `layerID` from `…|template.4se`)
  plus a page-local `Layer 1`; `alpha_composite` of the visible layers equals the flat
  `aux/<file>|<page>.png` overlay pixel-for-pixel, and the flat overlay covers more pages
  (125) than the `.4se` files do (50). **Verdict: `.4se` is NOT a richer/vector format** — its
  only added value is the per-layer split (a layer-toggle UI). Vector ink is unrecoverable from
  the archive (manifest inline `ink` exists for 1/125 annotated pages). Full write-up in
  [docs/feature-coverage.md](docs/feature-coverage.md#4se-decode-result).

- [x] **Overlay registration solved (raster path).** Verified against forScore ground-truth
  exports: `aux/*.png` is crop-baked — it lives in forScore's per-page cropped/zoomed display
  space, **top-left anchored** in the 2160×2824 standardized canvas. Composite onto the cropped
  page render (manifest `zoom`/`offset`), **not** the raw page box. Both export modes
  (standardized + native dimensions) bake the crop → no uncropped-annotations export exists.
  **Open:** closed-form `rect`/`offset`/`trOffset`/`zoom` → cropped-view transform (horizontal
  shift ≈ `−0.8·trOffset_x`, not fully pinned). Full write-up in
  [docs/feature-coverage.md](docs/feature-coverage.md#overlay-registration).

## Web app — gaze-scroll score reader

- [ ] **Build the gaze-scroll score reader web app.** Design agreed 2026-06-13, see
  [docs/plans/2026-06-13-gaze-scroll-web-app-design.md](docs/plans/2026-06-13-gaze-scroll-web-app-design.md).
  Personal localhost tool: thin browser front-end + FastAPI/pymupdf backend reusing
  `extract_4sb.py`; ingests a `.4sb` or pre-extracted `out/`; lazily renders per-page crop +
  raster overlay composite (cached PNGs, empirical crop for now); chooser by setlist +
  composer-sorted list with bookmark/piece jump and resume position; webcam **read-position
  follower** auto-scroll (vertical-only, smoothed, on-music gated, coast-then-freeze) behind a
  `GazeSource` abstraction; keyboard + tap-zone controls; per-session calibration. Next steps:
  (1) **webcam gaze-accuracy spike** (make-or-break risk), then (2) implementation plan via
  `superpowers:writing-plans`. Deferred within this effort: foot pedal, search/metadata
  filtering, setlist auto-advance, smarter/persistent calibration.

## Rendering (future)

- [ ] **Render annotations onto PDFs (flattened export).** Bake the extracted annotation
  layers back onto copies of the original PDFs so the marked-up music is viewable and
  printable on Linux without ForScore. This is a substantial addition — it needs a PDF
  engine (`pikepdf` for page geometry + `reportlab`/`pymupdf` for an overlay) and a
  coordinate mapper, because ForScore stores positions **normalized** (0–1 of page
  width/height) rather than in PDF points. Sub-parts:
  - [ ] Map normalized `origin`/`size`/`rect` → PDF user-space using each page's MediaBox.
  - [ ] Render freehand **ink** strokes (`bluePoints`: `&BLU;`/`&ORG;` point lists) as
        smoothed polylines/beziers with the stored brush color & width (`&SYS;penPresets`).
  - [ ] Render **text annotations** (font face/size/color/weight, position).
  - [ ] Composite **stamps** (PNG) at their placements.
  - [ ] Honor `layerVisible`, page rotation, and `croppedLandscape`/crop `rect`.
  - Runtime deps then move into the script's PEP 723 inline metadata.

## Nice-to-have

- [ ] Per-document `--only "Name.pdf"` filter for fast single-score extraction.
- [ ] `--list` mode: print the entry table (path, sizes) without extracting.
- [ ] Verify/repair: detect truncated or out-of-order members.
- [ ] Support the single-score `.4sc` container (likely the same `4SBV0x` framing — confirm).

## Hardening (deferred)

- [ ] **Strict JSON output.** `json.dumps` currently emits bare `Infinity`/`NaN` for
  non-finite floats (valid for Python's decoder, not strict JSON). Consider
  `allow_nan=False` if strict output is ever needed. (Implausible in normalized
  ink/geometry data.)
- [ ] **Replace `assert` in `parse_entry_header`.** It uses `assert` for structural
  header validation; under `python -O` asserts are stripped and a malformed header
  would fail with a less clear error. Consider raising `ValueError` instead, now that
  `main` exposes this path to arbitrary input files.
