# Vendored front-end libraries

These files are fetched, not committed (they are large and gitignored). Re-fetch
them with the pinned commands below before running the spike or the app.

## webgazer.js

WebGazer.js — webcam eye-tracking in the browser. Used by the Phase 0 gaze
spike and (later) the MVP `WebGazerGazeSource`.

```bash
# Brown-hosted build (what the spike was developed against):
curl -L -o web/vendor/webgazer.js https://webgazer.cs.brown.edu/webgazer.js

# Reproducible/pinned alternative (recommended for the app, version-locked):
#   curl -L -o web/vendor/webgazer.js \
#     https://cdn.jsdelivr.net/npm/webgazer@3.3.0/dist/webgazer.min.js
```

Verify it is real JS, not an error page: `head -c 80 web/vendor/webgazer.js`
should start with a JS comment / `(function` and the file should be > 100 KB.
