import { describe, it, expect } from "vitest";
import { applyRecenter, computeRecenterOffset } from "../js/gaze/calibration.js";

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
