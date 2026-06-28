## Why

Recording a calibration point currently requires pressing `g` while looking at
the cursor — a three-step gesture (move mouse, fixate, reach for the keyboard).
A click is the natural way to express "I am looking here," but plain clicks are
already bound to the reader's tap zones (pause / nudge / recenter). Adding a
modified click as a calibration trigger gives a one-gesture way to add a point
exactly where the eye is, without disturbing the existing click behavior.

## What Changes

- **Shift+click** anywhere in the reader records a calibration training point at
  the click location (`e.clientX`/`e.clientY`), feeding WebGazer's regression the
  same way the `g` key and the 9-dot grid do.
- Plain (unmodified) clicks are unchanged — they keep their tap-zone meaning
  (recenter / nudge / toggle pause).
- The `g` key is unchanged — it still records at the tracked cursor position.
- Status text and the on-screen calibration hint mention Shift+click alongside
  `g`.

## Capabilities

### New Capabilities
- `gaze-calibration`: manual gaze-calibration input — how the reader lets the
  player feed training points to WebGazer (the `g` key at the cursor,
  Shift+click at the click location) without retraining on ordinary reading
  clicks.

### Modified Capabilities
<!-- none: no existing spec covers calibration input -->

## Impact

- `web/js/controls.js` — `bindControls`/`onClick` must distinguish a modified
  click from a plain click and route it to a new `calibrateAt(x, y)` handler.
- `web/js/main.js` — wire the `calibrateAt` handler (record at click xy + persist
  the blob); update the calibration hint/status strings.
- No backend, API, or dependency changes.
