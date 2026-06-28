# Staff-system detection spike — findings

Phase 14 of the gaze-scroll reader
(`openspec/changes/phase-14-music-aware-scrolling/`). The make-or-break question:
*can the classic projection-profile pipeline detect grand-staff systems on real
rendered pages well enough to drive system-aware scrolling — or is stable-paths /
deep learning needed?* Grounded in `docs/notes/staff-system-grouping-research.md`.

Acceptance target: **4 La Maja y el Ruiseñor** (`out/pdfs/4 La Maja y el
Ruisenor.pdf`), 6 pages, rendered through `gazescroll.render.render_page_image`
onto the standard 2160-px-wide canvas. Detection lives in `gazescroll/systems.py`.

## Verdict (2026-06-28): **GO** — projection profile is sufficient

The pipeline detects every La Maja page correctly, matching hand-verified ground
truth, **once two non-obvious steps are added**: a *deskew* pass and *barline-
connector* system grouping (not spacing). Stable-paths was **not** needed.

## Ground truth vs. detector (final)

| Page | Systems | Notes | Detector |
| --- | --- | --- | --- |
| 1 | 4 | title + 4 systems; page tilted ~0.6°; 1/2 barely separated, 2/3 & 3/4 **overlap** | ✓ 4; 1/2 sep 11px, 2/3 ovl 7px, 3/4 ovl 15px |
| 2 | 5 | clean 2-staff | ✓ 5 |
| 3 | 5 | clean 2-staff | ✓ 5 |
| 4 | 4 | 3-staff systems (rich piano texture, **not** a song) | ✓ 4 |
| 5 | 4 | mixed: top 2 are 3-staff, bottom 2 are 2-staff | ✓ 4 (heights 545,557,343,349) |
| 6 | 5 | 2-staff | ✓ 5 |

