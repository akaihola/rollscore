// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  applyRecenter,
  computeRecenterOffset,
  runCalibration,
  serializeCalibration,
  restoreCalibration,
} from "../js/gaze/calibration.js";

function makeReg(data) {
  let _data = data;
  return { getData: () => _data, setData: vi.fn((d) => { _data = d; }) };
}

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
    expect(document.querySelectorAll(".cal-dot").length).toBe(0); // cleaned up on completion
  });

  it("cancel() removes every dot and resolves the promise with null", async () => {
    document.body.innerHTML = "";
    const promise = runCalibration({
      document,
      webgazer: { recordScreenPosition: vi.fn() },
      clicksPerPoint: 3,
    });
    expect(document.querySelectorAll(".cal-dot").length).toBe(9);

    promise.cancel(); // abandon mid-calibration (e.g. press `c` again or leave)

    expect(document.querySelectorAll(".cal-dot").length).toBe(0);
    await expect(promise).resolves.toBeNull();
  });

  it("cancel() after completion is a harmless no-op", async () => {
    document.body.innerHTML = "";
    const promise = runCalibration({
      document,
      webgazer: { recordScreenPosition: vi.fn() },
      clicksPerPoint: 1,
    });
    document
      .querySelectorAll(".cal-dot")
      .forEach((dot) => dot.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await promise;
    expect(() => promise.cancel()).not.toThrow();
    expect(document.querySelectorAll(".cal-dot").length).toBe(0);
  });
});

// Real getData() shape: array of {eyes, screenPos, type} objects (empty = [])
const FAKE_POINT = { eyes: {}, screenPos: [400, 300], type: "click" };

describe("serializeCalibration", () => {
  it("returns getData() blob for a non-empty model", () => {
    const blob = [FAKE_POINT];
    const reg = makeReg(blob);
    expect(serializeCalibration(reg)).toBe(blob);
  });

  it("returns null when getData() has no points (empty array)", () => {
    expect(serializeCalibration(makeReg([]))).toBeNull();
  });

  it("returns null when regression is missing", () => {
    expect(serializeCalibration(undefined)).toBeNull();
  });
});

describe("restoreCalibration", () => {
  it("calls setData with the blob", () => {
    const blob = [FAKE_POINT];
    const reg = makeReg([]);
    restoreCalibration(blob, reg);
    expect(reg.setData).toHaveBeenCalledWith(blob);
  });

  it("is a no-op for null blob", () => {
    const reg = makeReg([]);
    restoreCalibration(null, reg);
    expect(reg.setData).not.toHaveBeenCalled();
  });

  it("round-trip: transfers training data from one regression to another", () => {
    const blob = [FAKE_POINT];
    const regA = makeReg(blob);
    const regB = makeReg([]);
    restoreCalibration(serializeCalibration(regA), regB);
    expect(regB.setData).toHaveBeenCalledWith(blob);
  });
});
