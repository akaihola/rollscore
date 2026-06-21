// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyCropMode,
  buildStrip,
  computeResumeScroll,
  scrollToResume,
  throttle,
  pageToScroll,
  setAnnotation,
  onScoreEnd,
  pieceJumpPage,
} from "../js/reader.js";
import { pageUrl } from "../js/api.js";

// Two portrait pages at the standard canvas aspect (2160×2824).
const pageDims = () => [
  { width: 2160, height: 2824 },
  { width: 2160, height: 2824 },
];

describe("buildStrip", () => {
  const file = "Études, Op. 10.pdf";

  it("creates one lazy <img> per page with the correct page URL", () => {
    const strip = buildStrip({ file, pageDims: pageDims() });
    const imgs = [...strip.querySelectorAll("img")];

    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img.loading).toBe("lazy");
    expect(imgs[0].getAttribute("src")).toBe(pageUrl(file, 1, false));
    expect(imgs[1].getAttribute("src")).toBe(pageUrl(file, 2, false));
  });

  it("tags each image with its 1-based page number", () => {
    const strip = buildStrip({ file, pageDims: pageDims() });
    const imgs = [...strip.querySelectorAll("img")];
    expect(imgs.map((i) => i.dataset.page)).toEqual(["1", "2"]);
  });

  it("wraps each img in a div.page-wrapper", () => {
    const strip = buildStrip({ file, pageDims: pageDims() });
    const wrappers = [...strip.querySelectorAll(".page-wrapper")];
    expect(wrappers).toHaveLength(2);
    for (const w of wrappers) {
      expect(w.querySelector("img.page")).not.toBeNull();
    }
  });

  it("makes pages responsive: full container width, aspect-ratio reserved", () => {
    // The image must scale to the container width (never its natural 2160px)
    // and reserve its height before load via the page's aspect-ratio.
    const strip = buildStrip({ file, pageDims: pageDims() });
    const imgs = [...strip.querySelectorAll("img")];
    for (const img of imgs) {
      expect(img.style.width).toBe("100%");
      expect(img.style.aspectRatio).toBe("2160 / 2824");
      // No fixed pixel width that could exceed the window and clip.
      expect(img.style.width).not.toMatch(/px/);
    }
  });

  it("honours the annotated flag in image URLs", () => {
    const strip = buildStrip({
      file,
      pageDims: pageDims(),
      annotated: true,
    });
    const imgs = [...strip.querySelectorAll("img")];
    expect(imgs[0].getAttribute("src")).toBe(pageUrl(file, 1, true));
  });
});

// La Maja page 1 has a tight horizontal crop: zoom=1.1817, trOffset=[79, 83.69].
// Page canvas is 2160×2795 (612×792 pt page at fit=2160/612).
// Expected tx% = -80*79/612 ≈ -10.327, ty% = -80*83.69*2160/(612*2795) ≈ -8.454
const CANVAS_W = 2160;
const CANVAS_PT_W = 612;
const laMajaExtDims = [
  { width: CANVAS_W, height: 2795, zoom: 1.1817, trOffset: [79.0, 83.69] }, // p1: tight horiz crop
  { width: CANVAS_W, height: 2795, zoom: 1.1073, trOffset: [43.56, 15.58] }, // p2: more margin
  { width: CANVAS_W, height: 2795, zoom: 1.0, trOffset: null },              // p3: no crop
];

function expectedTx(trOffset0) {
  return (-80 * trOffset0) / CANVAS_PT_W;
}
function expectedTy(trOffset1, canvasH) {
  return (-80 * trOffset1 * CANVAS_W) / (CANVAS_PT_W * canvasH);
}

