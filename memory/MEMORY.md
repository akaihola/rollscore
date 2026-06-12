# Project memory index

- [ForScore annotation extraction](forscore-annotation-extraction.md) — how ForScore stores annotations (separate, editable layers) and how to back them up / migrate off iOS to Linux without a Mac
- [ForScore 4SB format SOLVED + extractor](forscore-open-questions.md) — 4SB Archive = concatenated gzip members w/ ASCII headers (NOT zip); manifest is a bplist00 with ink/text/stamp annotations; extract_4sb.py extracts it losslessly. `.4se` layer files decoded (decode_4se.py): raster per-layer PNGs, NOT vector strokes → ship raster overlays for the web app
