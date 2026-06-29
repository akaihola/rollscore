# Gaze-scroll score reader — design

> **Migrated to OpenSpec.** The shipped behavior now lives in
> `openspec/specs/{score-rendering,setlist-navigation,reader-controls}/spec.md`
> (gaze-specific capabilities under `openspec/specs/gaze-*` and `system-aware-scrolling`).
> This plan is kept as historical reference.

Status: **design agreed** (2026-06-13). A requirements/design spec for an interactive,
locally-run web app that reads an annotated forScore library and auto-scrolls the music
based on webcam gaze tracking. Implementation not started.

## 1. Purpose & scope

A **personal, locally-run** web app to read your own annotated forScore library on Linux,
hands-free, with **webcam gaze-tracking** that auto-scrolls the music as you read so you
never break to turn a page.

Three capabilities:

1. **Choose** — browse the library by setlist and by composer-sorted list, jump to individual
   pieces inside multi-piece PDFs, and resume each score where you left off.
2. **Render** — display each page through its forScore per-page crop with the annotation
   overlay composited on top, stacked into one continuous vertical strip per score.
3. **Gaze-scroll** — a *read-position follower*: estimate where you are reading and scroll
   smoothly to keep your reading band in a comfortable window, coasting briefly through
   glances at your hands and freezing when you look away.

**In scope (MVP):** webcam gaze with a short per-session calibration; keyboard + tap-zone
controls; lazy server-side rendering with caching; resume-position memory.

**Out of scope (now):** vector ink (not recoverable from the archive — overlays are raster);
Reflow-style staff detection; dedicated eye-trackers; foot pedal; on-screen buttons; metadata
filtering beyond composer; search box; metronome/tuner/MIDI/audio; annotation editing;
multi-user/hosting/auth; setlist auto-advance.

**Success criterion.** Sit at the instrument, calibrate in ~20 s, pick a score, and play a
piece end-to-end while the page keeps pace with your eyes — with manual override always one
keystroke or tap away.

## 2. Architecture & components

A thin browser front-end talking to a small local Python backend over HTTP on localhost. The
backend owns all archive parsing and rendering (reusing existing Python work); the browser
owns the reading surface, gaze loop, and controls.

**Backend (Python, FastAPI + pymupdf):**

- **Ingest layer** — accepts *either* a `.4sb` path (runs `extract_4sb.py`'s library code,
  caches the extraction) *or* an existing `out/` directory. Detects archive change and
  re-extracts.
- **Library service** — parses `manifest.json` + `setlists.json` into the chooser model:
  setlists, composer-sorted scores, per-score metadata, and bookmark ranges for multi-piece
  PDFs.
- **Render service** — on first open of a score, renders each page through its per-page crop
  (`zoom`/`offset`, empirical for now) into the standardized canvas and alpha-composites the
  `aux/<file>|<page>.png` overlay 1:1. Caches per-page PNGs + page dimensions on disk; serves
  them as static images thereafter.
- **State store** — persists per-score resume position (last page + scroll offset) and tuning
  parameters to a small local JSON/SQLite file.

**Front-end (browser, minimal JS/TS):**

- **Chooser view** — setlist + composer browse, piece jump, resume affordance.
- **Reader view** — vertical scroll container of cached page PNGs (lazy-loaded), gaze loop,
  control handlers.
- **Gaze module** — behind a `GazeSource` abstraction so a better tracker can replace the
  webcam later; MVP implementation is webcam-based with a calibration routine.
- **Control module** — keyboard shortcuts + tap zones; pause/recenter/nudge/next-prev.

**Data flow:** browser asks backend for library → user picks score → backend ensures pages are
rendered + cached → browser streams PNGs into the scroll strip → gaze loop drives `scrollTop`
→ resume position synced back to backend.

## 3. The gaze control loop

The riskiest part. Pipeline:
`webcam → gaze estimate (x,y)+confidence → smoothing → on-music gate → reading-speed estimator
→ scroll controller → scrollTop`.

1. **Gaze estimate.** `GazeSource` yields a screen-space gaze point at ~30 Hz with confidence.
   MVP uses a webcam estimator (WebGazer-style or MediaPipe-iris-derived; chosen in the plan).
   Calibration each session trains the mapping; a one-key **recenter** re-anchors drift
   mid-session.
2. **Smoothing.** Heavy temporal smoothing (median + exponential) on gaze-Y. We care mostly
   about **vertical** position; horizontal is used only to decide whether you are on the music.
3. **On-music gate.** Gaze counts as "reading" only when confidently inside the music column.
   Outside it (hands, keyboard, away) or low-confidence → **not reading**.
4. **Reading-speed estimator.** While reading, estimate how fast the reading point descends —
   combining smoothed gaze-Y trend and recent scroll history into a **reading velocity**,
   clamped to a sane max.
5. **Scroll controller.** Keep the smoothed reading point near a **setpoint** (~40% from top)
   using a **dead-zone** (no scroll for small errors) + **velocity limiting** (no lurches).
   When the gate goes **not-reading**, **coast** at the last reading velocity for a short grace
   window (velocity decaying), then **freeze**. Manual input always preempts and pauses gaze.

