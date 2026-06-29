## 1. Confirm shipped behavior against the code

- [x] 1.1 Read `docs/plans/2026-06-13-gaze-scroll-web-app-design.md` and `docs/plans/2026-06-13-gaze-scroll-web-app-mvp.md` for the agreed rendering / chooser / controls behavior.
- [x] 1.2 Read `docs/notes/gaze-spike.md` for the webcam-gaze GO verdict feeding `design.md`.
- [x] 1.3 Confirm rendering against `rollscore/render.py` (`render_page_image`, `transform_overlay`, `render_cached`, `page_dimensions`) and `rollscore/ingest.py` (`mtime_token`).
- [x] 1.4 Confirm the chooser / navigation against `rollscore/library.py`, `rollscore/app.py` (`/api/library`), `web/js/chooser.js`, and `web/js/reader.js` (`pieceJumpPage`, `onScoreEnd`).
- [x] 1.5 Confirm the control surface against `web/js/controls.js` (`KEY_ACTIONS`, `tapAction`), `web/js/main.js` (gaze pause, resume), and `rollscore/state.py` (resume persistence).

## 2. Author the capability specs

- [x] 2.1 Write `specs/score-rendering/spec.md`: per-page composite render, continuous vertical strip, archive-mtime-keyed PNG cache, page-dimensions API.
- [x] 2.2 Write `specs/setlist-navigation/spec.md`: library chooser model, setlist + composer browse, open score/piece, next/previous piece, no auto-advance.
- [x] 2.3 Write `specs/reader-controls/spec.md`: keyboard control surface (excluding `z`), tap zones, gaze on/off toggle, resume-position persistence.
- [x] 2.4 Give every requirement at least one `#### Scenario:` in present-tense normative language.

## 3. Capture rationale

- [x] 3.1 Fold the `docs/notes/gaze-spike.md` GO verdict and its measured result into `design.md` as the reason the MVP reader was built vertical-only with heavy smoothing.

## 4. Validate

- [x] 4.1 Run `openspec change validate document-mvp-reader` and resolve any errors.
