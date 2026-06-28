// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createSystemOverlay } from "../js/gaze/overlay.js";

function makeStrip(boxesByPage) {
  const strip = document.createElement("div");
  const overlay = createSystemOverlay(strip, boxesByPage, { opacity: 0.2, fadeMs: 250 });
  const layer = strip.querySelector(".system-overlay");
  return { strip, overlay, layer };
}

const BOXES = [
  [{ top: 100, bottom: 400, left: 0, right: 1000 }, { top: 450, bottom: 700, left: 0, right: 1000 }],
  [{ top: 100, bottom: 400, left: 0, right: 1000 }],
];

describe("createSystemOverlay", () => {
  it("is off by default and never intercepts pointer events (does not affect scroll)", () => {
    const { layer } = makeStrip(BOXES);
    expect(layer.style.display).toBe("none");
    expect(layer.style.pointerEvents).toBe("none");
    expect(layer.style.zIndex).toBe("-1"); // behind the music
  });

  it("crossfades on an active-system change: old box fades out, new fades in", () => {
    const { overlay, layer } = makeStrip(BOXES);
    overlay.setVisible(true);
    const [a, b] = layer.children[0] === undefined ? [] : [layer.children[0], layer.children[1]];

    overlay.setActive(0, 0);
    expect(layer.children[0].style.opacity).toBe("0.2");
    expect(layer.children[1].style.opacity).toBe("0");

    overlay.setActive(0, 1);
    expect(layer.children[0].style.opacity).toBe("0"); // faded out
    expect(layer.children[1].style.opacity).toBe("0.2"); // faded in
  });

  it("shows no box in the vertical-gaze fallback (active = null)", () => {
    const { overlay, layer } = makeStrip(BOXES);
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setActive(null, null);
    for (const d of layer.children) expect(d.style.opacity).toBe("0");
  });

  it("toggling visibility off does not change any box geometry (scroll-neutral)", () => {
    const { overlay, layer } = makeStrip(BOXES);
    const before = [...layer.children].map((d) => d.style.cssText);
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setVisible(false);
    expect(layer.style.display).toBe("none");
    // positions/sizes unchanged — the overlay only ever toggles opacity/display.
    [...layer.children].forEach((d, i) => {
      expect(d.style.left).toBe(before[i].match(/left: ([^;]+)/)?.[1] ?? d.style.left);
      expect(d.style.width).toBe(before[i].match(/width: ([^;]+)/)?.[1] ?? d.style.width);
    });
  });

  it("live param changes update the active box opacity and the fade duration", () => {
    const { overlay, layer } = makeStrip(BOXES);
    overlay.setVisible(true);
    overlay.setActive(0, 0);
    overlay.setParams({ opacity: 0.4, fadeMs: 100 });
    expect(layer.children[0].style.opacity).toBe("0.4");
    expect(layer.children[0].style.transition).toContain("100ms");
  });
});
