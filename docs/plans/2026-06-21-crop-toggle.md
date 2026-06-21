# Spec: Crop/full-page toggle (`z` key)

## Objective

Add a `z` keyboard shortcut that toggles the reader between two display modes
for each page:

- **Cropped (default)**: shows the portion of the page forScore displayed on
  the iPad — zoomed in, with the user's margins hidden. This is the "reading"
  view.
- **Full-page**: fits the whole PDF page width to the browser window, showing
  all margins. This is the "overview" or "where am I in the page" view.

The toggle is instant (no network round-trip, no image reload, no relayout).
Scroll position (page + within-page fraction) is preserved across toggles.

User: a solo musician reading annotated scores on a localhost web app.

## Tech Stack

FastAPI + pymupdf Python backend; vanilla JS front-end (ES modules, Vitest
unit tests). No bundler, no TypeScript.

## Commands

```
Dev server : ! uv run uvicorn gazescroll.app:create_app --factory --port 8765
Tests (JS) : cd web && npx vitest run
Tests (Py) : uv run pytest tests/
```

## Project Structure

Files touched:

```
gazescroll/render.py       page_dimensions — add zoom + trOffset per page
web/js/reader.js           buildStrip (add wrappers), new applyCropMode
web/js/controls.js         KEY_ACTIONS — add z → toggleCrop
web/js/main.js             openReader — add cropMode state + handler
web/index.html             CSS for .page-wrapper
web/tests/controls.test.js test z → toggleCrop
web/tests/reader.test.js   tests for applyCropMode
```

## Code Style