describe("applyCropMode", () => {
  const file = "4 La Maja y el Ruisenor.pdf";

  function buildLaMajaStrip() {
    return buildStrip({ file, pageDims: laMajaExtDims });
  }

  it("in crop mode: sets transform and overflow:hidden on each cropped page", () => {
    const strip = buildLaMajaStrip();
    applyCropMode(strip, laMajaExtDims, true);

    // Page 1 — tight horizontal crop
    const w1 = strip.querySelectorAll(".page-wrapper")[0];
    const img1 = w1.querySelector("img.page");
    expect(img1.style.transformOrigin).toBe("0 0");
    expect(img1.style.transform).not.toBe("");
    expect(w1.style.overflow).toBe("hidden");

    // Verify numeric values for page 1
    const tx1 = expectedTx(79.0);
    const ty1 = expectedTy(83.69, 2795);
    expect(img1.style.transform).toContain(`translate(${tx1}%`);
    expect(img1.style.transform).toContain(`scale(1.1817)`);

    // Page 2 — has crop
    const w2 = strip.querySelectorAll(".page-wrapper")[1];
    const img2 = w2.querySelector("img.page");
    expect(img2.style.transform).not.toBe("");
    expect(w2.style.overflow).toBe("hidden");
  });

  it("in crop mode: page with default params (zoom=1, no trOffset) gets no transform", () => {
    const strip = buildLaMajaStrip();
    applyCropMode(strip, laMajaExtDims, true);

    const w3 = strip.querySelectorAll(".page-wrapper")[2];
    const img3 = w3.querySelector("img.page");
    expect(img3.style.transform).toBe("");
    expect(w3.style.overflow).toBe("");
  });

  it("in full-page mode: clears transform and overflow on all pages", () => {
    const strip = buildLaMajaStrip();
    // First apply crop, then clear it
    applyCropMode(strip, laMajaExtDims, true);
    applyCropMode(strip, laMajaExtDims, false);

    for (const wrapper of strip.querySelectorAll(".page-wrapper")) {
      const img = wrapper.querySelector("img.page");
      expect(img.style.transform).toBe("");
      expect(img.style.transformOrigin).toBe("");
      expect(wrapper.style.overflow).toBe("");
    }
  });

  it("tx% is negative when trOffset[0] > 0 (shifts img left to show the right crop region)", () => {
    const strip = buildLaMajaStrip();
    applyCropMode(strip, laMajaExtDims, true);
    const img1 = strip.querySelectorAll("img.page")[0];
    // transform is e.g. "translate(-10.327%, -8.454%) scale(1.1817)"
    const match = img1.style.transform.match(/translate\((-?[\d.]+)%/);
    expect(match).not.toBeNull();
    expect(parseFloat(match[1])).toBeLessThan(0);
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

describe("pageToScroll (piece jump)", () => {
  const dims = [
    { width: 2160, height: 2824 }, // 1412 px tall at width 1080
    { width: 2160, height: 2824 },
    { width: 2160, height: 2824 },
  ];
  const stripWidth = 1080;

  it("returns 0 for page 1", () => {
    expect(pageToScroll(dims, stripWidth, 1)).toBe(0);
  });

  it("returns the cumulative height above a later page", () => {
    expect(pageToScroll(dims, stripWidth, 3)).toBeCloseTo(1412 * 2, 6);
  });
});

describe("setAnnotation", () => {
  const file = "Études, Op. 10.pdf";
  const dims = [
    { width: 2160, height: 2824 },
    { width: 2160, height: 2824 },
  ];

  it("swaps every page image between annotated and un-annotated URLs", () => {
    const strip = buildStrip({ file, pageDims: dims });
    let imgs = [...strip.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      pageUrl(file, 1, false),
      pageUrl(file, 2, false),
    ]);

    setAnnotation(strip, file, true);
    imgs = [...strip.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      pageUrl(file, 1, true),
      pageUrl(file, 2, true),
    ]);

    setAnnotation(strip, file, false);
    imgs = [...strip.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      pageUrl(file, 1, false),
      pageUrl(file, 2, false),
    ]);
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

describe("onScoreEnd — setlist context", () => {
  const setlist = () => ({
    items: [
      { title: "Prelude", file: "a.pdf" },
      { title: "Fugue", file: "b.pdf" },
      { title: "Coda", file: "c.pdf" },
    ],
    index: 0,
  });

  it("never auto-advances when a setlist piece ends", () => {
    const out = onScoreEnd({ setlist: setlist() });
    expect(out.advance).toBe(false);
  });

  it("surfaces the next piece as a waiting affordance", () => {
    const out = onScoreEnd({ setlist: { ...setlist(), index: 0 } });
    expect(out.next).toEqual({ title: "Fugue", file: "b.pdf" });
    expect(out.message).toContain("Fugue");
  });

  it("offers nothing past the last piece of a setlist", () => {
    const out = onScoreEnd({ setlist: { ...setlist(), index: 2 } });
    expect(out.advance).toBe(false);
    expect(out.next).toBeNull();
  });

  it("does nothing outside a setlist context", () => {
    const out = onScoreEnd({ setlist: null });
    expect(out.advance).toBe(false);
    expect(out.next).toBeNull();
    expect(out.message).toBeNull();
  });
});

describe("pieceJumpPage", () => {
  const pieces = () => [
    { first_page: 1, last_page: 3 },
    { first_page: 4, last_page: 6 },
    { first_page: 7, last_page: 9 },
  ];

  it("jumps forward to the next piece's first page", () => {
    expect(pieceJumpPage(pieces(), 5, 1)).toBe(7);
  });

  it("jumps back to the previous piece's first page", () => {
    expect(pieceJumpPage(pieces(), 5, -1)).toBe(1);
  });

  it("returns null past the last piece", () => {
    expect(pieceJumpPage(pieces(), 8, 1)).toBeNull();
  });

  it("returns null before the first piece", () => {
    expect(pieceJumpPage(pieces(), 1, -1)).toBeNull();
  });

  it("returns null when there are no pieces", () => {
    expect(pieceJumpPage([], 1, 1)).toBeNull();
  });
});
