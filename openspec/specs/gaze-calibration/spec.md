## Purpose

Defines how the reader collects gaze-calibration training points to improve
WebGazer's eye-tracking accuracy during a reading session.

## Requirements

### Requirement: Record a calibration point from a modified click

The reader SHALL record a gaze-calibration training point at the exact location
of a **modified click** (a click with the Shift key held), feeding the click
coordinates to WebGazer's regression. A plain, unmodified click SHALL NOT record
a calibration point; it retains its existing tap-zone behavior (recenter / nudge
/ toggle pause). This keeps ordinary reading clicks from corrupting the trained
model while giving a one-gesture way to add a point where the eye is fixated.

#### Scenario: Shift+click adds a point at the click location

- **WHEN** the player holds Shift and clicks at viewport position (x, y)
- **THEN** the reader records a WebGazer training sample at (x, y)
- **AND** persists the updated calibration model
- **AND** does not perform the plain-click tap-zone action for that click

#### Scenario: Plain click is unchanged

- **WHEN** the player clicks without Shift held
- **THEN** the reader performs only the tap-zone action for that position
- **AND** records no calibration point

### Requirement: Record a calibration point from the `g` key

The reader SHALL continue to record a gaze-calibration training point at the
tracked cursor position when the player presses `g`, independent of the
modified-click trigger.

#### Scenario: `g` records at the cursor

- **WHEN** the player presses `g` while the cursor is at position (x, y)
- **THEN** the reader records a WebGazer training sample at (x, y)
- **AND** persists the updated calibration model
