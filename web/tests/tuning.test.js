// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildTuningPanel, TUNING_FIELDS } from "../js/tuning.js";

/** Sample params covering every tunable key (mirrors the backend defaults). */
function sampleParams() {
  return {
    setpoint: 0.4,
    deadzone: 10,
    coastMs: 800,
    maxVelocity: 480,
    maxStepPerFrame: 8,
    medianWindow: 5,
    alpha: 0.3,
    columnX0: 0.1,
    columnX1: 0.9,
    minConfidence: 0.5,
  };
}

/** Find the range input for a given param key inside the panel. */
function slider(panel, key) {
  return panel.querySelector(`input[type="range"][data-key="${key}"]`);
}

describe("buildTuningPanel", () => {
  it("renders one range slider per tunable param", () => {
    const panel = buildTuningPanel(sampleParams(), vi.fn());
    const keys = [
      "setpoint",
      "deadzone",
      "coastMs",
      "maxVelocity",
      "maxStepPerFrame",
      "medianWindow",
      "alpha",
      "columnX0",
      "columnX1",
      "minConfidence",
      "systemTopMargin",
      "overlayFadeMs",
      "overlayOpacity",
    ];
    for (const key of keys) {
      expect(slider(panel, key), `slider for ${key}`).toBeTruthy();
    }
    expect(panel.querySelectorAll('input[type="range"]')).toHaveLength(keys.length);
  });

  it("initialises each slider to the supplied param value", () => {
    const params = sampleParams();
    const panel = buildTuningPanel(params, vi.fn());
    for (const key of Object.keys(params)) {
      expect(Number(slider(panel, key).value)).toBe(params[key]);
    }
  });

  it("calls onChange(key, numericValue) when a slider moves", () => {
    const onChange = vi.fn();
    const panel = buildTuningPanel(sampleParams(), onChange);

    const setpoint = slider(panel, "setpoint");
    setpoint.value = "0.55";
    setpoint.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("setpoint", 0.55);
  });

  it("passes a numeric (not string) value to onChange", () => {
    const onChange = vi.fn();
    const panel = buildTuningPanel(sampleParams(), onChange);

    const dz = slider(panel, "deadzone");
    dz.value = "20";
    dz.dispatchEvent(new Event("input", { bubbles: true }));

    const [, value] = onChange.mock.calls[0];
    expect(typeof value).toBe("number");
    expect(value).toBe(20);
  });

  it("exposes the field metadata so the panel and tests stay in sync", () => {
    const fieldKeys = TUNING_FIELDS.map((f) => f.key);
    expect(fieldKeys).toEqual([
      "setpoint",
      "deadzone",
      "coastMs",
      "maxVelocity",
      "maxStepPerFrame",
      "medianWindow",
      "alpha",
      "columnX0",
      "columnX1",
      "minConfidence",
      "systemTopMargin",
      "overlayFadeMs",
      "overlayOpacity",
    ]);
    for (const f of TUNING_FIELDS) {
      expect(f.min).toBeLessThan(f.max);
      expect(f.step).toBeGreaterThan(0);
    }
  });

  it("labels each slider and shows its current value", () => {
    const panel = buildTuningPanel(sampleParams(), vi.fn());
    // The setpoint row should mention the key and render its value somewhere.
    const row = slider(panel, "setpoint").closest("label, .tuning-row");
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("setpoint");
    expect(row.textContent).toContain("0.4");
  });
});
