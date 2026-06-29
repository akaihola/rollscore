# display-modes Specification

## Purpose
TBD - created by archiving change document-display-modes. Update Purpose after archive.
## Requirements
### Requirement: Cropped reading view is the default

When a score opens in the reader, it SHALL display in cropped mode: each page is zoomed and shifted so that only the region forScore showed on the iPad is visible (the user's margins hidden), matching the "reading" view. Cropping SHALL be applied purely in the browser via a CSS transform; the reader SHALL NOT request a separate cropped image from the backend.

#### Scenario: Score opens cropped

- **WHEN** the user opens a score in the reader
- **THEN** the reader displays each page in cropped mode by default
- **AND** the crop toggle indicator reads "Crop: on"

#### Scenario: Crop is a client-side transform

- **WHEN** a page is shown in cropped mode
- **THEN** the cropped framing is produced by a CSS transform on the already-loaded full-page image
- **AND** no additional image is fetched from the backend to switch in or out of cropped mode

### Requirement: Full-page overview view

The reader SHALL provide a full-page mode in which each page's whole PDF page is fit to the strip width with all margins shown (the "overview" view). In full-page mode the reader SHALL clear the cropped-mode transform and overflow clipping so the entire page is visible.

#### Scenario: Full-page shows the whole page

- **WHEN** the reader is in full-page mode
- **THEN** each page's entire PDF page is visible, fit to the strip width
- **AND** no part of the page is clipped by the page wrapper

### Requirement: `z` key toggles between display modes

The reader SHALL toggle between cropped and full-page mode when the user presses the `z` key, and SHALL offer the same toggle through a toolbar button. Each toggle SHALL be instant: it SHALL NOT issue a network request, reload images, or change page layout, and the toggle indicator SHALL reflect the new state ("Crop: on" / "Crop: off").

#### Scenario: Pressing z switches modes

- **WHEN** the reader is in cropped mode and the user presses `z`
- **THEN** the reader switches to full-page mode
- **AND** the toggle indicator reads "Crop: off"
- **AND** no network request is made and no page reload occurs

#### Scenario: Pressing z again returns to cropped

- **WHEN** the reader is in full-page mode and the user presses `z`
- **THEN** the reader switches back to cropped mode
- **AND** the toggle indicator reads "Crop: on"

#### Scenario: Toolbar button mirrors the key

- **WHEN** the user clicks the crop toolbar button
- **THEN** the reader toggles the display mode exactly as pressing `z` does

### Requirement: Per-page crop application

The crop transform SHALL be applied per page from that page's `zoom` and `trOffset`, so each page is cropped according to its own forScore display parameters. Strip page heights SHALL be identical in both modes (the crop preserves page aspect ratio), so toggling SHALL NOT shift the scroll position. A page whose parameters are the default (`zoom = 1`, `trOffset = null`) SHALL NOT receive a transform and SHALL appear identical in both modes. When a debug system overlay is present on a page, the same per-page transform SHALL be applied to the overlay so its boxes stay registered with the cropped music.

#### Scenario: Default-parameter page is identical in both modes

- **WHEN** a page has `zoom = 1` and `trOffset = null`
- **THEN** that page receives no crop transform
- **AND** it looks the same in cropped mode and in full-page mode

#### Scenario: Scroll position is preserved across a toggle

- **WHEN** the user toggles between cropped and full-page mode
- **THEN** the current page and within-page scroll fraction are unchanged

#### Scenario: System overlay stays registered

- **WHEN** a page carries a system overlay and the reader is in cropped mode
- **THEN** the overlay receives the same per-page transform as the page image
- **AND** the overlay boxes stay aligned with the cropped music

### Requirement: Toggle state is session-scoped, not persisted

The chosen display mode SHALL persist for the life of the open reader, including across page turns and piece-to-piece navigation within a setlist. The reader SHALL NOT persist the display mode across reopens: opening a score again (e.g. after returning to the chooser or reloading) SHALL reset to the cropped default.

#### Scenario: Mode survives piece navigation

- **WHEN** the user switches to full-page mode and then navigates to another piece within the same reader session
- **THEN** the reader remains in full-page mode

#### Scenario: Reopening resets to cropped

- **WHEN** the user has switched to full-page mode and then reopens a score (new reader session)
- **THEN** the reader starts again in cropped mode

