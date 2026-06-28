from gazescroll.state import StateStore


def test_resume_roundtrip(tmp_path):
    store = StateStore(tmp_path / "state.json")
    assert store.get_resume("Sonata.pdf") is None
    store.set_resume("Sonata.pdf", page=4, scroll=1234.5)
    # New instance reads from disk.
    store2 = StateStore(tmp_path / "state.json")
    r = store2.get_resume("Sonata.pdf")
    assert r == {"page": 4, "scroll": 1234.5}


def test_tuning_defaults_and_override(tmp_path):
    store = StateStore(tmp_path / "state.json")
    t = store.get_tuning()
    assert t["setpoint"] == 0.4  # default
    store.set_tuning({"setpoint": 0.35})
    assert store.get_tuning()["setpoint"] == 0.35
    assert store.get_tuning()["deadzone"] > 0  # untouched default preserved


def test_tuning_defaults_cover_every_controller_param(tmp_path):
    # The front-end controller (control.js stepController) needs the full param
    # set every frame; a missing key (e.g. maxStepPerFrame) silently NaNs the
    # scroll target. Defaults must therefore be complete for the live wiring.
    store = StateStore(tmp_path / "state.json")
    t = store.get_tuning()
    required = {
        "setpoint", "deadzone", "maxStepPerFrame", "coastMs", "maxVelocity",
        "medianWindow", "alpha", "columnX0", "columnX1", "minConfidence",
    }
    assert required <= set(t), f"missing tuning defaults: {required - set(t)}"


def test_calibration_roundtrip(tmp_path):
    store = StateStore(tmp_path / "state.json")
    assert store.get_calibration("landscape") is None
    entry = {"blob": [{"weights": [1, 2, 3]}], "dpr": 2.0}
    store.set_calibration("landscape", entry)
    store2 = StateStore(tmp_path / "state.json")
    assert store2.get_calibration("landscape") == entry
    assert store2.get_calibration("portrait") is None


def test_calibration_orientation_isolation(tmp_path):
    store = StateStore(tmp_path / "state.json")
    land = {"blob": [{"a": 1}], "dpr": 1.0}
    port = {"blob": [{"b": 2}], "dpr": 1.0}
    store.set_calibration("landscape", land)
    store.set_calibration("portrait", port)
    assert store.get_calibration("landscape") == land
    assert store.get_calibration("portrait") == port


def test_calibration_legacy_migration(tmp_path):
    path = tmp_path / "state.json"
    import json
    legacy_blob = [{"eyes": {}, "screenPos": [400, 300]}]
    path.write_text(json.dumps({"calibration": legacy_blob}))
    store = StateStore(path)
    entry = store.get_calibration("landscape")
    assert entry == {"blob": legacy_blob, "dpr": None}
    assert store.get_calibration("portrait") is None


def test_tolerates_corrupt_file(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("{ not valid json")
    store = StateStore(path)
    # Starts empty rather than raising.
    assert store.get_resume("Sonata.pdf") is None
    assert store.get_tuning()["setpoint"] == 0.4
