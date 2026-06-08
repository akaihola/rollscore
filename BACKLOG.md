# Backlog — future features

Open work, roughly priority-ordered. Status: `[ ]` open · `[~]` in progress · `[x]` done.

## Extractor

- [x] **Raw lossless extractor** — dump original documents + restructured `manifest.json`
  + stamps + setlists from a `.4sb` Archive. Stdlib-only runtime. See
  [docs/plans/2026-06-08-4sb-extractor.md](docs/plans/2026-06-08-4sb-extractor.md).

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
