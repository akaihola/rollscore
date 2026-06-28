// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createSystemOverlay } from "../js/gaze/overlay.js";

// Boxes in canvas coordinates; dims give the page size the % positions are relative to.
const BOXES = [
  [{ top: 100, bottom: 400, left: 0, right: 1000 }, { top: 450, bottom: 700, left: 0, right: 1000 }],
  [{ top: 100, bottom: 400, left: 0, right: 1000 }],
];
const DIMS = [{ width: 1000, height: 1000 }, { width: 1000, height: 1000 }];

function makeStrip(boxesByPage = BOXES, dims = DIMS) {
  const strip = document.createElement("div");
  boxesByPage.forEach(() => {
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    strip.append(wrapper);
  });
  const overlay = createSystemOverlay(strip, boxesByPage, dims, { opacity: 0.2, fadeMs: 250 });
  const layers = [...strip.querySelectorAll(".system-overlay")];
  return { strip, overlay, layers };
}

describe("createSystemOverlay", () => {
  it("is off by default and never intercepts pointer events (does not affect scroll)", () => {
    const { layers } = makeStrip();
    for (const layer of layers) {
      expect(layer.style.display).toBe("none");
      expect(layer.style.pointerEvents).toBe("none");
      expect(layer.style.zIndex).toBe("2"); // in front of the opaque page renders
    }
  });

  it("nests one container per page inside its wrapper", () => {
    const { strip } = makeStrip();
    const wrappers = strip.querySelectorAll(".page-wrapper");
    expect(wrappers[0].querySelector(".system-overlay").children).toHaveLength(2);
    expect(wrappers[1].querySelector(".system-overlay").children).toHaveLength(1);
  });

  it("crossfades on an active-system change: old box fades out, new fades in", () => {
    const { overlay, layers } = makeStrip();
    overlay.setVisible(true);
    const [a, b] = layers[0].children;

    overlay.setActive(0, 0);
    expect(a.style.opacity).toBe("0.2");
    expect(b.style.opacity).toBe("0");

    overlay.setActive(0, 1);
    expect(a.style.opacity).toBe("0"); // faded out
    expect(b.style.opacity).toBe("0.2"); // faded in
  });

  it("shows no box in the vertical-gaze fallback (active = null)", () => {
    const { overlay, layers } = makeStrip();
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setActive(null, null);
    for (const layer of layers) for (const d of layer.children) expect(d.style.opacity).toBe("0");
  });

  it("toggling visibility off does not change any box geometry (scroll-neutral)", () => {
    const { overlay, layers } = makeStrip();
    const boxes = layers.flatMap((l) => [...l.children]);
    const before = boxes.map((d) => d.style.cssText);
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setVisible(false);
    for (const layer of layers) expect(layer.style.display).toBe("none");
    // positions/sizes unchanged — the overlay only ever toggles opacity/display.
    boxes.forEach((d, i) => {
      expect(d.style.left).toBe(before[i].match(/left: ([^;]+)/)?.[1] ?? d.style.left);
      expect(d.style.width).toBe(before[i].match(/width: ([^;]+)/)?.[1] ?? d.style.width);
    });
  });

  it("live param changes update the active box opacity and the fade duration", () => {
    const { overlay, layers } = makeStrip();
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setParams({ opacity: 0.4, fadeMs: 100 });
    expect(layers[0].children[0].style.opacity).toBe("0.4");
    expect(layers[0].children[0].style.transition).toContain("100ms");
  });
});
