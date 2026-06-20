// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  applyRecenter,
  computeRecenterOffset,
  runCalibration,
} from "../js/gaze/calibration.js";

describe("computeRecenterOffset", () => {
  it("is the signed gap from raw gaze to the reference line", () => {
    // looking at raw y=300 while the reference (setpoint) line is at y=400
    expect(computeRecenterOffset(300, 400)).toBe(100);
  });

  it("is negative when the raw gaze sits below the reference", () => {
    expect(computeRecenterOffset(500, 400)).toBe(-100);
  });
});

describe("applyRecenter", () => {
  it("adds the stored offset to a raw gaze y", () => {
    expect(applyRecenter(300, 100)).toBe(400);
  });

  it("is a no-op for a zero offset", () => {
    expect(applyRecenter(250, 0)).toBe(250);
  });

  it("round-trips: applying the computed offset maps raw → reference", () => {
    const rawAtRecenter = 280;
    const reference = 400;
    const offset = computeRecenterOffset(rawAtRecenter, reference);
    expect(applyRecenter(rawAtRecenter, offset)).toBe(reference);
  });
});

describe("runCalibration", () => {
  it("records each dot click as an explicit WebGazer training point", async () => {
    // With the global mouse listeners removed (so idle gaze isn't retrained to
    // the cursor), calibration must feed clicks to the regression itself.
    const recordScreenPosition = vi.fn();
    const promise = runCalibration({
      document,
      webgazer: { recordScreenPosition },
      clicksPerPoint: 1,
    });
    const dots = document.querySelectorAll(".cal-dot");
    expect(dots.length).toBe(9);
    dots.forEach((dot, i) =>
      dot.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10 + i, clientY: 20 + i })
      )
    );
    await promise;
    expect(recordScreenPosition).toHaveBeenCalledTimes(9);
    expect(recordScreenPosition).toHaveBeenNthCalledWith(1, 10, 20, "click");
  });
});
