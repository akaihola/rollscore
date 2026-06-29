## 1. Confirm shipped behavior against the code

- [x] 1.1 Read `docs/plans/2026-06-21-crop-toggle.md` as the design source of truth.
- [x] 1.2 Confirm the `z` → `toggleCrop` binding in `web/js/controls.js` `KEY_ACTIONS`.
- [x] 1.3 Confirm `applyCropMode` in `web/js/reader.js` applies/clears the per-page transform and `overflow: hidden`.
- [x] 1.4 Confirm `openReader` in `web/js/main.js` defaults `cropMode` to cropped and that the state is a session-local variable (no store/localStorage persistence).
- [x] 1.5 Confirm `page_dimensions` in `rollscore/render.py` returns per-page `zoom` and `trOffset`.

## 2. Author the capability spec

- [x] 2.1 Write the `display-modes` delta spec with requirements for the cropped default view, the full-page overview view, the `z` toggle, per-page application, and session-scoped (non-persistent) toggle state.
- [x] 2.2 Give every requirement at least one `#### Scenario:` in present-tense normative language.

## 3. Validate

- [x] 3.1 Run `openspec change validate document-display-modes` and resolve any errors.