La Maja turned out to be a *richer* test than the proposal assumed ("all
two-staff"): it exercises clean 2-staff pages, 3-staff systems from dense piano
writing, a **mixed** N-staff page, and a skewed title page — all in one piece.

## Pipeline as built

`binarize (gray<160) → deskew → horizontal projection profile → staff-line peaks
(≥0.6×page-max) → group 5±1 lines into staves → group staves into systems by the
barline connector → box vertical span from the jagged per-column content divide`.

Tuned constants live at the top of `gazescroll/systems.py`.

## Hypotheses, prototypes, failure modes

Chronological — each prototype lived in `scratchpad/spike*.py`; the experiments
are reproducible from the renders.

### H1 — fixed coverage fraction picks staff lines · **failed on page 1**
First cut thresholded rows at a fixed fraction of page *width* (≥0.5×W). Clean
pages (2,3) gave a perfect 50 lines = 10 staves. **Page 1 returned 0 lines:** its
staff lines peak at only **0.39 of width**, vs **0.84** on pages 2–6.
- *Fix:* threshold relative to the page's own strongest row, `≥0.6×page-max`.
  Recovers an indented/short first system without catching text rows.

### H2 — staff size filter removes lyric/text rows · **held**
Page 1's relative threshold then caught isolated high-coverage rows (title/text)
as spurious 1-line "staves". Keeping only **4–6 line** groups dropped them and
left clean staves. (A real staff is 5 lines; 4–6 tolerates a missed/merged line.)

### H3 — group systems by inter-staff *spacing* (largest-gap-jump) · **failed on page 1**
Hypothesis: intra-system inter-staff gaps are smaller than inter-system gaps; split
at the biggest jump in the sorted gaps. **Worked on pages 2–6** (incl. the mixed
3,3,2,2 page 5), **failed on page 1**: its inter-staff gaps are *non-bimodal* —
pairing the 8 staves gives intra-gaps `{226,209,263,251}` and inter-gaps
`{238,273,239}` that **overlap**. A title page compresses inter-system spacing
irregularly, so spacing alone cannot group it.

### H4 — page 1 is skewed · **confirmed, → deskew step**
Page 1's low 0.39 coverage and *smeared* low-threshold peaks were the signature of
skew. Rotating the page and re-measuring the projection peak: **−0.6° jumped
coverage 0.39 → 0.83**, identical to clean pages. A fraction of a degree smears a
2-px staff line across ~15 rows and collapses the profile.
- *Built:* `_deskew` — variance-maximizing angle search over ±1.5° (0.1° grid, on
  a ¼-scale copy for speed), apply the best angle at full res.
- *Failure mode found & fixed:* the first grid (start −1.5°, step 0.2°) **skipped
  0.0°**, so every *level* page got a needless ±0.1° BILINEAR rotation that smeared
  its lines right at the detection threshold — it **broke the previously-clean
  pages 2/3**. Fix: grid includes 0.0, use the robust *variance* metric, and only
  actually rotate when `|best| ≥ 0.25°` so level pages stay pristine.
- Boxes are emitted in the deskewed frame and used as canvas coords; sub-degree
  error is `tan(θ)·x` ≤ ~12 px at the page edge — inside the ledger margin — so no
  inverse box rotation is needed.

### H5 — group systems by the barline/brace connector · **held (replaces H3)**
The Audiveris cue: staves of one system are joined by vertical **barlines spanning
the inter-staff gap**; between systems that gap is blank. For each adjacent staff
pair, the max vertical-ink column-coverage in the gap band cleanly separates:

| Page | gap connector coverage (per adjacent staff pair) |
| --- | --- |
| 1 | `1.0, 0.32, 1.0, 0.47, 1.0, 0.39, 1.0` → {0,1}{2,3}{4,5}{6,7} = 4 systems |
| 2 | `1.0, 0.62, 1.0, 0.53, 1.0, 0.66, 1.0, 0.65, 1.0` → 5 systems |
| 5 | `1.0,1.0,0.58,1.0,1.0,0.4,1.0,0.51,1.0` → {0,1,2}{3,4,5}{6,7}{8,9} = 3,3,2,2 |

Within-system gaps span ~1.0; between-system gaps top out at ~0.66. A **0.8**
threshold separates *every* page, handles mixed N-staff layouts with no per-page
tuning, and is immune to the page-1 spacing irregularity that defeated H3.

### H6 — box vertical span = staff lines + fixed margin · **failed (too tight)**
Boxes spanning `[top staff − 2×interline, bottom staff + 2×interline]` left ~100 px
gaps between every system on page 1 — but the real content (ledger lines, high/low
notes of dense piano writing) **overlaps**, per ground truth. A fixed margin can't
express the overlap and systematically under-covers the music.

### H7 — content extent via per-column "largest blank run" · **failed (over-reach)**
Growing each box to real ink by splitting each column at its largest blank run
over-reached badly: system 1's top grabbed the **title** (row 42), and a
neighbour-only column polluted the other system's edge (a sys-2-only column
inflated sys-1's bottom). Cross-column defaults made *everything* overlap, even
page-1 systems 1/2 which are genuinely separated.

### H8 — valley-anchored jagged per-column divide · **held (final)**
The divide between two systems is rarely a straight line. Anchor each column's
divide at the **blank row nearest the band's full-width valley** (least-ink row),
*bounded to the gap band strictly between the two staff groups*:
- Where the valley is a truly blank row (page 1, sys 1/2), every column divides
  there → flat divide → boxes barely touch.
- Where notes interleave (sys 2/3, 3/4) the blank wanders per column → jagged
  divide → the rectangular boxes **overlap**.

This reproduced page 1 exactly: **1/2 sep 11px, 2/3 ovl 7px, 3/4 ovl 15px** —
matching the hand-verified observation. Outer edges (above sys 1, below sys N) have
no neighbour to interleave with, so they grow to the farthest ledger ink within a
cap (`3×interline`) so a title/footer is excluded.

## Decisions recorded (Open Questions resolved)

- **Binarization:** fixed `gray < 160`. The renders are clean black-on-white; Otsu
  added nothing. (No adaptive/Otsu needed.)
- **Skew / stable-paths:** a cheap deskew (H4) suffices; **stable-paths not needed**
  for La Maja.
- **System grouping:** by barline connector (H5), **not** spacing (H3) or a
  horizontal whitespace cut. Groups N-staff systems with no per-page threshold.
- **Box vertical extent:** jagged per-column content divide (H8), allowing overlap.
- **Music-column horizontal extent:** derived per-system from the staff-line ink
  extent (`_h_extent`), not the gaze `columnX0/columnX1` tuning.

## Far-future refinement (documented, not built)

Boxes currently bound the *staffline-anchored* content. Stems, beams, slurs,
octave brackets, dynamics and other markings can point **far** from the system
(a long beam group or `8va` line well above the top staff). A future pass could
extend each box to include such connected markings — e.g. component/connected-ink
analysis attributing a marking to the system its stem roots in — for tighter
framing of extreme cases. Low priority: the current boxes already frame the music
well (visually confirmed on all 6 pages), and the scroll logic only needs the
system's bulk in view.

## Caveats / notes for execution

- Detection runs on the **plain** (un-annotated) cached render so ink annotations
  don't perturb the projection profile.
- The `0.8` connector threshold and `0.25°` deskew floor are tuned to La Maja's
  print quality; re-validate if a very different engraving/scan misbehaves.
- The deskew angle search is per-page and cheap (¼-scale, ~16 rotations) and the
  whole result is disk-cached, so cost is paid once per page per archive mtime.
