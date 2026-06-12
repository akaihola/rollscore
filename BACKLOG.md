# Backlog — future features

Open work, roughly priority-ordered. Status: `[ ]` open · `[~]` in progress · `[x]` done.

## Extractor

- [x] **Raw lossless extractor** — dump original documents + restructured `manifest.json`
  + stamps + setlists from a `.4sb` Archive. Stdlib-only runtime. See
  [docs/plans/2026-06-08-4sb-extractor.md](docs/plans/2026-06-08-4sb-extractor.md).

## Reverse-engineering (next)

- [ ] **Investigate `{%AUX_DIR%}/` `.4se` layer files.** The real archive holds ~187
  auxiliary entries (now extracted to `out/aux/`): rendered page PNGs **and `.4se`
  files**. Open question: are `.4se` files ForScore's real per-score **editable
  annotation-layer** format — potentially richer/more faithful than the manifest's
  `bluePoints`/`textAnnotations`? If so they may be the key to high-fidelity rendering
  and round-trip. **Framing identified (2026-06-13):** each `.4se` is **gzip → `bplist00`**
  (NSKeyedArchiver); `…|template.4se` is the per-document layer template. Manifest ink is
  near-empty (1/70 docs inline `ink`, 4/70 `textAnnotations`), so `.4se` + the rasterized
  `aux/*.png` overlays are where the real annotations live. Remaining work: decode the
  NSKeyedArchiver graph to stroke geometry and compare against the manifest. See
  [docs/feature-coverage.md](docs/feature-coverage.md) for the web-app impact.

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
