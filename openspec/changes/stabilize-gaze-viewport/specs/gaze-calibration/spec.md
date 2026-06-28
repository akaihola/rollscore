## ADDED Requirements

### Requirement: Calibration model is keyed by viewport orientation

The reader SHALL persist calibration as a map keyed by viewport orientation
(`landscape` / `portrait`) and SHALL save, restore, and add points to the entry for the
**current** orientation, because a trained model is valid only for the viewport geometry
it was trained in and landscape and portrait are different physical geometries.
On opening a score the reader SHALL restore the model for the
current orientation; on `orientationchange` it SHALL switch the active model to the new
orientation's entry, or prompt for calibration if that orientation has no saved model.
This extends the persistence requirement (a single saved blob becomes an orientation map)
and the `/api/calibration` payload shape; any pre-existing single blob is migrated as the
`landscape` entry.

#### Scenario: A recorded point is saved under the current orientation

- **WHEN** the player records a calibration point while the viewport is in a given
  orientation and the resulting model is non-empty
- **THEN** the reader persists the serialized model under that orientation's key
- **AND** leaves the other orientation's saved model untouched

#### Scenario: Restore selects the current orientation's model

- **WHEN** a score is opened and the backend has a saved model for the current orientation
- **THEN** the reader restores that orientation's model
- **AND** gaze tracking is immediately active without the player adding new points

#### Scenario: Rotating swaps the active model

- **WHEN** the viewport orientation changes and a saved model exists for the new orientation
- **THEN** the reader applies the new orientation's model
- **AND** continues gaze tracking with it

#### Scenario: Rotating to an uncalibrated orientation prompts calibration

- **WHEN** the viewport orientation changes and no saved model exists for the new orientation
- **THEN** the reader prompts the player to calibrate
- **AND** does not apply the other orientation's model

### Requirement: Calibration model records the display scale it was trained at

So a later browser-zoom change can be detected as invalidating, the reader SHALL tag each
persisted orientation's calibration with the `devicePixelRatio` in effect when it was
trained. On restore, the reader SHALL treat a saved model whose recorded display scale
does not match the current `devicePixelRatio` as not-yet-valid for use (see the
viewport-stability display-scale requirement), rather than applying a mismatched model.

#### Scenario: Saved model carries its training-time display scale

- **WHEN** the reader persists a calibration model for an orientation
- **THEN** the stored entry includes the `devicePixelRatio` at which it was trained

#### Scenario: A model trained at a different scale is not silently applied

- **WHEN** a score is opened and the saved model's recorded display scale does not match
  the current `devicePixelRatio`
- **THEN** the reader does not treat gaze as calibrated for the current scale
- **AND** prompts the player to reset zoom to the calibrated scale
