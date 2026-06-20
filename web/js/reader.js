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
 * Returns a `div.strip` containing one lazy `<img>` per page (`data-page` =
 * 1-based index). Each image is sized responsively — `width: 100%` of the strip
 * with its height reserved before load via the page's `aspect-ratio` — so a
 * render wider than the window scales down instead of being clipped, and the
 * layout survives a resize. The scroll/resume maths derive heights from the
 * *measured* strip width at runtime (see the geometry helpers above).
 */
export function buildStrip({ file, pageDims, annotated = false }) {
  const strip = document.createElement("div");
  strip.className = "strip";

  pageDims.forEach((dim, i) => {
    const img = document.createElement("img");
    img.className = "page";
    img.loading = "lazy";
    img.dataset.page = String(i + 1);
    img.src = pageUrl(file, i + 1, annotated);
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.aspectRatio = `${dim.width} / ${dim.height}`;
    strip.append(img);
  });

  return strip;
}

/** Re-point every page image at the annotated or un-annotated render. */
export function setAnnotation(strip, file, annotated) {
  for (const img of strip.querySelectorAll("img.page")) {
    img.src = pageUrl(file, Number(img.dataset.page), annotated);
  }
}
