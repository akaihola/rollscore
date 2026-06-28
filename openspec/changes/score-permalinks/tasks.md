## 1. Server route

- [x] 1.1 Add `@app.get("/score/{score_file}")` in `gazescroll/app.py` returning `FileResponse(WEB_DIR / "index.html")` (same shell as `/`); place it with the other page routes so the `/api` routes and `/web` mount still win.

## 2. Path helpers + bootstrap routing

- [x] 2.1 Add `scorePath(file, page)` in `web/js/main.js`: `/score/<encodeURIComponent(file)>` plus `?page=<n>` when `page > 1`.
- [x] 2.2 Add `parsePath()`: from `location.pathname`/`location.search`, return `{file, page}` for `/score/<file>` (file `decodeURIComponent`'d, page from `?page`), else `null`.
- [x] 2.3 Replace the bare `boot()` call at the bottom with a router that runs `parsePath()`: if it names a score, open the reader for it; otherwise render the chooser.

## 3. Open reader from a direct URL

- [x] 3.1 When routing to a `/score/<file>` URL, fetch `/api/library` (`getLibrary`), look up the score by filename, and call `openReader({file, page, pieces})` with its pieces; if the filename is not found, render the chooser instead.

## 4. Chooser emits real links

- [x] 4.1 In `web/js/chooser.js`, make score and piece entries anchors (`<a href>`) using `scorePath(...)` (piece uses `?page=<first_page>`); drop the `onOpen`-to-`openReader` wiring in favor of real navigation.
- [x] 4.2 Make "← Library" (`backToChooser` / toolbar) navigate to `/` (real link/navigation) instead of calling `boot()` in-page.
- [x] 4.3 Make setlist auto-advance ("Open next →") navigate to the next score's URL instead of calling `openReader` directly.

## 5. Verify

- [ ] 5.1 Manually verify: clicking a score navigates to `/score/<file>` and opens the reader; reload reopens it; a piece link opens at `?page=<n>`; `/` shows the chooser; an unknown filename URL falls back to the chooser; Back/Forward move between chooser and reader.
- [x] 5.2 Verify `GET /score/<file>` returns 200 with the shell (e.g. `curl -sI`) and that `/api/...` endpoints are unaffected.
