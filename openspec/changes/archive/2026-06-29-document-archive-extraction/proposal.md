## Why

The forScore `.4sb` Archive extractor (`extract_4sb.py`) was built and shipped
before this project adopted OpenSpec, so its behavior was never captured in a
spec. It is the foundation the rest of the reader stands on — every score, crop,
overlay, and setlist the web app reads comes out of an extraction. This change
documents the already-shipped extractor retroactively so its contract is
spec-tracked like the rest of the codebase.

## What Changes

- Documentation only. No code changes — this records the current, shipped
  behavior of `extract_4sb.py` as a normative capability spec.

## Capabilities

### New Capabilities
- `archive-extraction`: parse the forScore `.4sb` container, restructure its flat
  manifest into nested per-document JSON, and losslessly extract original PDFs,
  per-page annotation layers, stamps, and setlists via a CLI.

### Modified Capabilities
<!-- none -->

## Impact

- `extract_4sb.py`: the extractor module being documented (no code change).
- `tests/test_extract_4sb.py`, `tests/conftest.py`: existing unit + smoke tests
  that already pin this behavior (no change).
