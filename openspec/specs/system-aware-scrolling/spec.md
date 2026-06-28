# system-aware-scrolling Specification

## Purpose

Drive auto-scroll from the reading saccade across detected staff systems: track a single
forward-only active system, snap it fully into view at the start of each reading line, and
interpolate scroll as the gaze sweeps left-to-right so the music advances in a
musically-coherent way. Falls back to the MVP vertical-gaze follower when no systems are
available.
## Requirements
### Requirement: Track the active system from gaze

The reader SHALL track a single active system among the detected boxes scaled into strip
coordinates, forward-only (the active system index SHALL never decrease). Because system
boxes may overlap vertically, vertical containment alone is ambiguous and SHALL NOT be the
advance trigger. Advancement from the active system to the next SHALL be driven by the
reading saccade: after the gaze has swept into the right portion of the music column within
the active system, a return to the left region (the start of a new reading line) SHALL
advance the active system by one. The gaze's vertical position SHALL be used only to keep
selection consistent (preferring the forward-most plausible system) and SHALL never select
an earlier system.

#### Scenario: Sweep-and-return advances the active system

- **WHEN** the gaze sweeps to the right portion of the music column within the active system
  and then returns to the left region
- **THEN** the active system advances to the next system

#### Scenario: Overlapping boxes do not cause regression

- **WHEN** the active system's box vertically overlaps the previous system's box and the
  gaze's y falls within the overlap
- **THEN** the active system does not regress to the earlier system

#### Scenario: Stray leftward glance mid-read

- **WHEN** the gaze briefly moves left without having swept to the right portion of the
  active system
- **THEN** the active system does not advance

### Requirement: Snap the active system fully into view at the left edge

The controller SHALL bring the active system completely into view when the gaze reaches the
left edge of the music column (the start of a new reading line), scrolling forward by the
minimal amount needed so the whole system fits within the viewport. This "fully visible"
position (the system's `snapStart`) is the start point of the sweep interpolation.

Once the active system has advanced, bringing it fully into view SHALL NOT depend on the
player continuing to read: while the active system is not yet fully visible, the controller
SHALL keep scrolling forward toward `snapStart` **even when the per-frame reading gate is
false**. This prevents a freeze when the active system is only partially visible at the bottom
of the screen and the player's gaze rests in the left margin at the start of a new line —
left of the music column, where the reading gate is false — which would otherwise hold scroll
with the system clipped until the gaze moved right into the column. Only the further "raise
toward the top of the viewport" sweep (the next requirement) remains gated on reading.

The snap SHALL be eased (bounded per-frame step), never an instant jump, and its per-frame
step SHALL be governed by a dedicated snap-step budget independent of — and larger than — the
reading-velocity step cap (`maxStepPerFrame`), so the active system is framed within a few
frames regardless of how large a forward gap must be closed. The snap SHALL remain
forward-only and SHALL never scroll past the position that keeps the active system fully
visible.

#### Scenario: Left-edge arrival brings the whole system into view

- **WHEN** gaze x crosses into the left region of the music column with an active system
- **THEN** the controller scrolls forward only as far as needed to bring the whole active system into view

#### Scenario: Partially-visible next system snaps promptly

- **WHEN** the active system advances to a system only partially visible at the bottom of the
  viewport, requiring a forward gap larger than `maxStepPerFrame` to fully reveal
- **THEN** the controller closes that gap at the snap-step budget so the whole system is
  framed within a few frames, not crawling at the reading-velocity rate

#### Scenario: Snap completes even when the reading gate drops

- **WHEN** the active system has advanced to one that is not yet fully visible and the reading
  gate is false (e.g. the gaze rests in the left margin, left of `columnX0`, at the start of a
  new line)
- **THEN** the controller continues scrolling forward toward the snap position until the
  system is fully visible, rather than holding with it clipped

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
margin, the snap-step budget, and the snap/interpolation smoothing) through the existing
tuning panel, applied live and persisted via the existing `/api/tuning` store.

#### Scenario: Live tuning update

- **WHEN** the user changes a system-aware parameter in the tuning panel
- **THEN** the controller applies the new value on the next frame without a reload

#### Scenario: Persisted tuning

- **WHEN** system-aware tuning values are changed and the page is reloaded
- **THEN** the persisted values are restored from the tuning store

### Requirement: Debug visualization of the active system

The reader SHALL provide a toggleable debug visualization of detected system boxes,
off by default and purely diagnostic. When enabled, it SHALL render a faint background
shading rectangle behind the active system, positioned in strip coordinates (scaled by
`stripWidth / canvasWidth`) so it registers with the rendered music, drawn so it reads as a
highlight rather than occluding the notation. When the active system advances, the shading
SHALL crossfade — the previous system's rectangle fading out while the new one fades in over
a short duration — so the fade itself is the visible signal that a gaze shift to the next
system was detected. The visualization SHALL NOT affect scrolling, and SHALL show nothing
when the page is in the vertical-gaze fallback (no detected systems).

#### Scenario: Toggle on shows the active-system shading

- **WHEN** the debug visualization is toggled on for a page with detected systems
- **THEN** a faint shading rectangle appears behind the active system, aligned to its box

#### Scenario: Crossfade on gaze shift

- **WHEN** the active system advances to the next system
- **THEN** the shading crossfades from the previous system's box to the new one

#### Scenario: No boxes in fallback mode

- **WHEN** the debug visualization is on but the active page has no detected systems
- **THEN** no shading rectangle is shown

#### Scenario: Visualization does not affect scrolling

- **WHEN** the debug visualization is toggled on or off
- **THEN** the scroll behavior is unchanged

