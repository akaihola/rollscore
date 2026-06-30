/**
 * {@link GazeSource} backed by WebGazer.js (`web/vendor/webgazer.js`, loaded as a
 * global `<script>`). A deliberately thin adapter: it only translates WebGazer's
 * gaze listener into our `{x, y, confidence, t}` sample shape and owns the
 * begin/end lifecycle. All scroll logic stays in `control.js`, so this file is
 * exercised manually in the reader, not unit-tested.
 *
 * WebGazer exposes no native confidence. We emit a constant `confidence` and let
 * the on-music gate (`isReading`) and the smoother in `control.js` reject
 * off-score glances and jitter. The constant is configurable so the gate can be
 * effectively disabled (1.0) or biased in tuning.
 *
 * @typedef {import("./source.js").GazeSample} GazeSample
 */
export class WebGazerGazeSource {
  /**
   * @param {Object} [opts]
   * @param {any}    [opts.webgazer]   - WebGazer instance (defaults to global `webgazer`)
   * @param {number} [opts.confidence] - constant confidence in [0, 1] (default 1)
   * @param {string} [opts.faceMeshSolutionPath] - CDN path for FaceMesh assets
   *   (the Brown build's relative default 404s; pin to a known-good MediaPipe CDN)
   */
  constructor({
    webgazer = globalThis.webgazer,
    confidence = 1,
    faceMeshSolutionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619",
  } = {}) {
    this._wg = webgazer;
    this._confidence = confidence;
    this._faceMeshSolutionPath = faceMeshSolutionPath;
    this._cb = null;
  }

  /** @param {(s: GazeSample) => void} cb */
  onSample(cb) {
    this._cb = cb;
  }

  /**
   * Configure regression, wire the gaze listener, and begin tracking.
   * @returns {Promise<void>} resolves once WebGazer has started.
   */
  start() {
    const wg = this._wg;
    if (this._faceMeshSolutionPath) {
      wg.params.faceMeshSolutionPath = this._faceMeshSolutionPath;
    }
    // weightedRidge weights samples by √(1/age) (newest = full weight, oldest
    // decays), so head-pose drift across a session doesn't vote forever. Shares
    // the same getData/setData blob shape as plain ridge — persistence and
    // previously saved blobs are unaffected.
    wg.setRegression("weightedRidge").setGazeListener((data, t) => {
      if (!data || !this._cb) return;
      this._cb({ x: data.x, y: data.y, confidence: this._confidence, t });
    });
    return wg.begin().then(() => {
      // Hide WebGazer's built-in prediction dot — we render our own dual dots
      // (raw + control-path) via createGazeDots() in the frame loop.
      wg.showPredictionPoints(false);
      // WebGazer treats every mouse move/click as ground truth and retrains the
      // regression on the cursor. That makes an *idle* gaze snap back to the last
      // cursor/click position instead of following the eyes. Drop the listeners
      // so prediction is camera-only; calibration trains explicitly via
      // `recordScreenPosition` (see calibration.js).
      wg.removeMouseEventListeners();
      return wg;
    });
  }

  /**
   * Return the current regression's training data blob, or null if the model is
   * empty. The blob is suitable for `PUT /api/calibration` and can be restored
   * via {@link setCalibration}.
   * @returns {any|null}
   */
  getCalibration() {
    const blob = this._wg.getRegression?.()?.[0]?.getData?.();
    if (!blob || !blob.length) return null;
    return blob;
  }

  /**
   * Load a previously-saved calibration blob into the regression via `setData()`.
   * A null blob is a no-op. Must be called after {@link start} so the regression
   * exists.
   *
   * The blob's `eyes.*.patch.data` is a plain JS object `{0:v,1:v,...}` after a
   * JSON round-trip (Uint8ClampedArray serializes that way). `setData` passes it
   * to `new Uint8ClampedArray(patch.data)` which needs an array-like with `.length`
   * — a plain object has no `.length`, so it produces an empty array and crashes
   * `new ImageData(...)`. Convert each patch.data to a plain Array first.
   * @param {any} blob
   */
  setCalibration(blob) {
    if (blob == null) return;
    const reg = this._wg.getRegression?.()?.[0];
    if (!reg) return;
    blob.forEach(entry => {
      for (const side of ["left", "right"]) {
        const eye = entry.eyes?.[side];
        if (eye && eye.patch?.data && !ArrayBuffer.isView(eye.patch.data)) {
          const n = eye.width * eye.height * 4;
          const arr = new Array(n);
          for (let i = 0; i < n; i++) arr[i] = eye.patch.data[i] ?? 0;
          eye.patch.data = arr;
        }
      }
    });
    reg.setData?.(blob);
  }

  /** End tracking and clear the listener. */
  stop() {
    this._wg.clearGazeListener();
    this._wg.end();
  }
}
