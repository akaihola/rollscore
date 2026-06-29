## Why

The MVP score reader was built before this project adopted OpenSpec, so the core reader — how scores are rendered into a scrollable strip, how the chooser browses the library and navigates pieces, and the basic keyboard/tap control surface — never had specs. This change retroactively documents that already-shipped behavior so there is a normative record of what the reader actually does. No behavior is being added or changed.

## What Changes

- **Documentation only — no code change.** This captures the shipped MVP reader as three capability specs.
- Introduce `score-rendering`: lazy per-page crop + annotation-overlay composite served as a continuous vertical strip, an on-disk PNG cache keyed by the source-archive mtime token, and the page-dimensions API the front-end consumes for layout.
- Introduce `setlist-navigation`: the setlist / composer chooser, ordered playlists sourced from `setlists.json`, opening a score or piece, next/previous piece navigation, and the no-auto-advance rule at a score's end.
- Introduce `reader-controls`: the basic keyboard and tap-zone control surface (excluding the `z` crop toggle), resume-position persistence, and the gaze on/off toggle.

## Capabilities

### New Capabilities
- `score-rendering`: Lazy per-page composite render (full-page canvas + resampled annotation overlay), the continuous vertical strip, the archive-mtime-keyed PNG cache, and the page-dimensions API.
- `setlist-navigation`: The setlist + composer chooser over `setlists.json`/`manifest.json`, opening a score/piece, next/previous piece navigation, and stop-at-end (no setlist auto-advance).
- `reader-controls`: The reader's basic keyboard + invisible tap-zone controls (excluding the `z` crop toggle), resume-position persistence, and the gaze on/off toggle.

### Modified Capabilities
<!-- none -->

## Impact

- `rollscore/render.py` — `render_page_image`, `transform_overlay`, `composite_overlay`, `render_cached` (mtime-keyed cache), and `page_dimensions` (layout contract).
- `rollscore/ingest.py` — `ExtractionRoot.mtime_token` (cache key) and source resolution.
- `rollscore/library.py` — `load_library`, composer grouping, setlist resolution, bookmark parsing.
- `rollscore/state.py` — `StateStore` resume persistence.
- `rollscore/app.py` — `/api/library`, `/api/score/{file}/pages`, `/api/score/{file}/page/{n}.png`, `/api/score/{file}/resume`.
- `web/js/reader.js` — `buildStrip`, `scaledHeights`/`pageToScroll`/`computeResumeScroll`/`scrollToResume`, `throttle`, `onScoreEnd`, `pieceJumpPage`.
- `web/js/chooser.js` — `buildChooser` (setlist + composer axes, piece expansion).
- `web/js/controls.js` — `bindControls`, `KEY_ACTIONS`, `tapAction`.
- `web/js/api.js` — `getLibrary`, `getPages`, `pageUrl`, `getResume`/`putResume`.
- `web/js/main.js` — `openReader` (resume restore/save, gaze pause toggle, piece jumps).