**Tuning is empirical.** Setpoint, dead-zone, coast duration, velocity cap, and smoothing
constants are exposed in a dev panel and tuned by playing. The algorithm is an experiment; we
expect to iterate.

**Hard safety rule:** gaze can only ever move the page *forward* within a clamped velocity; it
can never jump. Any surprise is correctable with one keystroke/tap.

## 4. Rendering & registration

**Per-score render job (backend, on first open, cached).** For each page:

1. Render the PDF page with pymupdf at high resolution.
2. Apply the **per-page crop** — `zoom`/`offset` (and `rect`, `rotation`, `croppedLandscape`)
   — to place the page into forScore's standardized display canvas. *Empirical per page* for
   now; the closed-form `rect`/`offset`/`trOffset`/`zoom` transform is a backlog item
   (horizontal shift ≈ `−0.8·trOffset_x`).
3. If an `aux/<file>|<page>.png` overlay exists, alpha-composite it **1:1, top-left anchored**
   (overlay is crop-baked at 2160×2824; native cropped view = its top 792/800). Structured
   `textAnnotations` can be baked in too.
4. Save the composited PNG + record pixel dimensions for layout.

**Known limitation (documented, not blocking):** registration is empirical, so annotations may
drift slightly on some pages until the transform is pinned. Anything drawn outside the crop is
absent from these crop-baked rasters. Acceptable for a reading tool.

**Front-end layout:** cached PNGs stack in a single vertical column at consistent width; total
scrollable height = sum of scaled page heights. Pages lazy-load as they approach the viewport.
A multi-piece PDF renders as one continuous score; **bookmarks** map to page offsets so "jump
to piece" sets initial scroll.

**Annotation toggle (small):** a keyboard shortcut to show/hide annotations — implemented as
page-only PNG + overlay PNG composited in the browser, or two cached variants (cheaper option
chosen in the plan).

**Caching:** keyed by score + archive mtime; invalidated when the archive changes. Cache lives
under a local app-data dir (gitignored — no copyrighted PDFs in the repo).

## 5. Chooser, controls & persistence

**Chooser view:**

- **Two browse axes:** (a) **Setlists** — named lists (Luen/Osaan/Treenaan), each an ordered
  set of scores; (b) **Composer-sorted list** — all scores grouped/sorted by composer, open a
  score from within its composer group.
- **Piece jump:** for multi-piece PDFs, expand a score to its **bookmarks** (Title + page
  range) and open directly at that piece.
- **Resume:** each score opens at its last position. Setlist and composer-list opens both honor
  saved position unless you explicitly jump to a piece.
- No genre/key/difficulty/label/keyword filtering or sorting. No search box (MVP).

**Controls (reader view):**

- **Keyboard:** pause/resume gaze (e.g. Space), recenter gaze, nudge scroll up/down, next/prev
  page or piece, back to chooser, toggle annotations, start calibration.
- **Tap zones:** invisible screen regions (no visible buttons) — e.g. tap center to
  pause/resume gaze, top/bottom edges to nudge, a corner to recenter. Exact map finalized
  during tuning.
- **No on-screen buttons** in the reading surface. **Foot pedal deferred** to a later version
  (input path left abstracted so it can slot in).

**Persistence (local state file):**

- Per-score **last page + scroll offset**, written as you read (throttled) and on exit.
- **Calibration profile** for the session (re-run each session by decision; may seed the next).
- **Tuning parameters** (setpoint, dead-zone, coast, etc.) survive restarts.

**Setlist end:** when a score opened from a setlist ends, **stop and wait** (no auto-advance).

## 6. Testing, risks & open questions

**Testing:**

- **Backend (pytest):** ingest both inputs (`.4sb` and `out/`); library model (setlists,
  composer grouping, bookmark ranges); render job produces expected page count + dimensions;
  cache keying/invalidation by archive mtime; resume-state read/write. Run headless against the
  real `out/` (gitignored).
- **Rendering correctness:** golden-image check that a composited page matches the known
  forScore export for `4 La Maja y el Ruisenor` (registration ground truth).
- **Gaze loop:** control logic (smoothing, on-music gate, velocity estimator, coast/freeze,
  dead-zone) factored as **pure functions** fed synthetic gaze traces — deterministic unit
  tests, no camera. Webcam/calibration UI validated manually.
- **Manual acceptance:** calibrate, play a piece end-to-end, tune via the dev panel.

**Top risks:**

1. **Webcam gaze accuracy** — may be too coarse/jittery for comfortable following. Mitigations:
   vertical-only, heavy smoothing, coast, frequent recenter, tunable params. The make-or-break
   experiment.
2. **Empirical crop drift** — annotations slightly misregistered until the closed-form
   transform is pinned (backlog).
3. **Calibration fragility** — posture/lighting drift; mitigated by quick recenter.

**Tech stack (proposed; confirm in plan):** FastAPI + pymupdf + the existing extractor;
front-end minimal vanilla JS/TS; gaze via WebGazer or MediaPipe Iris; local state in SQLite or
JSON.

**Deferred / open (not blocking MVP):** closed-form crop transform; smarter/persistent
calibration; foot-pedal input; setlist auto-advance.
