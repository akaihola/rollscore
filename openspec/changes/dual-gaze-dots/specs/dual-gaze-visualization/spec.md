## ADDED Requirements

### Requirement: Smoothed gaze point display
The system SHALL render the smoothed gaze point (median + EMA filtered x and y) as a red dot in the camera preview area.

#### Scenario: Smoothed dot appears during gaze
- **WHEN** WebGazer is active and tracking the user's eyes
- **THEN** a red dot appears at the smoothed gaze location (x, y after median + EMA filtering)

#### Scenario: Smoothed dot updates every frame
- **WHEN** a new gaze sample arrives from WebGazer
- **THEN** the red dot immediately moves to reflect the smoothed location

### Requirement: Raw gaze point display
The system SHALL render the raw unsmoothed gaze point from WebGazer as a smaller light gray dot in the camera preview area, positioned at the same location as the smoothed dot.

#### Scenario: Raw dot appears alongside smoothed dot
- **WHEN** WebGazer is active and tracking the user's eyes
- **THEN** a small light gray dot appears at the raw (unfiltered) gaze location from WebGazer

#### Scenario: Raw dot updates at WebGazer frame rate
- **WHEN** a new gaze sample arrives from WebGazer
- **THEN** the gray dot immediately moves to the raw (x, y) location, without smoothing

### Requirement: Dual dots move independently
The system SHALL allow both the red (smoothed) and gray (raw) dots to move independently, demonstrating the lag and damping introduced by the smoothing filter.

#### Scenario: Raw dot leads smoothed dot on rapid movements
- **WHEN** the user's gaze moves rapidly downward
- **THEN** the gray dot reaches the new position first, and the red dot follows with a delayed, damped motion

#### Scenario: Jitter visible in raw dot only
- **WHEN** the user holds gaze steady on one spot
- **THEN** the gray dot jitters with WebGazer's frame-to-frame noise, while the red dot remains relatively stable

### Requirement: Visual distinction
The system SHALL differentiate raw and smoothed dots by size, color, and opacity to avoid confusion.

#### Scenario: Gray dot is smaller than red dot
- **WHEN** both dots are visible
- **THEN** the gray dot diameter is approximately 50% of the red dot diameter

#### Scenario: Gray dot has lower opacity
- **WHEN** both dots are visible
- **THEN** the gray dot appears semi-transparent (e.g., 60% opacity) compared to the opaque red dot
