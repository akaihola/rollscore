// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { buildStrip } from "../js/reader.js";
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
