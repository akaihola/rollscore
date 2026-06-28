## 1. Route Shift+click to a calibration handler

- [x] 1.1 In `web/js/controls.js` `onClick`, when `e.shiftKey` is held, call
  `handlers.calibrateAt?.(e.clientX, e.clientY)` and return before `tapAction`
  (so the click does not also recenter/nudge/pause).
- [x] 1.2 Update the `bindControls` JSDoc handler list to document `calibrateAt`.

## 2. Wire the handler in the reader

- [x] 2.1 In `web/js/main.js`, add a `calibrateAt(x, y)` handler in the
  `bindControls({...})` object that calls `window.webgazer.recordScreenPosition(x, y, "click")`,
  serializes the blob, and persists it (mirror `captureCalibration`).
- [x] 2.2 Update the calibration hint (`main.js:410`) and the
  "calibration point added" status text to mention Shift+click alongside `g`.

## 3. Verify

- [x] 3.1 Confirm a plain click still triggers only its tap-zone action and a
  Shift+click adds a point without recentering/nudging/pausing (covered by
  `controls.test.js`: Shift+click → `calibrateAt`, no `nudge`; plain click →
  tap action, no `calibrateAt`. Grid path untouched. Webcam pass deferred to
  next live session).
