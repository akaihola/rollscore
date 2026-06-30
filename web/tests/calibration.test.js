// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  applyRecenter,
  computeRecenterOffset,
  runCalibration,
  serializeCalibration,
  restoreCalibration,
  currentOrientation,
  isCalibrationValidForScale,
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

  it("clears prior calibration data once, before any dot is clicked", async () => {
    document.body.innerHTML = "";
    const calls = [];
    const clearData = vi.fn(() => calls.push("clear"));
    const recordScreenPosition = vi.fn(() => calls.push("record"));
    const promise = runCalibration({
      document,
      webgazer: { clearData, recordScreenPosition },
      clicksPerPoint: 1,
    });
    document
      .querySelectorAll(".cal-dot")
      .forEach((dot) => dot.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await promise;
    expect(clearData).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("clear"); // before any recordScreenPosition
  });

  it("does not require clearData to exist (g / Shift+click never call runCalibration)", async () => {
    // g and Shift+click train via recordScreenPosition directly, bypassing
    // runCalibration entirely, so they never trigger a clear.
    document.body.innerHTML = "";
    const recordScreenPosition = vi.fn();
    const promise = runCalibration({
      document,
      webgazer: { recordScreenPosition }, // no clearData — must not throw
      clicksPerPoint: 1,
    });
    document
      .querySelectorAll(".cal-dot")
      .forEach((dot) => dot.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(promise).resolves.toBe(true);
  });

  it("abandoning a grid pass before any click leaves an empty model unpersisted", async () => {
    // Starting the grid clears the regression; cancelling before a click means
    // no point was ever recorded, so the existing empty-model rule keeps the
    // previously saved calibration intact (serializeCalibration returns null).
    document.body.innerHTML = "";
    const reg = makeReg([]); // clearData empties it; no clicks land
    const promise = runCalibration({
      document,
      webgazer: { clearData: vi.fn(), recordScreenPosition: vi.fn() },
      clicksPerPoint: 1,
    });
    promise.cancel();
    await promise;
    expect(serializeCalibration(reg, 1)).toBeNull();
  });
});

// Task 7.1: currentOrientation
describe("currentOrientation", () => {
  it("returns portrait when matchMedia matches portrait", () => {
    const fakeMatcher = (q) => ({ matches: q === "(orientation: portrait)" });
    expect(currentOrientation(fakeMatcher)).toBe("portrait");
  });

  it("returns landscape when matchMedia does not match portrait", () => {
    const fakeMatcher = () => ({ matches: false });
    expect(currentOrientation(fakeMatcher)).toBe("landscape");
  });

  it("defaults to landscape when matchMedia is unavailable", () => {
    expect(currentOrientation(null)).toBe("landscape");
  });
});

// Task 7.3: isCalibrationValidForScale
describe("isCalibrationValidForScale", () => {
  it("returns true when entry dpr matches current dpr", () => {
    expect(isCalibrationValidForScale({ blob: [], dpr: 2 }, 2)).toBe(true);
  });

  it("returns false on dpr mismatch", () => {
    expect(isCalibrationValidForScale({ blob: [], dpr: 1 }, 2)).toBe(false);
  });

  it("returns false when entry dpr is null (legacy / unknown scale)", () => {
    expect(isCalibrationValidForScale({ blob: [], dpr: null }, 1)).toBe(false);
  });

  it("returns false for null entry", () => {
    expect(isCalibrationValidForScale(null, 1)).toBe(false);
  });
});

// Real getData() shape: array of {eyes, screenPos, type} objects (empty = [])
const FAKE_POINT = { eyes: {}, screenPos: [400, 300], type: "click" };

describe("serializeCalibration", () => {
  it("returns {blob, dpr} for a non-empty model", () => {
    const blob = [FAKE_POINT];
    const reg = makeReg(blob);
    const result = serializeCalibration(reg, 2);
    expect(result).toEqual({ blob, dpr: 2 });
    expect(result.blob).toBe(blob); // same reference
  });

  it("includes dpr in the returned entry", () => {
    const reg = makeReg([FAKE_POINT]);
    expect(serializeCalibration(reg, 1.5)).toMatchObject({ dpr: 1.5 });
  });

  it("returns null when getData() has no points (empty array)", () => {
    expect(serializeCalibration(makeReg([]), 1)).toBeNull();
  });

  it("returns null when regression is missing", () => {
    expect(serializeCalibration(undefined, 1)).toBeNull();
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
    restoreCalibration(serializeCalibration(regA, 1).blob, regB);
    expect(regB.setData).toHaveBeenCalledWith(blob);
  });
});

// Task 7.4: orientation-keyed round-trip
describe("orientation-keyed calibration round-trip", () => {
  it("a saved landscape entry restores into landscape and not portrait", () => {
    const landBlob = [FAKE_POINT];
    const landReg = makeReg(landBlob);
    const entry = serializeCalibration(landReg, 1);
    // Simulate what the backend returns per orientation:
    const store = { landscape: entry, portrait: null };

    // Restoring landscape puts data in the target regression.
    const reg = makeReg([]);
    restoreCalibration(store.landscape.blob, reg);
    expect(reg.setData).toHaveBeenCalledWith(landBlob);

    // Portrait slot is null — no data to restore.
    expect(store.portrait).toBeNull();
  });
});
