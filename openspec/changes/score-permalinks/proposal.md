## Why

The reader is a single-page app with no URL state: every reload drops you back at
the library index, and there is no way to bookmark or link directly to a score.
Opening a frequently-played piece always means re-navigating the chooser.

## What Changes

- Give each score a real URL path, `/score/<filename>`, that the server serves
  directly — open it, reload it, or share it and you land on that score.
- Add a server route `GET /score/{score_file}` that returns the front-end shell
  (reusing `index.html`); the existing `/` keeps serving the library index.
- Make chooser entries real `<a href="/score/...">` links so opening a score is a
  normal browser navigation — native Back/Forward, no client-side router.
- The front-end bootstrap branches on `location.pathname`: `/` renders the
  chooser; `/score/<file>` opens that score in the reader.
- Carry a piece's start page as `?page=<n>` so a piece link reopens at its page.
- "← Library" becomes a link to `/`.

## Capabilities

### New Capabilities
- `score-permalinks`: URL-addressable scores — each score has a real, server-served
  path; the chooser links to it, the bootstrap routes from the path, and reload /
  Back / Forward work as normal browser navigation.

### Modified Capabilities
<!-- None: existing scrolling/detection specs are unaffected. -->

## Impact

- `gazescroll/app.py`: add `GET /score/{score_file}` returning the front-end shell.
- `web/js/main.js`: bootstrap routes on `location.pathname`; chooser emits real
  links; "← Library" / setlist-advance navigate by URL instead of in-page swaps.
- `web/js/chooser.js`: score/piece entries become anchors with real `href`s.
- No new dependencies; no API changes (reuses `/api/score/{score_file}/...` and
  `/api/library`).
