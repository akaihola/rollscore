/**
 * Manual controls for the reader: keyboard shortcuts and invisible tap zones.
 *
 * `bindControls` is the single input abstraction — every gesture maps to a named
 * handler, never to a behaviour directly. A foot pedal (or any future input) can
 * dispatch the same handler names without touching the reader. Keyboard events
 * are caught on the document (so the reader needs no focus); taps are caught on
 * the passed element and routed to a zone by where they land in its box.
 *
 * Handlers (all optional): `togglePause`, `recenter`, `nudge(delta)` where delta
 * is +1 (forward) / -1 (back), `prevPiece`, `nextPiece`, `backToChooser`,
 * `toggleAnnotations`, `startCalibration`, `captureCalibration` (record the
 * cursor position as a gaze training point — see the reader), `toggleTuning`
 * (show/hide the dev tuning panel), `toggleCrop` (switch between forScore's
 * zoomed/cropped view and the full-page view).
 *
 * Returns an unbind function that detaches both listeners.
 */

/** key → (handlers) → invoked action. Centralises the keymap for both docs and tests. */
const KEY_ACTIONS = {
  " ": (h) => h.togglePause?.(),
  r: (h) => h.recenter?.(),
  ArrowDown: (h) => h.nudge?.(1),
  ArrowUp: (h) => h.nudge?.(-1),
  "[": (h) => h.prevPiece?.(),
  PageUp: (h) => h.prevPiece?.(),
  "]": (h) => h.nextPiece?.(),
  PageDown: (h) => h.nextPiece?.(),
  Escape: (h) => h.backToChooser?.(),
  a: (h) => h.toggleAnnotations?.(),
  c: (h) => h.startCalibration?.(),
  g: (h) => h.captureCalibration?.(),
  t: (h) => h.toggleTuning?.(),
  z: (h) => h.toggleCrop?.(),
};

/**
 * Route a click at fractional position `(fx, fy)` in the element to a handler.
 *
 * The box is a 3×3 grid: the four corners recenter; the top- and bottom-middle
 * edges nudge back/forward; the centre toggles pause. The left/right-middle
 * edges are intentionally inert (no accidental action from a stray side tap).
 */
function tapAction(fx, fy, h) {
  const col = fx < 1 / 3 ? "edge" : fx > 2 / 3 ? "edge" : "mid";
  const top = fy < 1 / 3;
  const bottom = fy > 2 / 3;
  if (col === "edge" && (top || bottom)) return h.recenter?.();
  if (col === "mid" && top) return h.nudge?.(-1);
  if (col === "mid" && bottom) return h.nudge?.(1);
  if (col === "mid") return h.togglePause?.();
  // left/right-middle: inert
}

export function bindControls(el, handlers) {
  const onKey = (e) => {
    const action = KEY_ACTIONS[e.key];
    if (action) {
      e.preventDefault();
      action(handlers);
    }
  };

  const onClick = (e) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    tapAction((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, handlers);
  };

  document.addEventListener("keydown", onKey);
  el.addEventListener("click", onClick);

  return () => {
    document.removeEventListener("keydown", onKey);
    el.removeEventListener("click", onClick);
  };
}
