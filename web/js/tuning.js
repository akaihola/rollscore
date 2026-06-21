/**
 * Dev tuning panel: a column of sliders, one per gaze-control parameter, so the
 * controller can be tuned live (and the result persisted) without editing code.
 *
 * `buildTuningPanel(params, onChange)` is pure DOM — no controller, no API. It
 * renders a labelled range slider per field showing the current value; moving a
 * slider fires `onChange(key, numericValue)`. The reader wires that callback to
 * update the live controller and to PUT `/api/tuning` (throttled). The panel is
 * hidden by default and toggled with `t` (see `controls.js` / `main.js`).
 *
 * `TUNING_FIELDS` is the single source of truth for which params are tunable and
 * each slider's range/step; it mirrors `TUNING_DEFAULTS` in the backend state
 * store. Keep the two in sync when adding a parameter.
 */

/**
 * Tunable parameters with sensible slider bounds. `step` controls slider
 * granularity; `min`/`max` bracket a useful range (not a hard constraint — the
 * persisted value is whatever the slider lands on).
 */
export const TUNING_FIELDS = [
  { key: "setpoint", min: 0.1, max: 0.9, step: 0.01 }, // read-position target (fraction of viewport)
  { key: "deadzone", min: 0, max: 60, step: 1 }, // px error band around the setpoint
  { key: "coastMs", min: 0, max: 3000, step: 50 }, // coast duration after gaze is lost
  { key: "maxVelocity", min: 0, max: 1200, step: 10 }, // px/s clamp on the velocity estimate
  { key: "maxStepPerFrame", min: 0, max: 40, step: 1 }, // px cap on a single frame's step
  { key: "medianWindow", min: 1, max: 15, step: 1 }, // samples in the smoothing median
  { key: "alpha", min: 0.05, max: 1, step: 0.05 }, // EMA smoothing factor
  { key: "columnX0", min: 0, max: 0.5, step: 0.01 }, // left edge of the music column (fraction)
  { key: "columnX1", min: 0.5, max: 1, step: 0.01 }, // right edge of the music column (fraction)
  { key: "minConfidence", min: 0, max: 1, step: 0.05 }, // gaze-confidence gate
];

/**
 * Build the tuning panel DOM. Returns the panel element (caller appends it and
 * toggles its visibility). `params` seeds the slider values; `onChange(key,
 * value)` fires on every slider move with the numeric value.
 */
export function buildTuningPanel(params, onChange) {
  const panel = document.createElement("div");
  panel.className = "tuning-panel";

  const title = document.createElement("div");
  title.className = "tuning-title";
  title.textContent = "Tuning (t to hide)";
  panel.append(title);

  for (const field of TUNING_FIELDS) {
    const { key, min, max, step } = field;
    const value = params[key];

    const row = document.createElement("label");
    row.className = "tuning-row";

    const name = document.createElement("span");
    name.className = "tuning-key";
    name.textContent = key;

    const readout = document.createElement("span");
    readout.className = "tuning-value";
    readout.textContent = String(value);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.dataset.key = key;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);

    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      readout.textContent = String(v);
      onChange(key, v);
    });

    row.append(name, slider, readout);
    panel.append(row);
  }

  return panel;
}
