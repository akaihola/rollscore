"""Single-file JSON state store: resume positions, tuning params, calibration.

Personal localhost tool — single user, no concurrency. Writes are atomic
(temp file + ``os.replace``) so a crash mid-write can't truncate the store.
A missing or corrupt file is tolerated by starting from an empty state.

Shape on disk::

    {
      "resume":      {"<score_file>": {"page": int, "scroll": float}, ...},
      "tuning":      {"setpoint": 0.4, ...},          # only overridden keys
      "calibration": <opaque WebGazer blob> | absent
    }
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# Phase 9 control-loop parameters. Persisted only when overridden; these
# defaults fill in any key the stored tuning dict omits.
TUNING_DEFAULTS: dict[str, float] = {
    "setpoint": 0.4,        # read-position target as fraction of viewport height
    "deadzone": 10.0,       # px error band around the setpoint (no scroll)
    "coastMs": 800.0,       # coast duration after gaze is lost, before freeze
    "maxVelocity": 480.0,   # px/s clamp on the reading-velocity estimate
    "medianWindow": 5.0,    # samples in the smoothing median window
    "alpha": 0.3,           # EMA smoothing factor
    "columnX0": 0.1,        # left edge of the music column (fraction of width)
    "columnX1": 0.9,        # right edge of the music column (fraction of width)
    "minConfidence": 0.5,   # gaze-confidence gate for the on-music check
}


class StateStore:
    """Persist resume/tuning/calibration to one JSON file."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self._path.read_text())
        except (FileNotFoundError, ValueError):
            return {}

    def _save(self) -> None:
        tmp = self._path.with_name(self._path.name + ".tmp")
        tmp.write_text(json.dumps(self._data, indent=2))
        os.replace(tmp, self._path)

    # --- resume -----------------------------------------------------------
    def get_resume(self, score_file: str) -> dict[str, Any] | None:
        return self._data.get("resume", {}).get(score_file)

    def set_resume(self, score_file: str, *, page: int, scroll: float) -> None:
        self._data.setdefault("resume", {})[score_file] = {
            "page": page,
            "scroll": scroll,
        }
        self._save()

    # --- tuning -----------------------------------------------------------
    def get_tuning(self) -> dict[str, float]:
        return {**TUNING_DEFAULTS, **self._data.get("tuning", {})}

    def set_tuning(self, tuning: dict[str, float]) -> None:
        self._data.setdefault("tuning", {}).update(tuning)
        self._save()

    # --- calibration ------------------------------------------------------
    def get_calibration(self) -> Any | None:
        return self._data.get("calibration")

    def set_calibration(self, blob: Any) -> None:
        self._data["calibration"] = blob
        self._save()
