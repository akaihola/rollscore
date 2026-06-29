# setlist-navigation Specification

## Purpose
TBD - created by archiving change document-mvp-reader. Update Purpose after archive.
## Requirements
### Requirement: Library chooser model

The system SHALL expose a library endpoint serving the chooser model: every score with its metadata (filename, title, composer, page count, and piece bookmarks), the named setlists, and the composer-grouped scores. Setlists SHALL preserve the order their entries appear in `setlists.json`, and a setlist entry whose referenced document is missing from the library SHALL be skipped rather than failing the load. Composer groups SHALL be sorted by composer with scores within each group sorted by title, and scores with no composer SHALL be grouped under a single unknown-composer group sorted last.

#### Scenario: Setlists keep their authored order

- **WHEN** the library model is served
- **THEN** each setlist lists its scores in the order they appear in `setlists.json`
- **AND** an entry referencing a document not in the library is omitted from that setlist

#### Scenario: Composer grouping

- **WHEN** the library model is served
- **THEN** scores are grouped by composer, groups sorted by composer name and scores by title
- **AND** scores with no composer fall into one unknown-composer group sorted last

### Requirement: Setlist and composer browse

The chooser SHALL present the library along two browse axes: the named setlists and the composer-grouped scores. Each score SHALL be a link that opens the score, and a multi-piece score SHALL additionally list its piece bookmarks, each a link that opens the score at that piece's first page.

#### Scenario: Two browse axes

- **WHEN** the chooser renders the library model
- **THEN** it shows a setlists section and a by-composer section
- **AND** each score appears as a link in both axes where it belongs

#### Scenario: Multi-piece score expands to pieces

- **WHEN** a score has piece bookmarks
- **THEN** the chooser lists each piece under the score
- **AND** each piece link targets that piece's first page

### Requirement: Open a score or piece at its page

The system SHALL open a chosen score in the reader at the requested page: page 1 for a whole-score open, or the piece's first page for a piece open.

#### Scenario: Open whole score

- **WHEN** the user opens a score from the chooser
- **THEN** the reader opens that score at page 1 (subject to any saved resume position)

#### Scenario: Open a piece

- **WHEN** the user opens a piece of a multi-piece score
- **THEN** the reader opens that score positioned at the piece's first page

### Requirement: Next and previous piece navigation

Within a multi-piece score the reader SHALL provide next-piece and previous-piece navigation that jumps to the first page of the piece adjacent to the one currently being read. The current piece SHALL be the last piece whose first page is at or before the current page, so a page in a gap still resolves to the piece being read past. When there is no adjacent piece (past the last, before the first, or no pieces), the navigation SHALL do nothing.

#### Scenario: Jump to the next piece

- **WHEN** the user invokes next-piece while reading a piece that has a following piece
- **THEN** the reader scrolls to the following piece's first page

#### Scenario: No piece to jump to

- **WHEN** the user invokes next-piece while reading the last piece (or previous-piece on the first)
- **THEN** the reader does not move

### Requirement: No setlist auto-advance

When a score opened from a setlist reaches its end, the system SHALL stop and wait — it SHALL NOT auto-advance to the next score. When a following piece exists in the setlist, the reader SHALL surface it as a waiting affordance that the player advances with an explicit control.

#### Scenario: Setlist score ends

- **WHEN** a score opened from a setlist scrolls to its end and the setlist has a next entry
- **THEN** the reader surfaces the next entry as a waiting affordance
- **AND** it does not automatically navigate to the next score

#### Scenario: End of setlist

- **WHEN** the last score of a setlist (or a score opened outside any setlist) reaches its end
- **THEN** the reader stops with nothing further to offer

