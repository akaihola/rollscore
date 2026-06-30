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
 * Resolve the current viewport orientation.
 * @param {(q: string) => {matches: boolean}} [matchFn] - injectable for testing
 * @returns {"portrait" | "landscape"}
 */
export function currentOrientation(matchFn = globalThis.matchMedia?.bind(globalThis)) {
  if (!matchFn) return "landscape";
  return matchFn("(orientation: portrait)").matches ? "portrait" : "landscape";
}

/**
 * True iff the calibration entry's recorded display scale matches `dpr`.
 * @param {{blob: any, dpr: number|null}} entry
 * @param {number} dpr - current devicePixelRatio
 * @returns {boolean}
 */
export function isCalibrationValidForScale(entry, dpr) {
  return entry?.dpr === dpr;
}

/**
 * Extract WebGazer's trained model as a JSON-serializable entry `{blob, dpr}`
 * suitable for `PUT /api/calibration`. The `blob` is the regression's
 * `getData()` result; `dpr` is the training-time `devicePixelRatio` so a later
 * zoom change can be detected as invalidating. Returns null when the model holds
 * no usable training data.
 *
 * @param {any} [regression] - WebGazer regression (defaults to `getRegression()[0]`)
 * @param {number} [dpr] - training-time scale (defaults to `devicePixelRatio`)
 * @returns {{blob: any, dpr: number}|null}
 */
export function serializeCalibration(
  regression = globalThis.webgazer?.getRegression?.()[0],
  dpr = globalThis.devicePixelRatio ?? 1
) {
  const blob = regression?.getData?.();
  if (!blob || !blob.length) return null;
  return { blob, dpr };
}

/**
 * Restore a previously-saved calibration blob into WebGazer's regression via
 * `setData()`. Must be called after `webgazer.begin()` — the regression does
 * not exist until then. A null or missing blob is a no-op.
 *
 * @param {any} blob         - blob from {@link serializeCalibration}
 * @param {any} [regression] - WebGazer regression (defaults to `getRegression()[0]`)
 */
export function restoreCalibration(
  blob,
  regression = globalThis.webgazer?.getRegression?.()[0]
) {
  if (blob != null) regression?.setData?.(blob);
}

/**
 * Show the 9-point click-calibration overlay. Each dot must be clicked
 * `clicksPerPoint` times; WebGazer records each click as a training sample.
 * Resolves with `true` once every dot is done, or `null` if cancelled.
 *
 * Each click is fed to the regression *explicitly* via `recordScreenPosition`
 * rather than relying on WebGazer's global click listener: the live reader
 * removes the mouse listeners (so an idle gaze isn't continuously retrained to
 * the cursor / last click), which would otherwise also silence calibration.
 *
 * A fresh grid pass clears WebGazer's existing calibration data first, so the
 * grid always trains a clean model — the recovery path when accumulated
 * Shift+click/`g` points have drifted the model. `g` and Shift+click do not
 * clear; they keep appending to the live model. `clearData()` also clears
 * WebGazer's localforage, which we intentionally don't use (calibration
 * persists via `/api/calibration`), so that side effect is harmless.
 *
 * @param {Object} opts
 * @param {Document} opts.document
 * @param {any}     [opts.webgazer]        - WebGazer instance (defaults to global)
 * @param {number}  [opts.clicksPerPoint]  - clicks needed per dot (default 3)
 * @param {() => void} [opts.onProgress]    - called after each registered click
 * The returned promise carries a `cancel()` method that removes the dots and
 * resolves the promise with `null`. The reader calls it when the player abandons
 * calibration — re-pressing `c` (which restarts) or leaving for the library — so
 * the dots never outlive the calibration that created them.
 *
 * @returns {Promise<true|null> & {cancel: () => void}} resolves `true` on
 *   completion, or `null` if cancelled; `.cancel()` aborts it.
 */
export function runCalibration({
  document,
  webgazer = globalThis.webgazer,
  clicksPerPoint = 3,
  onProgress,
} = {}) {
  webgazer?.clearData?.();
  const xs = [0.1, 0.5, 0.9];
  const ys = [0.1, 0.5, 0.9];

  const dots = [];
  const cleanup = () => dots.forEach((d) => d.remove());
  let resolveFn;

  const promise = new Promise((resolve) => {
    resolveFn = resolve;
    let remaining = xs.length * ys.length;

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
              resolve(true);
            }
          }
        });
        document.body.appendChild(dot);
        dots.push(dot);
      }
    }
  });

  promise.cancel = () => {
    cleanup();
    resolveFn(null); // a no-op once the promise has already settled
  };
  return promise;
}
