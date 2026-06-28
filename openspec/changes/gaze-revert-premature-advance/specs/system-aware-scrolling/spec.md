## MODIFIED Requirements

### Requirement: Track the active system from gaze

The reader SHALL track a single active system among the detected boxes scaled into strip
coordinates. The active system index SHALL advance forward-only via the reading saccade:
because system boxes may overlap vertically, vertical containment alone is ambiguous and
SHALL NOT be the advance trigger. Advancement from the active system to the next SHALL be
driven by the reading saccade: after the gaze has swept into the right portion of the music
column within the active system, a return to the left region (the start of a new reading
line) SHALL advance the active system by one.

The active system index MAY decrease only via a sustained-dwell revert: when the gaze rests
vertically over an earlier system than the active one continuously for at least the configured
revert dwell threshold, the controller SHALL revert the active system to the forward-most
system the gaze is resting on. This corrects a premature advance (a saccade-triggered skip
while the reader was still on the line above). A transient upward or leftward glance shorter
than the dwell threshold SHALL NOT revert. Vertical gaze position SHALL have no effect other
than this dwell-gated revert and SHALL never on its own advance the active system.

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

#### Scenario: Sustained dwell over an earlier system reverts a premature advance

- **WHEN** the active system has advanced but the gaze then rests vertically over the previous
  system continuously for at least the revert dwell threshold
- **THEN** the active system reverts to the system the gaze is resting on

#### Scenario: Transient upward glance does not revert

- **WHEN** the gaze passes over an earlier system for less than the revert dwell threshold
  before returning to the active system
- **THEN** the active system does not revert
```