Follow existing patterns exactly — see the `annotated` toggle in `main.js` as
the closest analogue (a stateful toggle that changes each img's src). This
change is similar but operates on CSS rather than src.

```js
// controls.js addition:
z: (h) => h.toggleCrop?.(),

// reader.js new export (pure, unit-testable):
export function applyCropMode(strip, extDims, cropMode) { … }
```

No comments unless the WHY is non-obvious. No docstrings.

## Testing Strategy

Vitest (jsdom). Mirror the existing `controls.test.js` / `reader.test.js`
patterns:

- `controls.test.js`: `z` key calls `toggleCrop` spy.
- `reader.test.js`:
  - `buildStrip` now wraps each img in a `.page-wrapper`.
  - `applyCropMode(strip, extDims, true)` sets the expected `transform` on each
    img and `overflow: hidden` on each wrapper.
  - `applyCropMode(strip, extDims, false)` clears both.
  - Pages with `zoom=1, trOffset=null` show `transform: none` (identity) in
    both modes.

## Design

### Why CSS-only (no new backend render variant)

The existing full-page images already contain the complete page. The forScore
crop is just a zoom-and-clip: we zoom the img by `zoom` and shift it so the
crop region is the visible area. A CSS transform achieves this in the browser
without a backend round-trip or extra disk cache.

### Strip heights are mode-invariant

In forScore's cropped view the page is zoomed by `zoom` and a
`(page_w/zoom) × (page_h/zoom)` rectangle of the page is shown. That
rectangle has the SAME aspect ratio as the full page (`page_w:page_h`). So the
display height of each page in the strip — `strip_width × page_h/page_w` — is
identical in both modes. The scroll math (`pageDims`, `pageToScroll`,
`scrollToResume`, `computeResumeScroll`) is unchanged.

### CSS transform per page (cropped mode)

Each img is wrapped in `div.page-wrapper` (always; the wrapper is transparent
in full-page mode). In cropped mode the wrapper gets `overflow: hidden` and the
img gets:

```css
transform-origin: 0 0;
transform: translate(tx%, ty%) scale(zoom);
```

The translate percentages are derived from the same coefficients as
`crop.overlay_affine` (`_TROFFSET_COEFF = -0.8`, `PX_PER_PT = 2160/612`):

```
tx  (% of img WIDTH)   = -80 × trOffset[0] / 612
ty  (% of img HEIGHT)  = -80 × trOffset[1] × canvas_width / (612 × canvas_height)
```

Where `canvas_width / canvas_height` is the per-page aspect ratio returned by
the backend (already in `pageDims`). These are **per-page constants** — they do
not depend on the strip width, so they are set once per toggle and are
automatically correct at any window size.

The derivation: the forScore crop origin in the displayed full-page img is at
`(cx, cy)` where `cx = 0.8 × trOffset[0] × W / 612` in display pixels (W =
strip width). With `transform: translate(tx_px, ty_px) scale(zoom)` applied
(scale first, then translate in screen space, both with `transform-origin: 0 0`):
point `(x, y)` goes to `(zoom×x + tx_px, zoom×y + ty_px)`. We want `(cx, cy)
→ (0, 0)`, so `tx_px = -zoom × cx`. Converting to % of img WIDTH:
`tx% = tx_px / W = -zoom × 0.8 × trOffset[0] / 612 × zoom / zoom` — but note
that in CSS `transform: translate(X%) scale(Z)`, the percentage X is relative
to the pre-transform element, and scale is applied AFTER translate in this
notation (i.e. CSS applies right-to-left: scale first, then translate). The
correct ordering for the math above is `translate(tx_px, ty_px) scale(zoom)`
syntax where scale is listed second in CSS but applied first. Verify the sign
and axis against the golden test before shipping.

For pages with `zoom = 1` and `trOffset = null` the transform is identity and
both modes are visually identical for that page.

### Backend change: extend `page_dimensions`

`render.py: page_dimensions` currently returns `[{width, height}]`. Extend it
to `[{width, height, zoom, trOffset}]`:

```python
page_params = doc.get("pages", {}).get(str(i + 1), {})
zoom = float(page_params.get("zoom", 1.0))
troffset = page_params.get("trOffset") or None
```

No other backend changes. The image endpoints are unchanged.

### DOM structure

```html
<!-- Before -->
<div class="strip">
  <img class="page" ...>
</div>

<!-- After -->
<div class="strip">
  <div class="page-wrapper">
    <img class="page" ...>
  </div>
</div>
```

`buildStrip` wraps every img in a `div.page-wrapper`. `applyCropMode` iterates
`.page-wrapper` (or `.page`) and sets/clears styles:

```js
export function applyCropMode(strip, extDims, cropMode) {
  const wrappers = strip.querySelectorAll('.page-wrapper');
  wrappers.forEach((wrapper, i) => {
    const img = wrapper.querySelector('img.page');
    const { zoom = 1, trOffset = null, width, height } = extDims[i] ?? {};
    if (cropMode && (zoom !== 1 || trOffset)) {
      const [ox, oy] = trOffset ?? [0, 0];
      const tx = -80 * ox / 612;
      const ty = -80 * oy * width / (612 * height);
      img.style.transformOrigin = '0 0';
      img.style.transform = `translate(${tx}%, ${ty}%) scale(${zoom})`;
      wrapper.style.overflow = 'hidden';
    } else {
      img.style.transform = '';
      img.style.transformOrigin = '';
      wrapper.style.overflow = '';
    }
  });
}
```

### State in `openReader`

```js
let cropMode = true; // cropped by default

// In bindControls handlers:
toggleCrop: () => {
  cropMode = !cropMode;
  applyCropMode(strip, extDims, cropMode);
  cropBtn.textContent = `Crop: ${cropMode ? 'on' : 'off'}`;
},
```

`extDims` is the extended page-dimensions array from the backend (replaces the
plain `pageDims` where crop params are needed; the scroll-math functions
continue to use `{width, height}` shape which is a subset).

### Toolbar button

Add `cropBtn` alongside `annotateBtn` and `gazeBtn`:

```js
const cropBtn = el('button', null, 'Crop: on');
```

Mirror the `z` handler. The button label reflects current state.

## Boundaries

- **Always**: unit tests for every new exported function and every new key binding.
- **Ask first**: persisting crop mode to the state store; adding a `cropped`
  query param to the image API; using a different key than `z`.
- **Never**: modify the scroll math (heights are mode-invariant); add a second
  server-side image variant for this feature.

## Success Criteria

1. Pressing `z` in the reader toggles between cropped and full-page views.
2. Opening a score defaults to cropped mode.
3. Scroll position (page + fraction) is unchanged after a toggle.
4. Pages with no forScore crop params (`zoom=1, trOffset=null`) are visually
   identical in both modes.
5. The toggle is instant (no network requests, no layout shift).
6. `controls.test.js`: `z` calls `toggleCrop`.
7. `reader.test.js`: `applyCropMode` sets/clears transform and overflow correctly.
8. All existing tests continue to pass.

## Decisions (locked 2026-06-21)

1. **Key**: `z` (for zoom).
2. **Setlist navigation**: crop mode persists across pieces within a session.
3. **Toolbar button**: always visible and toggleable regardless of whether the
   current page has a forScore crop set.
