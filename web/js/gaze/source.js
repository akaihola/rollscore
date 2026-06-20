/**
 * Gaze-source abstraction: the boundary between "where is the eye looking" and
 * the pure scroll controller (`control.js`). A source pushes raw gaze samples;
 * the controller consumes them. Swapping a real camera for a scripted trace is
 * just swapping the source, so the controller stays camera- and DOM-free.
 *
 * @typedef {Object} GazeSample
 * @property {number} x          - gaze x in CSS pixels (viewport coords)
 * @property {number} y          - gaze y in CSS pixels (viewport coords)
 * @property {number} confidence - signal quality in [0, 1]
 * @property {number} t          - sample timestamp in milliseconds
 *
 * @typedef {Object} GazeSource
 * @property {() => void} start                       - begin emitting samples
 * @property {() => void} stop                        - stop; emit nothing further
 * @property {(cb: (s: GazeSample) => void) => void} onSample - register a listener
 */

/**
 * A {@link GazeSource} that replays a fixed array of samples — no camera. Used
 * by the controller tests and manual demos to drive the pipeline with a
 * deterministic gaze trace. `start()` emits every sample synchronously, in
 * order, through the registered listener; `stop()` halts emission (so a
 * listener can stop the stream mid-replay).
 */
export class ScriptedGazeSource {
  /** @param {GazeSample[]} samples */
  constructor(samples) {
    this._samples = samples;
    this._cb = null;
    this._running = false;
  }

  /** @param {(s: GazeSample) => void} cb */
  onSample(cb) {
    this._cb = cb;
  }

  start() {
    this._running = true;
    for (const sample of this._samples) {
      if (!this._running) break;
      if (this._cb) this._cb(sample);
    }
  }

  stop() {
    this._running = false;
  }
}
