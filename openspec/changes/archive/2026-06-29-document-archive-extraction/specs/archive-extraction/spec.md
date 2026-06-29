## Purpose

A forScore `.4sb` Archive is **not a zip file**. It is a sequence of entries
concatenated with no index, each entry being an `[ASCII header][gzip member]`
pair. The header is `[path-byte-length][gzip-compressed-byte-length][path]` as
space-padded decimals, and only the first entry is prefixed with the literal
magic `<--4SBV03-->`. The path length is a UTF-8 **byte** count (some forScore
filenames carry NFD combining marks). Entry 1's gzip payload is a flat
`bplist00` (binary plist) manifest whose keys encode document metadata,
per-page properties, setlists, and stamps via forScore's own `|` and `&…;`
delimiters; entries 2..N are the archived files (original PDFs and auxiliary
per-page annotation layers).

The `archive-extraction` capability turns such an archive into a plain
directory: the flat `bplist00` manifest is restructured into a nested,
per-document `manifest.json` (`{documents, system, setlists, stamps,
unparsed}`), original PDFs land verbatim under `pdfs/`, per-page annotation
layers under `aux/`, stamp images under `stamps/*.png`, and named setlists in
`setlists.json`. Rendering annotations onto PDFs is out of scope — extraction is
lossless pass-through plus metadata restructuring.

## ADDED Requirements

### Requirement: Parse the concatenated gzip-member container

The extractor SHALL read the `.4sb` as a sequence of `[ASCII header][gzip
member]` entries — not as a zip archive — by locating gzip members via the
`1f 8b 08` magic and treating the bytes preceding each member as that entry's
header. The extractor SHALL parse each header into the path's UTF-8 byte length,
the gzip-compressed byte length, and the path, stripping the leading
`<--4SBV03-->` magic that prefixes only the first entry, and decoding the path
as the trailing `path_len` UTF-8 bytes so paths containing spaces, leading
digits, or NFD combining marks parse correctly. The extractor SHALL gzip-
decompress each member to recover the entry payload.

#### Scenario: First entry's magic and header are parsed

- **WHEN** the first entry's header begins with `<--4SBV03-->` followed by the padded path length, compressed length, and path
- **THEN** the magic is stripped and the path length, compressed length, and path are recovered, with the path decoded as the trailing byte-length slice

#### Scenario: Multi-byte (UTF-8) path lengths are honored as byte counts

- **WHEN** a path contains multi-byte UTF-8 characters
- **THEN** the path is decoded using its byte length (not character count), so the full name is recovered intact

#### Scenario: All entries are walked in order

- **WHEN** the container holds the manifest entry followed by one or more document entries
- **THEN** iterating the container yields each entry's path and decompressed payload in order, with the manifest payload beginning `bplist00`

### Requirement: Restructure the flat manifest into nested per-document JSON

The extractor SHALL parse entry 1's `bplist00` payload and restructure the flat
manifest dict into `{documents, system, setlists, stamps, unparsed}`. Keys SHALL
be routed by their forScore delimiters: `stamps.plist`/`stamps2.plist` to
`stamps`; `&SET;<name>` to `setlists`; `&SYS;<name>` to `system`;
`<file>&BLU;<page>&BLU;bluePoints` to that document page's parsed `ink`;
`<file>|<page>|<prop>` to that document's `pages[page][prop]`; `<file>|<prop>`
to that document's `meta[prop]`. The extractor SHALL run `rect`, `offset`, and
`trOffset` page properties through CGPoint/CGRect geometry parsing, and parse
inline `bluePoints` ink strings losslessly (preserving the raw string plus
marker-tagged numeric tokens). Any key matching no rule SHALL be placed in
`unparsed` so nothing is silently dropped.

#### Scenario: Document metadata, pages, and annotations are nested under their document

- **WHEN** the flat manifest carries `<file>|<prop>`, `<file>|<page>|<prop>`, and `<file>&BLU;<page>&BLU;bluePoints` keys
- **THEN** they are grouped under `documents[<file>]` as `meta`, `pages[<page>]`, and `pages[<page>].ink` respectively

#### Scenario: System defaults and setlists are separated

- **WHEN** the manifest carries `&SYS;<name>` and `&SET;<name>` keys
- **THEN** they land in `system` and `setlists` under the name without the prefix

#### Scenario: Geometry strings are parsed to float lists

- **WHEN** a page property `rect`/`offset`/`trOffset` holds a CGPoint/CGRect string such as `{{1.0, 2.0}, {3.0, 4.0}}`
- **THEN** it is parsed into nested float lists

#### Scenario: Unrecognized keys are preserved

- **WHEN** the manifest contains a key matching no routing rule
- **THEN** that key and value are placed verbatim in `unparsed` rather than discarded

### Requirement: Losslessly extract documents, annotation layers, stamps, and setlists

The extractor SHALL write archived document entries byte-for-byte to the output
directory, stripping the `{%DOCUMENTS_DIR%}/` placeholder into `pdfs/` and the
`{%AUX_DIR%}/` placeholder (per-page annotation layers) into `aux/`. It SHALL
NFC-normalize extracted file names and SHALL reject any path that would escape
the output directory. The extractor SHALL write stamp image bytes to
`stamps/*.png` and reference them from `manifest.json` as `{"_png": <path>}`
objects. It SHALL emit `manifest.json` (the restructured structure without
setlists, datetimes serialized as ISO-8601) and `setlists.json` (the named,
ordered setlists).

#### Scenario: Original documents are written verbatim under pdfs/

- **WHEN** a `{%DOCUMENTS_DIR%}/<name>` entry is extracted
- **THEN** its decompressed bytes are written unchanged to `pdfs/<name>` (NFC-normalized)

#### Scenario: Auxiliary annotation layers are written under aux/

- **WHEN** a `{%AUX_DIR%}/<name>` entry is extracted
- **THEN** its bytes are written unchanged to `aux/<name>`

#### Scenario: Path traversal is rejected

- **WHEN** an entry path would resolve outside the output directory (e.g. contains `../`)
- **THEN** extraction of that entry fails with an error rather than writing outside the output tree

#### Scenario: Stamps and setlists are written as separate outputs

- **WHEN** the manifest carries stamp image bytes and named setlists
- **THEN** stamp bytes are written to `stamps/*.png` and referenced as `{"_png": ...}` in `manifest.json`, and setlists are written to `setlists.json`

### Requirement: Provide a command-line extraction interface

The extractor SHALL expose a CLI accepting the archive path, an output directory
(`-o`/`--out`, default `out`), and a `--force` flag. Without `--force` the CLI
SHALL refuse to write into an existing non-empty output directory. The CLI SHALL
reject input that does not begin with the `<--4SBV03-->` magic. It SHALL warn
when an entry header's declared compressed length disagrees with the bytes
actually consumed, and SHALL print an extraction summary on success.

#### Scenario: Refuses to clobber a non-empty output directory

- **WHEN** the CLI is run with an output directory that exists and is not empty, without `--force`
- **THEN** it exits with an error and does not overwrite the directory

#### Scenario: Overwrites with --force

- **WHEN** the CLI is run with `--force` against an existing output directory
- **THEN** it proceeds with extraction

#### Scenario: Rejects non-4SBV0x input

- **WHEN** the input file does not start with the `<--4SBV03-->` magic
- **THEN** the CLI exits with an error explaining it is not a 4SBV0x archive

#### Scenario: Reports a successful extraction

- **WHEN** a valid archive is extracted
- **THEN** the CLI writes `pdfs/`, `aux/`, `stamps/`, `manifest.json`, and `setlists.json` and prints how many documents plus the manifest were extracted
