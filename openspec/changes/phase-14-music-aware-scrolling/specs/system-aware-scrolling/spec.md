## ADDED Requirements

### Requirement: Track the active system from gaze

The reader SHALL determine which detected system the smoothed gaze point currently falls
in, using the system boxes scaled into strip coordinates. The active system SHALL be the
one whose vertical span contains the gaze's smoothed strip-y; when the gaze is between
systems, the active system SHALL be the one most recently entered (forward-only, never
regressing to an earlier system).

#### Scenario: Gaze inside a system

- **WHEN** the smoothed gaze y lies within a system's vertical span
- **THEN** that system becomes the active system

#### Scenario: Gaze in an inter-system gap

- **WHEN** the smoothed gaze y is between two systems
- **THEN** the active system remains the most recently entered one, not an earlier system

### Requirement: Snap the active system into view at the left edge

The controller SHALL bring the active system into full view when the gaze reaches the left
edge of the music column (the start of a new reading line), smoothly scrolling so the
system's top aligns to the configured top setpoint. The snap SHALL be smooth (bounded
per-frame step), never a jarring jump, and SHALL remain forward-only.

#### Scenario: Left-edge arrival snaps the system

- **WHEN** gaze x crosses into the left region of the music column with an active system
- **THEN** the controller scrolls smoothly so the active system's top reaches the top setpoint

#### Scenario: Snap never scrolls backward

- **WHEN** a snap target would require scrolling up (backward)
- **THEN** the controller holds position rather than scrolling backward

### Requirement: Interpolate scroll across the left-to-right sweep

The controller SHALL interpolate scroll as gaze sweeps from the left edge to the right edge
of the music column while reading a system, so that by the time gaze reaches the right edge
the next system's top has advanced to the top boundary of the viewport. Progress SHALL be
driven by the gaze's horizontal position within the music column, producing predictable,
musically-coherent advancement aligned to the score structure.

#### Scenario: Sweep advances toward the next system

- **WHEN** gaze moves left→right across the music column within the active system
- **THEN** scroll advances proportionally so the next system's top approaches the screen top by the right edge

#### Scenario: Forward-only and clamped

- **WHEN** interpolation produces a scroll target
- **THEN** the applied scrollTop is non-decreasing and clamped to `[0, contentH - viewportH]`

### Requirement: Fallback to pixel-chasing without systems

The reader SHALL fall back to the existing pixel-chasing gaze controller when no system
boxes are available for the current page (detection returned empty, or the systems fetch
failed), so behavior never regresses below the MVP. Switching between system-aware and
fallback modes SHALL not throw and SHALL preserve forward-only scrolling.

#### Scenario: Page with no detected systems

- **WHEN** the active page has an empty system list
- **THEN** the reader drives scroll with the existing pixel-chasing controller

#### Scenario: Systems fetch failure

- **WHEN** the systems request fails or is unavailable
- **THEN** the reader continues with the pixel-chasing controller without error

### Requirement: Tunable system-aware parameters

The system-aware controller SHALL expose its tuning parameters (at minimum the top
setpoint and the snap/interpolation smoothing) through the existing tuning panel, applied
live and persisted via the existing `/api/tuning` store.

#### Scenario: Live tuning update

- **WHEN** the user changes a system-aware parameter in the tuning panel
- **THEN** the controller applies the new value on the next frame without a reload

#### Scenario: Persisted tuning

- **WHEN** system-aware tuning values are changed and the page is reloaded
- **THEN** the persisted values are restored from the tuning store
