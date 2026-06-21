---
name: forscore-filename-nfd
description: forScore manifest/setlist filenames are macOS NFD Unicode — normalize to NFC before any filename→score/path lookup
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9fa92e8a-9f77-487d-aab0-5ca9d83dc9e4
---

forScore stores document filenames (the `documents` keys in `manifest.json`, and
the `FilePath` refs in `setlists.json` and `meta.bookmarks`) as macOS-style **NFD**
(decomposed) Unicode. Example: the `Études, Op. 10.pdf` key is NFD, so a normal
NFC Python/JS string literal `"Études, Op. 10.pdf"` does **not** match it in a
`dict` lookup (`key in documents` → False).

**How to apply:** normalize every filename to **NFC** (`unicodedata.normalize("NFC", s)`)
when building lookup keys and when resolving `FilePath` refs, so lookups from
human-typed/source-literal strings succeed. `gazescroll/library.py` `load_library`
already does this for score keys; the same applies to any future filename→path
lookup (render service in [[gaze-scroll-web-app-design]] Phase 4, setlist/state
resolution). Detect with `unicodedata.is_normalized("NFD", key)`.
