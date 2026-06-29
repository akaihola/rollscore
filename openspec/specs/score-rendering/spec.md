# score-rendering Specification

## Purpose
TBD - created by archiving change document-mvp-reader. Update Purpose after archive.
## Requirements
### Requirement: Per-page composite render

The system SHALL render each score page server-side onto a white full-page RGBA canvas, fitting the whole PDF page to the canvas width and anchoring it top-left so the entire page is rendered with no zoom crop. When the annotated variant is requested and a forScore aux overlay (`aux/<file>|<page>.png`) exists, the system SHALL resample that overlay from forScore's cropped/zoomed authoring space into the full-page render space and alpha-composite it 1:1, top-left anchored, onto the page. When the annotated variant is not requested, or no overlay exists, the system SHALL serve the page render without an overlay.

#### Scenario: Plain page render

- **WHEN** a page image is requested without the annotated flag
- **THEN** the system renders the whole PDF page fit to the canvas width on a white canvas
- **AND** no annotation overlay is composited

#### Scenario: Annotated page render

- **WHEN** a page image is requested with the annotated flag and an aux overlay exists for that page
- **THEN** the overlay is resampled into the full-page render space
- **AND** it is alpha-composited onto the page render so annotations stay registered with the music

### Requirement: Continuous vertical page strip

The front-end SHALL present a score as a single continuous vertical strip of its page images stacked in one column at a consistent width. Each page image SHALL be lazily loaded, and each page's on-screen height SHALL be reserved from the page-dimensions layout contract before the image loads, so the strip's scroll geometry is independent of image load order.

#### Scenario: Pages stack as one strip

- **WHEN** a score is opened in the reader
- **THEN** its pages render as one vertical column at a consistent width
- **AND** each page's height is reserved from the page dimensions before its image loads
- **AND** page images load lazily as they approach the viewport

### Requirement: Archive-mtime-keyed render cache

The system SHALL cache each composited page PNG on disk keyed by the source archive's mtime token, the score, the page number, and the annotation variant, and SHALL reuse a cached PNG on a subsequent request. The plain and annotated variants SHALL be stored as distinct files. When the source archive changes (a newer mtime token), the system SHALL render into a fresh cache namespace rather than serving the stale render.

#### Scenario: Cache hit reuses the render

- **WHEN** a page that was already rendered is requested again and the archive is unchanged
- **THEN** the system returns the cached PNG without re-rendering

#### Scenario: Changed archive invalidates the cache

- **WHEN** the source archive's mtime token changes
- **THEN** subsequent renders use a fresh cache namespace
- **AND** stale renders from the previous archive are not served

#### Scenario: Variants are distinct

- **WHEN** both the plain and the annotated variant of a page are requested
- **THEN** each is cached as its own file
- **AND** requesting one variant never returns the other

### Requirement: Page-dimensions API

The system SHALL expose a per-score page-dimensions endpoint returning, for each page in order, the rendered `width` and `height` the front-end uses to lay out the strip. Each page SHALL be reported at the canvas-fit width, so width is constant across pages while height follows each page's aspect ratio. Requesting dimensions for a score not in the manifest SHALL return a not-found error.

#### Scenario: Front-end reads the layout contract

- **WHEN** the front-end opens a score
- **THEN** it fetches the per-page dimensions list
- **AND** uses each page's width and height to reserve its slot in the strip and to compute scroll offsets

#### Scenario: Unknown score

- **WHEN** page dimensions are requested for a score absent from the manifest
- **THEN** the system returns a not-found error

