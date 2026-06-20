// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildStrip,
  computeResumeScroll,
  scrollToResume,
  throttle,
} from "../js/reader.js";
import { pageUrl } from "../js/api.js";

// Two portrait pages at the standard canvas aspect (2160×2824).
const pageDims = () => [
  { width: 2160, height: 2824 },
  { width: 2160, height: 2824 },
];

describe("buildStrip", () => {
  const file = "Études, Op. 10.pdf";
  const stripWidth = 1080;

  it("creates one lazy <img> per page with the correct page URL", () => {
    const strip = buildStrip({ file, pageDims: pageDims(), stripWidth });
    const imgs = [...strip.querySelectorAll("img")];

    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img.loading).toBe("lazy");
    expect(imgs[0].getAttribute("src")).toBe(pageUrl(file, 1, false));
    expect(imgs[1].getAttribute("src")).toBe(pageUrl(file, 2, false));
  });

  it("tags each image with its 1-based page number", () => {
    const strip = buildStrip({ file, pageDims: pageDims(), stripWidth });
    const imgs = [...strip.querySelectorAll("img")];
    expect(imgs.map((i) => i.dataset.page)).toEqual(["1", "2"]);
  });

  it("scales each page to the strip width preserving aspect ratio", () => {
    const strip = buildStrip({ file, pageDims: pageDims(), stripWidth });
    const imgs = [...strip.querySelectorAll("img")];
    // 1080 × 2824/2160 = 1412
    for (const img of imgs) {
      expect(parseFloat(img.style.width)).toBe(1080);
      expect(parseFloat(img.style.height)).toBeCloseTo(1412, 6);
    }
  });

  it("gives the container a total height == sum of scaled page heights", () => {
    const strip = buildStrip({ file, pageDims: pageDims(), stripWidth });
    expect(parseFloat(strip.style.height)).toBeCloseTo(1412 * 2, 6);
  });

  it("honours the annotated flag in image URLs", () => {
    const strip = buildStrip({
      file,
      pageDims: pageDims(),
      stripWidth,
      annotated: true,
    });
    const imgs = [...strip.querySelectorAll("img")];
    expect(imgs[0].getAttribute("src")).toBe(pageUrl(file, 1, true));
  });
});

describe("computeResumeScroll", () => {
  const dims = [
    { width: 2160, height: 2824 }, // scaled height 1412 at width 1080
    { width: 2160, height: 2824 },
    { width: 2160, height: 2824 },
  ];
  const stripWidth = 1080;

  it("returns the top of the first page for {page:1, scroll:0}", () => {
    expect(computeResumeScroll(dims, stripWidth, { page: 1, scroll: 0 })).toBe(0);
  });

  it("returns the page offset for a whole-page resume", () => {
    expect(
      computeResumeScroll(dims, stripWidth, { page: 3, scroll: 0 })
    ).toBeCloseTo(1412 * 2, 6);
  });

  it("adds the within-page fraction to the page offset", () => {
    // page 2 top = 1412; half of its 1412px height = 706
    expect(
      computeResumeScroll(dims, stripWidth, { page: 2, scroll: 0.5 })
    ).toBeCloseTo(1412 + 706, 6);
  });

  it("is the inverse of scrollToResume (round trip)", () => {
    const px = computeResumeScroll(dims, stripWidth, { page: 2, scroll: 0.25 });
    const resume = scrollToResume(dims, stripWidth, px);
    expect(resume.page).toBe(2);
    expect(resume.scroll).toBeCloseTo(0.25, 6);
  });
});

describe("scrollToResume", () => {
  const dims = [
    { width: 2160, height: 2824 },
    { width: 2160, height: 2824 },
  ];
  const stripWidth = 1080;

  it("maps a scrollTop inside the first page to {page:1, fraction}", () => {
    const r = scrollToResume(dims, stripWidth, 706); // halfway down page 1
    expect(r.page).toBe(1);
    expect(r.scroll).toBeCloseTo(0.5, 6);
  });

  it("clamps a negative scrollTop to the top of page 1", () => {
    expect(scrollToResume(dims, stripWidth, -50)).toEqual({ page: 1, scroll: 0 });
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invokes immediately on the leading edge then collapses a burst", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("a");
    throttled("b");
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");

    // The trailing call fires once at the end of the window with latest args.
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("flush() invokes a pending trailing call immediately", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("x"); // leading
    throttled("y"); // pending trailing
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("y");
  });
});
