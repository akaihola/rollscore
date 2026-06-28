## 1. Detection spike (validate the approach)

- [ ] 1.1 Add `numpy` to project dependencies; confirm pymupdf/PIL render path is reusable for detection
- [ ] 1.2 Prototype the projection profile on La Maja renders: horizontal black-pixel histogram per page, plot/inspect peaks
- [ ] 1.3 Validate peak-pick → 5-line staff grouping → interline estimate on a clean page and on a tricky unclear-spacing page
- [ ] 1.4 Decide binarization threshold (fixed vs Otsu/adaptive) and record the choice; note whether stable-paths escalation is needed (Open Question)

## 2. Backend detection module

- [ ] 2.1 Create `gazescroll/systems.py` with pure functions: binarize → projection profile → detect staff lines → group staves → pair into systems
- [ ] 2.2 Emit system boxes as `{top, bottom, left, right}` in full-page canvas coordinates (same space as `page_dimensions`), ordered top-to-bottom, with ledger-line margin
- [ ] 2.3 Implement robust degradation: return empty list when <2 lines or no groupable staff; surface an unpaired staff as a single-staff system; never raise
- [ ] 2.4 Add `detect_cached(root, score_file, page)` reusing `ingest._cache_dir()` under `systems/{mtime_token}/{slug}/{page}.json`; reuse the cached render as input

## 3. Systems API endpoint

- [ ] 3.1 Add `GET /api/score/{score_file}/systems` to `gazescroll/app.py` returning per-page entries with their system boxes
- [ ] 3.2 Follow existing conventions: `503` when no data source, `404` for unknown score (via `_resolve_doc` KeyError)
- [ ] 3.3 Add `gazescroll/web/js/api.js` (or equivalent) client helper `systemsUrl`/`fetchSystems`

## 4. Backend tests

- [ ] 4.1 `tests/test_systems.py`: golden boxes for a known La Maja page (assert count, order, vertical spans within tolerance)
- [ ] 4.2 Empty-list degradation test (blank/cover page) and single-staff fallback test
- [ ] 4.3 Cache hit + mtime-invalidation tests mirroring `test_render_cache.py`
- [ ] 4.4 `tests/test_api.py`: systems endpoint happy path, `404`, and `503`

## 5. Frontend system-aware controller

- [ ] 5.1 In `web/js/gaze/control.js` add active-system selection (forward-only) over strip-scaled boxes
- [ ] 5.2 Add the snap start target: on left-edge gaze entry, scrollTarget = `sysBottom − viewportH` (minimal forward scroll bringing the whole active system into view; forward-only, clamped)
- [ ] 5.3 Add left→right sweep interpolation of the active system alone: `lerp(sysBottom − viewportH, sysTop − m, fx)` by gaze-x fraction `fx` across the music column, so the active system rises from screen-bottom to screen-top
- [ ] 5.4 Route the target through the existing bounded-step `stepController` discipline so the non-decreasing/bounded-delta invariant holds; clamp the tall-system case (`sysBottom − viewportH > sysTop − m`) to a plain top-align
- [ ] 5.5 Per-page fallback: empty/failed systems route the frame through the existing vertical-gaze follower without throwing

## 6. Frontend wiring & tuning

- [ ] 6.1 Fetch systems once per score in `web/js/main.js`/`reader.js`; scale boxes to measured strip width and thread the active page's boxes into the controller each frame
- [ ] 6.2 Add the sweep-end top margin `m` and snap/interpolation smoothing params to `web/js/tuning.js`, applied live and persisted via `/api/tuning`

## 7. Frontend tests

- [ ] 7.1 `web/tests/control.test.js`: active-system selection (inside system + inter-system gap), forward-only
- [ ] 7.2 Snap-start (`sysBottom − viewportH`) and sweep interpolation (active system rising to top) cases against synthetic gaze traces + box sets, incl. the tall-system clamp
- [ ] 7.3 Fallback-to-vertical-gaze-follower case when systems are empty/unavailable
- [ ] 7.4 Confirm existing render, API, and control tests stay green

## 8. Acceptance & docs

- [ ] 8.1 Manual run against La Maja: verify snap + interpolation feel predictable; tune params
- [ ] 8.2 Resolve/record Open Questions (stable-paths need, interpolation look-ahead target, music-column extent source)
- [ ] 8.3 Update Phase 14 status in project docs/backlog and memory
