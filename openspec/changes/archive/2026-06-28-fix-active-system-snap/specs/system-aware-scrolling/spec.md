## MODIFIED Requirements

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
