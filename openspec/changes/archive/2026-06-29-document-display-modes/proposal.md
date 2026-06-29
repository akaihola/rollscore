## Why

The crop/full-page display toggle (the `z` key) was built before this project adopted OpenSpec and so never had a spec. This change retroactively documents the already-shipped behavior so there is a normative record of what the reader actually does — no behavior is being added or changed.

## What Changes

- **Documentation only — no code change.** This captures the shipped crop/full-page toggle as a spec.
- Introduce a `display-modes` capability describing the reader's two per-page display modes: the cropped (default) reading view and the full-page overview view.
- Specify the `z` key (and the toolbar button) toggling between the two modes, the cropped default on open, per-page application of the crop transform, and that the toggle state lives for the reader session but is not persisted across reopens.

## Capabilities

### New Capabilities
- `display-modes`: The reader's cropped (default) vs full-page display toggle — the per-page CSS crop transform, the `z` key / toolbar toggle, and the cropped-on-open default.

### Modified Capabilities
<!-- none -->

## Impact

- `rollscore/render.py` — `page_dimensions` returns per-page `zoom` and `trOffset` so the front-end can apply the crop transform.
- `web/js/reader.js` — `applyCropMode` (and `buildStrip`'s `.page-wrapper` wrappers) apply/clear the per-page transform and `overflow: hidden`.
- `web/js/controls.js` — `KEY_ACTIONS` maps `z` → `toggleCrop`.
- `web/js/main.js` — `openReader` holds the `cropMode` state (default cropped), wires the `z` handler and toolbar button, and re-applies on overlay creation.
- `web/index.html` — `.page-wrapper` CSS.
