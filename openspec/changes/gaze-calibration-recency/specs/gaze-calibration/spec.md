## ADDED Requirements

### Requirement: Use recency-weighted gaze regression

The reader SHALL configure WebGazer to use the recency-weighted ridge regression
(`weightedRidge`) rather than the unweighted ridge model, so that newer calibration points
dominate the trained model and older points decay in influence. WebGazer's eye feature is a
raw eye-pixel patch with no head-pose normalization, so a calibration point is only valid for
the head pose it was recorded at; over a session the head drifts, and an unweighted model
gives every accumulated (increasingly contradictory) point an equal, permanent vote, which
destabilizes the fit. Recency weighting lets the model track the current head pose instead of
averaging in stale drift. The persisted model format SHALL be unchanged: `weightedRidge`
shares the same regression data API (`getData()` / `setData()`), so previously saved models
load without migration.

#### Scenario: Recent points outweigh older ones

- **WHEN** the player records calibration points over a session during which head pose drifts
- **THEN** the trained model weights the most recent points more heavily than the oldest ones
- **AND** gaze prediction tracks the current head pose rather than averaging in stale points

#### Scenario: A previously saved model still loads

- **WHEN** a score is opened and the backend has a calibration model saved before this change
- **THEN** the reader restores it via the regression's `setData()` without migration
- **AND** gaze tracking is immediately active

### Requirement: Fresh grid calibration starts from a cleared model

When the player begins a 9-dot grid calibration pass, the reader SHALL clear WebGazer's
existing calibration data (`webgazer.clearData()`) before recording the grid's points, so the
grid trains a clean model. This gives the player a recovery path when an accumulated model has
been corrupted by drift. Incremental single-point captures (the `g` key and Shift+click) SHALL
NOT clear existing data — they append to the live model as before. Because an empty model is
never persisted, clearing and then abandoning the grid before any point is recorded SHALL
leave the previously saved model intact.

#### Scenario: Starting the grid clears prior calibration

- **WHEN** the player starts a 9-dot grid calibration pass
- **THEN** the reader clears WebGazer's existing calibration data before showing the dots
- **AND** the grid's points train a model that contains no pre-existing samples

#### Scenario: Incremental capture does not clear

- **WHEN** the player records a point via `g` or Shift+click
- **THEN** the reader appends the point to the existing model
- **AND** does not clear prior calibration data

#### Scenario: Abandoning a fresh grid keeps the saved model

- **WHEN** the player starts a grid pass (clearing the live model) but leaves before recording
  any point
- **THEN** the reader persists nothing
- **AND** the previously saved calibration model remains intact
