## ADDED Requirements

### Requirement: Keyboard control surface

The reader SHALL provide a document-level keyboard control surface that maps each key to a named handler rather than to a behavior directly, so the reader needs no focus and any future input (e.g. a foot pedal) can dispatch the same handler names. The surface SHALL map: Space to toggle gaze pause, the arrow keys to nudge the scroll back/forward, the bracket and Page-Up/Page-Down keys to previous/next piece, Escape to return to the chooser, and `a` to toggle annotations. A mapped key press SHALL invoke its handler and suppress the browser default. The crop toggle (`z`) is NOT part of this surface (see the `display-modes` capability).

#### Scenario: Mapped key invokes its handler

- **WHEN** the user presses a mapped key while the reader is open
- **THEN** the reader invokes that key's named handler
- **AND** suppresses the browser's default action for that key

#### Scenario: Crop toggle excluded

- **WHEN** documenting this control surface
- **THEN** the `z` crop toggle SHALL NOT be specified here
- **AND** it remains owned by the `display-modes` capability

### Requirement: Invisible tap zones

The reader SHALL route a tap on the scroll surface to a control by where it lands in a 3×3 grid, with no visible buttons. A tap in a corner SHALL recenter, the top-middle and bottom-middle edges SHALL nudge back and forward respectively, and the center SHALL toggle gaze pause. The left-middle and right-middle edges SHALL be inert so a stray side tap triggers no action.

#### Scenario: Center tap toggles pause

- **WHEN** the user taps the center of the reader surface
- **THEN** the reader toggles the gaze pause state

#### Scenario: Edge and corner taps

- **WHEN** the user taps a corner, the top-middle, or the bottom-middle of the surface
- **THEN** the reader recenters, nudges back, or nudges forward respectively

#### Scenario: Side edges are inert

- **WHEN** the user taps the left-middle or right-middle edge
- **THEN** the reader takes no action

### Requirement: Gaze on/off toggle

The reader SHALL start with gaze disengaged (paused) so the player explicitly opts in, and SHALL toggle gaze engagement on the pause control. While gaze is paused the reader SHALL NOT auto-scroll. Any manual navigation input (nudge, piece jump) SHALL preempt the gaze by pausing it, and the reader SHALL reflect the current gaze state in its on-screen indicator.

#### Scenario: Gaze starts disengaged

- **WHEN** a score is opened
- **THEN** gaze is paused and the reader does not auto-scroll until the player engages it
- **AND** the indicator shows gaze is off

#### Scenario: Manual input preempts gaze

- **WHEN** gaze is engaged and the user issues a manual nudge or piece jump
- **THEN** the reader pauses gaze
- **AND** the indicator shows gaze is off

### Requirement: Resume-position persistence

The reader SHALL restore a score's saved resume position when it opens, and SHALL save the position back as the user scrolls, throttled, and flush a final save on unload. The position SHALL be stored as a 1-based page plus a 0–1 within-page fraction (not raw pixels) so a saved resume survives a change of strip width. When a saved resume exists it SHALL take precedence over a requested piece page.

#### Scenario: Restore on open

- **WHEN** a score with a saved resume position is opened
- **THEN** the reader scrolls to that page and within-page fraction
- **AND** the saved resume takes precedence over any requested piece page

#### Scenario: Save while reading

- **WHEN** the user scrolls the score
- **THEN** the reader persists the current page and within-page fraction, throttled
- **AND** flushes a final save when the page unloads

#### Scenario: Width-independent resume

- **WHEN** a resume is saved at one strip width and restored at a different width
- **THEN** the reader resolves the stored page and fraction to the correct scroll offset for the new width
