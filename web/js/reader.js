/**
 * Reader view: a vertical strip of lazily-loaded page images.
 *
 * Every page is rendered server-side onto the standard canvas, so a page's
 * on-screen height is `stripWidth × (height / width)` for its `pageDims` entry.
 * The strip's geometry is derived purely from `pageDims` + `stripWidth`, which
 * keeps the scroll/resume maths (below) independent of the actual image loads.
 *
 * DOM-builders take a detached node the caller mounts; the geometry helpers are
 * pure so they unit-test without a DOM.
 */
import { pageUrl } from "./api.js";

/** Per-page on-screen heights (floats, px) for a given strip width. */
function scaledHeights(pageDims, stripWidth) {
  return pageDims.map((d) => (stripWidth * d.height) / d.width);
}

/** Strip offset (px) of the top of a 1-based page — the sum of pages above it. */
export function pageToScroll(pageDims, stripWidth, pageNumber) {
  const heights = scaledHeights(pageDims, stripWidth);
  let offset = 0;
  for (let i = 0; i < pageNumber - 1 && i < heights.length; i++) {
    offset += heights[i];
  }
  return offset;
}

/**
 * Pixel `scrollTop` for a saved resume `{page, scroll}`.
 *
 * `scroll` is a 0–1 fraction of the page's height, so a resume survives a
 * change of strip width: only the page index and within-page fraction are
 * stored, never raw pixels.
 */
export function computeResumeScroll(pageDims, stripWidth, { page, scroll }) {
  const heights = scaledHeights(pageDims, stripWidth);
  const i = Math.min(Math.max(page, 1), heights.length) - 1;
  return pageToScroll(pageDims, stripWidth, i + 1) + scroll * heights[i];
}

/**
 * Inverse of {@link computeResumeScroll}: map a pixel `scrollTop` to the saved
 * `{page, scroll}` shape (1-based page + 0–1 within-page fraction).
 */
export function scrollToResume(pageDims, stripWidth, scrollTop) {
  const heights = scaledHeights(pageDims, stripWidth);
  let offset = 0;
  const top = Math.max(scrollTop, 0);
  for (let i = 0; i < heights.length; i++) {
    if (top < offset + heights[i] || i === heights.length - 1) {
      return { page: i + 1, scroll: (top - offset) / heights[i] };
    }
    offset += heights[i];
  }
  return { page: 1, scroll: 0 };
}

/**
 * Leading + trailing throttle: `fn` fires immediately, further calls within
 * `ms` are collapsed into a single trailing call (with the latest args) at the
 * window's end. `.flush()` fires any pending trailing call now (e.g. on unload).
 */
export function throttle(fn, ms) {
  let timer = null;
  let pending = null; // latest args awaiting a trailing call, or null

  function fire(args) {
    fn(...args);
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        const args2 = pending;
        pending = null;
        fire(args2);
      }
    }, ms);
  }

  function throttled(...args) {
    if (timer) pending = args;
    else fire(args);
  }
  throttled.flush = () => {
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  return throttled;
}

/**
 * Build the page strip for a score.
 *
 * Returns a `div.strip` containing one `div.page-wrapper > img.page` per page
 * (`data-page` = 1-based index on the img). Each image is sized responsively —
 * `width: 100%` of the strip with its height reserved before load via the
 * page's `aspect-ratio` — so a render wider than the window scales down instead
 * of being clipped, and the layout survives a resize. The wrapper div exists so
 * `applyCropMode` can set `overflow: hidden` and the img can be CSS-transformed
 * without affecting strip geometry. The scroll/resume maths derive heights from
 * the *measured* strip width at runtime (see the geometry helpers above).
 */
export function buildStrip({ file, pageDims, annotated = false }) {
  const strip = document.createElement("div");
  strip.className = "strip";

  pageDims.forEach((dim, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    const img = document.createElement("img");
    img.className = "page";
    img.loading = "lazy";
    img.dataset.page = String(i + 1);
    img.src = pageUrl(file, i + 1, annotated);
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.aspectRatio = `${dim.width} / ${dim.height}`;
    wrapper.append(img);
    strip.append(wrapper);
  });

  return strip;
}

/**
 * Apply or clear the forScore crop CSS transform on each page in the strip.
 *
 * In crop mode each img is translated and scaled so only the region forScore
 * displayed on the iPad is visible within its wrapper (which gets
 * `overflow: hidden`). The translate percentages are derived from the same
 * coefficients as `crop.overlay_affine` and are strip-width-independent, so
 * no resize handler is needed.
 *
 * Pages with default crop params (`zoom = 1`, `trOffset = null`) are visually
 * identical in both modes — the identity transform is not applied.
 *
 * @param {HTMLElement} strip
 * @param {Array<{width: number, height: number, zoom?: number, trOffset?: number[]|null}>} extDims
 * @param {boolean} cropMode
 */
export function applyCropMode(strip, extDims, cropMode) {
  const wrappers = strip.querySelectorAll(".page-wrapper");
  wrappers.forEach((wrapper, i) => {
    const img = wrapper.querySelector("img.page");
    const { zoom = 1, trOffset = null, width, height } = extDims[i] ?? {};
    if (cropMode && (zoom !== 1 || trOffset)) {
      const [ox, oy] = trOffset ?? [0, 0];
      // tx/ty are percentages of the img's own width/height (resize-independent).
      // Derived from overlay_affine: overlay = zoom * canvas + (-0.8 * trOffset * PX_PER_PT).
      // The crop origin in canvas space is at (0.8*trOffset/PX_PER_PT / zoom) pts,
      // which in img-width-% and img-height-% gives the formulae below.
      const tx = (-80 * ox) / 612;
      const ty = (-80 * oy * width) / (612 * height);
      img.style.transformOrigin = "0 0";
      img.style.transform = `translate(${tx}%, ${ty}%) scale(${zoom})`;
      wrapper.style.overflow = "hidden";
    } else {
      img.style.transform = "";
      img.style.transformOrigin = "";
      wrapper.style.overflow = "";
    }
  });
}

/**
 * Decide what happens when a score reaches its end.
 *
 * A setlist is a deliberate performance order, so we **never auto-advance** —
 * jumping to the next piece mid-page-turn during a concert would be a disaster.
 * Instead, when more pieces remain we surface the next one as a waiting
 * affordance; the player advances with an explicit next-piece control. Past the
 * last piece (or with no setlist at all) there is nothing to offer.
 *
 * `context.setlist` is `{ items: [{title, file}, …], index }` or null/undefined.
 * Returns `{ advance: false, next, message }` — `advance` is always false.
 */
export function onScoreEnd({ setlist } = {}) {
  const next = setlist?.items?.[setlist.index + 1] ?? null;
  return {
    advance: false,
    next,
    message: next ? `Setlist: next is ${next.title}` : null,
  };
}

/**
 * First page of the piece `dir` steps from the one containing `currentPage`.
 *
 * `dir` is +1 (next piece) or -1 (previous). The "current" piece is the last one
 * starting at or before `currentPage`, so a page in a gap still resolves to the
 * piece you are reading past. Returns the target piece's `first_page`, or null
 * when there is no such piece (past the last / before the first / no pieces).
 */
export function pieceJumpPage(pieces, currentPage, dir) {
  let current = -1;
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].first_page <= currentPage) current = i;
  }
  const target = pieces[current + dir];
  return target ? target.first_page : null;
}

/** Re-point every page image at the annotated or un-annotated render. */
export function setAnnotation(strip, file, annotated) {
  for (const img of strip.querySelectorAll("img.page")) {
    img.src = pageUrl(file, Number(img.dataset.page), annotated);
  }
}
