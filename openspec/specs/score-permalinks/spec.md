# Score Permalinks

## Purpose

Each score has a real URL path and the front-end routes from the URL, enabling bookmarking, sharing, and browser navigation (Back/Forward).

## Requirements

### Requirement: Each score has a real URL path

Every score SHALL be addressable at the path `/score/<filename>`, where
`<filename>` is the score's URL-encoded forScore filename. The server SHALL serve
the front-end at that path so the URL can be opened, bookmarked, reloaded, or
shared directly. A piece's starting page MAY be carried as a `?page=<n>` query
parameter.

#### Scenario: Score path serves the reader

- **WHEN** a request is made to `/score/<encoded-filename>`
- **THEN** the server returns the front-end shell (HTTP 200), not a 404

#### Scenario: Library index keeps its path

- **WHEN** a request is made to `/`
- **THEN** the server returns the library index as before

### Requirement: The front-end routes from the URL path

On load the front-end SHALL render the view named by `location.pathname`: `/`
renders the chooser; `/score/<file>` opens that score in the reader, at the
`?page=<n>` page when present. An unknown filename SHALL fall back to the chooser
rather than an error reader view.

#### Scenario: Score path opens the reader

- **WHEN** the page loads at `/score/<encoded-filename>`
- **THEN** that score opens directly in the reader (at `?page=<n>` when given), subject to the existing saved-resume behavior

#### Scenario: Reload reopens the same score

- **WHEN** a score is open and the user reloads the page
- **THEN** the same score reopens in the reader without first showing the chooser

#### Scenario: Unknown score falls back to the library

- **WHEN** the path names a filename that is not in the library
- **THEN** the chooser is shown instead of an error reader view

#### Scenario: Root path shows the chooser

- **WHEN** the page loads at `/`
- **THEN** the chooser is shown (unchanged default behavior)

### Requirement: Navigation uses real browser navigation

Opening a score and returning to the library SHALL be real browser navigations to
their URLs, so Back/Forward and bookmarking work without a client-side router.
Chooser score and piece entries SHALL be anchors whose `href` is the score's path.

#### Scenario: Choosing a score navigates to its URL

- **WHEN** the user clicks a score (or piece) in the chooser
- **THEN** the browser navigates to `/score/<encoded-filename>` (with `?page=<n>` for a piece) and the reader opens

#### Scenario: Returning to the library navigates to root

- **WHEN** the user activates "← Library" in the reader
- **THEN** the browser navigates to `/` and the chooser is shown

#### Scenario: Back returns to the library

- **WHEN** the user opens a score from the chooser and presses the browser Back button
- **THEN** the chooser is shown
