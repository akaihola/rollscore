## Context

`web/js/main.js` is the SPA bootstrap. `boot()` fetches the library and renders
the chooser; `openReader({file, page, pieces, setlist, initialCropMode})` swaps in
the reader view via in-memory DOM replacement, with `onOpen` wired straight to
`openReader`. There is no URL state, so reload returns to the chooser and scores
cannot be linked.

Scores are keyed by `file` (the forScore filename) — the same key every
`/api/score/{score_file}/...` endpoint uses; those filenames contain no `/` (the
existing path-param API would already break otherwise). Pieces (`first_page`)
come from the library model. The server serves `index.html` at `/` and static
assets under `/web`; API routes are all under `/api/...`.

The user explicitly rejected a single-page app and fragment URLs: they want real,
server-served paths.

## Goals / Non-Goals

**Goals:**
- A real path per score, `/score/<file>`, served by the server and reload-safe.
- Linkable, bookmarkable URLs; native Back/Forward.
- No client-side router; no new dependencies.

**Non-Goals:**
- Encoding setlist running-order context in the URL — a permalink opens the score
  standalone (the setlist banner/"next" flow is in-memory). Deferred.
- Server-rendering the reader's content — the reader stays JS-driven (gaze loop,
  lazy page strip); only the *entry document and URL* become per-score.
- Live URL updates while scrolling within a score (`?page` is a *start* hint;
  saved-resume already restores position).

## Decisions

**Multi-page navigation, not History `pushState`.** Chooser entries become real
`<a href="/score/<file>">` links; clicking does a full browser navigation, the
server returns the shell, and the bootstrap opens the reader from the path. This
is genuinely not an SPA: real document loads, native Back/Forward, no
`hashchange`/`popstate`/router-reconciliation code. It is *less* front-end code
than a hash or pushState router, not more.

**Reuse `index.html` for both routes.** Add `GET /score/{score_file}` returning
the same `FileResponse(WEB_DIR / "index.html")` as `/`. A separate `reader.html`
was considered and rejected: it would near-duplicate the shell for no behavioral
gain — sharing one file is a DRY detail invisible to the user, since navigation is
still real per-URL document loads. The bootstrap decides the view from
`location.pathname`.

**`encodeURIComponent` the filename in the `href`.** Filenames carry spaces,
accents, and NFD Unicode (project memory); the anchor `href` and the parse on load
both encode/decode so the round-trip is exact. FastAPI's `{score_file}` path param
decodes percent-encoding automatically, matching the existing API.

**Start page as `?page=<n>` query, not a path suffix.** Avoids a second server
route and any ambiguity with the filename segment; parsed with `URLSearchParams`.
Omitted for `page === 1`.

**Reader page fetches pieces from the library.** A direct `/score/<file>` load has
no chooser model in memory, but the reader needs the score's `pieces` for
piece-jump navigation. The bootstrap calls the existing `/api/library`, looks up
the score by filename, and passes its `pieces` to `openReader`. One extra fetch on
reader load — acceptable for a localhost personal app; a dedicated per-score
metadata endpoint is the upgrade path if it ever matters.

## Risks / Trade-offs

- [Unknown / mistyped filename in path] → bootstrap looks the score up in the
  library model; a miss renders the chooser instead of a broken reader (per spec).
- [Reader page re-fetches the whole library for one score's pieces] → accepted;
  cheap locally, and `/api/library` is already cached server-side. Upgrade path: a
  `/api/score/{file}/meta` endpoint.
- [Setlist context lost on a direct reader URL] → accepted (Non-Goal); the score
  opens standalone and saved-resume restores the scroll position.
- [`/score/<file>` could shadow a static asset] → no: static is under `/web` and
  API under `/api`; `/score/...` is its own namespace.

## Open Questions

- Should `?page` override saved-resume, or only seed the page when no resume
  exists? Default: keep current `openReader` precedence (saved-resume wins); the
  page hint only applies when there is no resume.
