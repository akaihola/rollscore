// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindControls } from "../js/controls.js";

/** A handlers object whose every entry is a spy. */
function spies() {
  return {
    togglePause: vi.fn(),
    recenter: vi.fn(),
    nudge: vi.fn(),
    prevPiece: vi.fn(),
    nextPiece: vi.fn(),
    backToChooser: vi.fn(),
    toggleAnnotations: vi.fn(),
    startCalibration: vi.fn(),
    captureCalibration: vi.fn(),
    toggleTuning: vi.fn(),
  };
}

/** Dispatch a keydown on the document with the given `key`. */
function keydown(key) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("bindControls — keyboard", () => {
  let handlers, unbind, el;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("div");
    document.body.append(el);
    handlers = spies();
    unbind = bindControls(el, handlers);
  });

  it("Space toggles pause", () => {
    keydown(" ");
    expect(handlers.togglePause).toHaveBeenCalledTimes(1);
  });

  it("r recenters", () => {
    keydown("r");
    expect(handlers.recenter).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown nudges forward, ArrowUp nudges back", () => {
    keydown("ArrowDown");
    keydown("ArrowUp");
    expect(handlers.nudge).toHaveBeenNthCalledWith(1, 1);
    expect(handlers.nudge).toHaveBeenNthCalledWith(2, -1);
  });

  it("[ and PageUp go to the previous piece", () => {
    keydown("[");
    keydown("PageUp");
    expect(handlers.prevPiece).toHaveBeenCalledTimes(2);
  });

  it("] and PageDown go to the next piece", () => {
    keydown("]");
    keydown("PageDown");
    expect(handlers.nextPiece).toHaveBeenCalledTimes(2);
  });

  it("Escape goes back to the chooser", () => {
    keydown("Escape");
    expect(handlers.backToChooser).toHaveBeenCalledTimes(1);
  });

  it("a toggles annotations", () => {
    keydown("a");
    expect(handlers.toggleAnnotations).toHaveBeenCalledTimes(1);
  });

  it("c starts calibration", () => {
    keydown("c");
    expect(handlers.startCalibration).toHaveBeenCalledTimes(1);
  });

  it("g captures a calibration point at the cursor", () => {
    keydown("g");
    expect(handlers.captureCalibration).toHaveBeenCalledTimes(1);
  });

  it("t toggles the tuning panel", () => {
    keydown("t");
    expect(handlers.toggleTuning).toHaveBeenCalledTimes(1);
  });

  it("an unhandled key fires nothing", () => {
    keydown("q");
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });

  it("unbind detaches the keyboard listener", () => {
    unbind();
    keydown(" ");
    expect(handlers.togglePause).not.toHaveBeenCalled();
  });
});

describe("bindControls — tap zones", () => {
  let handlers, el;

  /** Click `el` at the fractional position (fx, fy) of a 300×600 box. */
  function clickAt(fx, fy) {
    el.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 300, height: 600, right: 300, bottom: 600,
    });
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: fx * 300,
        clientY: fy * 600,
      })
    );
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("div");
    document.body.append(el);
    handlers = spies();
    bindControls(el, handlers);
  });

  it("a click in the center third toggles pause", () => {
    clickAt(0.5, 0.5);
    expect(handlers.togglePause).toHaveBeenCalledTimes(1);
  });

  it("a click on the top edge nudges back", () => {
    clickAt(0.5, 0.05);
    expect(handlers.nudge).toHaveBeenCalledWith(-1);
  });

  it("a click on the bottom edge nudges forward", () => {
    clickAt(0.5, 0.95);
    expect(handlers.nudge).toHaveBeenCalledWith(1);
  });

  it("a click in a corner recenters", () => {
    clickAt(0.05, 0.05);
    expect(handlers.recenter).toHaveBeenCalledTimes(1);
  });
});
