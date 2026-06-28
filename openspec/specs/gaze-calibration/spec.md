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

### Requirement: Persist and restore the calibration model across sessions

The reader SHALL persist the trained gaze-calibration model so it survives a page
reload and applies to any score opened thereafter. The model SHALL be serialized via
WebGazer's regression data API (`getRegression()[0].getData()`) — not via browser
`localStorage`, which the vendored WebGazer build does not use — and stored through the
existing `/api/calibration` backend endpoint. On opening a score, after WebGazer has
started (its regression exists), the reader SHALL restore a previously saved model by
applying it with the regression's `setData()`.

An empty model (no recorded points / no valid eye features) SHALL NOT be persisted, so a
cold start never overwrites a good saved model. Persistence failures SHALL be non-fatal:
a failed save or restore SHALL never interrupt reading.

#### Scenario: A recorded point is saved to the backend

- **WHEN** the player records a calibration point (via `g`, Shift+click, or the 9-dot grid)
  and the resulting model is non-empty
- **THEN** the reader serializes the regression model via `getData()`
- **AND** sends it to the backend via `PUT /api/calibration`

#### Scenario: Saved calibration is restored on the next load

- **WHEN** a score is opened and the backend has a saved calibration model
- **AND** WebGazer has started so its regression exists
- **THEN** the reader applies the saved model via the regression's `setData()`
- **AND** gaze tracking is immediately active without the player adding new points

#### Scenario: An empty model does not overwrite a saved one

- **WHEN** serialization is attempted while the regression holds no usable training data
- **THEN** the reader persists nothing
- **AND** any previously saved calibration remains intact

#### Scenario: A persistence failure does not break reading

- **WHEN** a save to or load from `/api/calibration` fails
- **THEN** the reader continues to function
- **AND** the failure is swallowed rather than surfaced as a fatal error
