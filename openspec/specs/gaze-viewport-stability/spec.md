## Purpose

Defines the conditions under which gaze tracking is permitted to run: fullscreen-only
gating, browser-zoom neutralization (viewport meta + dpr guard), and the pause/prompt
behavior when those conditions are violated mid-session.

## Requirements

### Requirement: Gaze tracking runs only when the viewport is fullscreen

The reader SHALL permit gaze tracking only while the document is in fullscreen
(`document.fullscreenElement` is set). Fullscreen pins the viewport to the entire
physical screen, giving a reproducible CSS-pixel→physical-screen mapping that a saved
calibration model depends on. Starting gaze SHALL request fullscreen as part of the
same user gesture that starts it. Leaving fullscreen SHALL pause gaze tracking rather
than continue with an invalidated mapping.

#### Scenario: Starting gaze enters fullscreen

- **WHEN** the player starts gaze tracking
- **THEN** the reader requests fullscreen for the document
- **AND** gaze tracking becomes active once the document is fullscreen

#### Scenario: Gaze does not run outside fullscreen

- **WHEN** the document is not fullscreen
- **THEN** the reader does not emit gaze-driven scrolling
- **AND** the reader indicates that fullscreen is required to use gaze

#### Scenario: Exiting fullscreen pauses gaze

- **WHEN** gaze tracking is active and the document leaves fullscreen
- **THEN** the reader pauses gaze tracking
- **AND** does not resume until the document is fullscreen again

### Requirement: Pinch-zoom is disabled so touch devices keep a stable coordinate system

The page SHALL declare a viewport that disables user scaling
(`maximum-scale=1, user-scalable=no`) so a pinch gesture cannot rescale the CSS-pixel
coordinate system out from under a saved calibration — pinch-zoom being the dominant
rescale vector on touch devices. Score sizing remains an in-app control (fit-to-width),
independent of browser zoom.

#### Scenario: Pinch gesture does not rescale the viewport

- **WHEN** the player performs a pinch-zoom gesture on a touch device
- **THEN** the viewport scale does not change
- **AND** the calibrated gaze mapping remains valid

### Requirement: Gaze pauses when the display scale changes mid-session

The reader SHALL observe the viewport's display scale (`devicePixelRatio`) and, when it
changes away from the value the active calibration was trained at, SHALL pause gaze
tracking and prompt the player to reset zoom (so the mapping returns to its calibrated
state); gaze SHALL resume once the display scale matches the calibration again. This
covers desktop browser zoom (Ctrl +/−), which a page cannot block and which rescales the
CSS-pixel coordinate system, invalidating the calibration.

#### Scenario: A zoom change pauses gaze and prompts a reset

- **WHEN** gaze tracking is active and `devicePixelRatio` changes from the value the
  active calibration model was trained at
- **THEN** the reader pauses gaze tracking
- **AND** prompts the player to reset browser zoom

#### Scenario: Restoring the calibrated zoom resumes gaze

- **WHEN** gaze is paused due to a display-scale mismatch and the player restores
  `devicePixelRatio` to the calibrated value
- **THEN** the reader resumes gaze tracking without requiring recalibration
