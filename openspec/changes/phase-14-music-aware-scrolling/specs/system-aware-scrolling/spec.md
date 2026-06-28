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

### Requirement: Snap the active system fully into view at the left edge

The controller SHALL bring the active system completely into view when the gaze reaches the
left edge of the music column (the start of a new reading line), scrolling forward by the
minimal amount needed so the whole system fits within the viewport. This "fully visible"
position is the start point of the sweep interpolation below. The snap SHALL be smooth
(bounded per-frame step), never a jarring jump, and SHALL remain forward-only.

#### Scenario: Left-edge arrival brings the whole system into view

- **WHEN** gaze x crosses into the left region of the music column with an active system
- **THEN** the controller scrolls forward only as far as needed to bring the whole active system into view

#### Scenario: Snap never scrolls backward

- **WHEN** the active system is already fully visible (no forward scroll needed)
- **THEN** the controller holds position rather than scrolling backward

### Requirement: Interpolate scroll across the left-to-right sweep

The controller SHALL interpolate scroll as gaze sweeps from the left edge to the right edge
of the music column while reading the active system, advancing from the system-fully-visible
position (the snap start point) toward the position where the active system's top aligns
with the top of the viewport (at the configured top margin). By the time gaze reaches the
right edge, the active system's top SHALL have reached the top of the viewport — i.e. the
controller scrolls forward (increasing `scrollTop`) as far as possible while keeping the
active system completely visible. Progress SHALL be driven by the gaze's horizontal position within the music column,
producing predictable, musically-coherent advancement aligned to the score structure.

#### Scenario: Sweep raises the active system to the top

- **WHEN** gaze moves left→right across the music column within the active system
- **THEN** scroll advances proportionally so the active system's top approaches the top of the viewport, reaching it by the right edge

#### Scenario: Forward-only and clamped

- **WHEN** interpolation produces a scroll target
- **THEN** the applied scrollTop is non-decreasing and clamped to `[0, contentH - viewportH]`

### Requirement: Fallback to the vertical-gaze follower without systems

The reader SHALL fall back to the existing vertical-gaze follower (the MVP controller driven
only by the vertical component of gaze) when no system boxes are available for the current
page (detection returned empty, or the systems fetch failed), so behavior never regresses
below the MVP. Switching between system-aware and fallback modes SHALL not throw and SHALL
preserve forward-only scrolling.

#### Scenario: Page with no detected systems

- **WHEN** the active page has an empty system list
- **THEN** the reader drives scroll with the existing vertical-gaze follower

#### Scenario: Systems fetch failure

- **WHEN** the systems request fails or is unavailable
- **THEN** the reader continues with the vertical-gaze follower without error

### Requirement: Tunable system-aware parameters

The system-aware controller SHALL expose its tuning parameters (at minimum the sweep-end top
margin and the snap/interpolation smoothing) through the existing tuning panel, applied
live and persisted via the existing `/api/tuning` store.

#### Scenario: Live tuning update

- **WHEN** the user changes a system-aware parameter in the tuning panel
- **THEN** the controller applies the new value on the next frame without a reload

#### Scenario: Persisted tuning

- **WHEN** system-aware tuning values are changed and the page is reloaded
- **THEN** the persisted values are restored from the tuning store
