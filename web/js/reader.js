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
 * Build the page strip for a score.
 *
 * Returns a `div.strip` of total scaled height containing one lazy `<img>` per
 * page (`data-page` = 1-based index). Images carry explicit width/height so the
 * scroll geometry is correct before any image has loaded.
 */
export function buildStrip({ file, pageDims, stripWidth, annotated = false }) {
  const heights = scaledHeights(pageDims, stripWidth);
  const strip = document.createElement("div");
  strip.className = "strip";

  pageDims.forEach((_dim, i) => {
    const img = document.createElement("img");
    img.className = "page";
    img.loading = "lazy";
    img.dataset.page = String(i + 1);
    img.src = pageUrl(file, i + 1, annotated);
    img.style.width = `${stripWidth}px`;
    img.style.height = `${heights[i]}px`;
    strip.append(img);
  });

  strip.style.height = `${heights.reduce((a, b) => a + b, 0)}px`;
  return strip;
}
