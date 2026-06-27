## ADDED Requirements

### Requirement: Detect staff systems on a rendered page

The system SHALL detect grand-staff systems on a rendered score page by computing a
horizontal projection profile of the page bitmap, identifying staff lines as profile
peaks, grouping five consecutive equally-spaced lines into a staff, and pairing
consecutive staves into two-staff systems. Each detected system SHALL be reported as a
bounding box in full-page canvas coordinates — the same coordinate space that
`page_dimensions` reports — with `top`, `bottom`, `left`, and `right` in pixels.

#### Scenario: Two-staff piano page

- **WHEN** detection runs on a printed solo-piano page containing N grand-staff systems
- **THEN** it returns N system boxes ordered top-to-bottom
- **AND** each box's vertical span covers its two staves with margin for ledger lines

#### Scenario: System box coordinate space

- **WHEN** a system box is returned for a page
- **THEN** its coordinates are expressed in the page's full-page canvas pixel space
- **AND** scaling a box by `stripWidth / canvasWidth` maps it onto the rendered strip

### Requirement: Robust degradation when detection is uncertain

The detector SHALL NOT raise on pages where staff structure cannot be confidently
recovered. When fewer than two staff lines are found, or staves cannot be grouped into
at least one system, it SHALL return an empty system list for that page rather than
fabricating boxes.

#### Scenario: Blank or non-music page

- **WHEN** detection runs on a page with no recoverable staff lines (cover, blank, text)
- **THEN** it returns an empty system list
- **AND** no exception is propagated to the caller

#### Scenario: Single leftover staff

- **WHEN** an odd staff cannot be paired into a two-staff system
- **THEN** the unpaired staff is reported as a single-staff system rather than dropped or merged

### Requirement: Systems API endpoint

The system SHALL expose detected systems through `GET /api/score/{score_file}/systems`,
returning a list of per-page entries (page number plus the page's ordered system boxes).
The endpoint SHALL follow the existing API conventions: `503` when no data source is
configured and `404` for an unknown score.

#### Scenario: Fetch systems for a known score

- **WHEN** a client requests `/api/score/{score_file}/systems` for a score in the manifest
- **THEN** the response is a list with one entry per page, each carrying that page's system boxes

#### Scenario: Unknown score

- **WHEN** a client requests systems for a score not present in the manifest
- **THEN** the endpoint responds `404`

#### Scenario: No data source configured

- **WHEN** the app has no resolved data source and systems are requested
- **THEN** the endpoint responds `503`

### Requirement: Cached detection results

Detection results SHALL be cached on disk keyed by the source archive mtime token, the
score, and the page, reusing the existing render cache root. A second request for the
same page SHALL be served from cache without recomputing the projection profile, and a
changed archive (newer mtime) SHALL produce a fresh cache namespace.

#### Scenario: Cache hit on repeat request

- **WHEN** systems for a page are requested twice with an unchanged archive
- **THEN** the second request reuses the cached result without re-running detection

#### Scenario: Cache invalidation on archive change

- **WHEN** the source archive's mtime changes
- **THEN** subsequent requests recompute detection under a new cache namespace
