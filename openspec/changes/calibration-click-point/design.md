## Context

The reader feeds WebGazer training points three ways today: the 9-dot grid
(`runCalibration`), the `g` key (`captureCalibration` records the tracked cursor
position), and historically WebGazer's own click/move listeners — which were
**deliberately removed** because they continuously retrained the model on idle
gaze, snapping predictions to the cursor. Because of that removal, plain clicks
on the scroller are now repurposed as tap zones (`controls.js` `tapAction`:
recenter / nudge / toggle pause).

The ask is to make a click also add a calibration point. The blocker is that a
plain click already means something, and clicking the bottom-edge tap zone while
the eye is on the reading line would train "eye → bottom of screen" — exactly the
corruption the listener-removal avoided.

## Goals / Non-Goals

**Goals:**
- A one-gesture way to add a calibration point exactly where the player looks.
- Zero change to plain-click tap-zone behavior and to the `g` key.

**Non-Goals:**
- A distinct "calibration mode" with enter/exit state.
- Touching the 9-dot grid (`runCalibration`).
- Touchscreen modifier support (no Shift on a bare tap — `g`/grid still cover it).

## Decisions

**Use Shift+click, not a mode flag or "every click".**
- *Every click calibrates* re-introduces the idle-snap corruption (a nudge/pause
  click trains the model against where the eye actually is). Rejected.
- *Calibration mode* (clicks calibrate only while a session is active) needs new
  mode state and UI for the manual path, which has none today. Heavier than the
  ask. Rejected.
- *Shift+click* is stateless, never fires accidentally, and reuses the same
  `recordScreenPosition` + persist path as `g`. Chosen.

**Detect the modifier in `controls.js` `onClick`, before `tapAction`.**
When `e.shiftKey` is set, dispatch a new `calibrateAt(e.clientX, e.clientY)`
handler and skip `tapAction` for that event (so the click doesn't also
recenter/nudge/pause). Keeps the keymap-style "gesture → named handler"
abstraction intact; `main.js` owns the WebGazer call and persistence, mirroring
`captureCalibration`.

## Risks / Trade-offs

- [Player Shift+clicks a tap zone expecting it to nudge/pause] → the calibration
  hint and status text call out Shift+click so the binding is discoverable; the
  modifier makes accidental use unlikely.
- [Click coordinate ≠ where the eye actually is, if the player clicks without
  fixating] → same inherent risk as the `g` key and the dot grid; no worse, and
  the gesture is opt-in.
