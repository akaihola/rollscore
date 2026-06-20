/**
 * Calibration & recenter for the gaze reader.
 *
 * Two concerns live here:
 *
 *  1. **Calibration** (manual, DOM): a 9-point click grid (~20 s) that feeds
 *     WebGazer's regression — clicking a dot tells WebGazer "the eye is here
 *     now". The resulting model blob is handed to a `persist` callback (wired to
 *     `PUT /api/calibration` by the caller) so it survives a reload.
 *
 *  2. **Recenter** (pure): a one-key re-anchor for slow vertical drift. Pressing
 *     the key while looking at the setpoint line records an offset that is added
 *     to every subsequent `gazeY`. Only this math is unit-tested
 *     (`tests/calibration.test.js`); the grid is exercised manually.
 *
 * @typedef {import("./source.js").GazeSample} GazeSample
 */

/**
 * Offset that, added to the raw gaze y, maps it onto the reference line. Call at
 * the instant the user presses recenter while looking at the setpoint.
 *
 * @param {number} rawY       - raw (smoothed) gaze y at the moment of recenter
 * @param {number} referenceY - viewport y the gaze *should* read (the setpoint)
 * @returns {number} signed vertical offset
 */
export function computeRecenterOffset(rawY, referenceY) {
  return referenceY - rawY;
}

/**
 * Apply a stored recenter offset to a raw gaze y.
 * @param {number} y      - raw gaze y
 * @param {number} offset - offset from {@link computeRecenterOffset}
 * @returns {number} re-anchored gaze y
 */
export function applyRecenter(y, offset) {
  return y + offset;
}

/**
 * Extract WebGazer's trained model as a JSON-serializable blob suitable for
 * `PUT /api/calibration`. WebGazer persists its data to `localStorage` under
 * `webgazerGlobalData`; that is the portable representation we round-trip.
 *
 * @param {any} [storage] - storage object (defaults to `localStorage`)
 * @returns {any|null} the parsed blob, or null if nothing has been trained
 */
export function serializeCalibration(storage = globalThis.localStorage) {
  const raw = storage?.getItem?.("webgazerGlobalData");
  return raw ? JSON.parse(raw) : null;
}

/**
 * Restore a previously-saved calibration blob into WebGazer's `localStorage`
 * slot. Call before `webgazer.begin()` so the regression loads the saved model.
 *
 * @param {any} blob       - blob from {@link serializeCalibration}
 * @param {any} [storage]  - storage object (defaults to `localStorage`)
 */
export function restoreCalibration(blob, storage = globalThis.localStorage) {
  if (blob != null) storage?.setItem?.("webgazerGlobalData", JSON.stringify(blob));
}

/**
 * Show the 9-point click-calibration overlay. Each dot must be clicked
 * `clicksPerPoint` times; WebGazer records each click as a training sample.
 * Resolves with the serialized calibration blob once every dot is done.
 *
 * Each click is fed to the regression *explicitly* via `recordScreenPosition`
 * rather than relying on WebGazer's global click listener: the live reader
 * removes the mouse listeners (so an idle gaze isn't continuously retrained to
 * the cursor / last click), which would otherwise also silence calibration.
 *
 * @param {Object} opts
 * @param {Document} opts.document
 * @param {any}     [opts.webgazer]        - WebGazer instance (defaults to global)
 * @param {number}  [opts.clicksPerPoint]  - clicks needed per dot (default 3)
 * @param {() => void} [opts.onProgress]    - called after each registered click
 * @returns {Promise<any>} the calibration blob (also passed to `persist` if given)
 */
export function runCalibration({
  document,
  webgazer = globalThis.webgazer,
  clicksPerPoint = 3,
  onProgress,
} = {}) {
  const xs = [0.1, 0.5, 0.9];
  const ys = [0.1, 0.5, 0.9];

  return new Promise((resolve) => {
    const dots = [];
    let remaining = xs.length * ys.length;

    const cleanup = () => dots.forEach((d) => d.remove());

    for (const fy of ys) {
      for (const fx of xs) {
        const dot = document.createElement("div");
        dot.className = "cal-dot";
        dot.style.left = `${fx * 100}vw`;
        dot.style.top = `${fy * 100}vh`;
        let clicks = 0;
        dot.textContent = String(clicksPerPoint);
        dot.addEventListener("click", (e) => {
          // Explicitly train the regression at the click location.
          webgazer?.recordScreenPosition?.(e.clientX, e.clientY, "click");
          clicks += 1;
          dot.textContent = String(Math.max(0, clicksPerPoint - clicks));
          if (onProgress) onProgress();
          if (clicks >= clicksPerPoint) {
            dot.classList.add("done");
            dot.style.pointerEvents = "none";
            remaining -= 1;
            if (remaining === 0) {
              cleanup();
              resolve(serializeCalibration());
            }
          }
        });
        document.body.appendChild(dot);
        dots.push(dot);
      }
    }
  });
}
