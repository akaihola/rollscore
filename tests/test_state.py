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
        "setpoint", "deadzone", "maxStepPerFrame", "snapStepPerFrame", "coastMs",
        "maxVelocity", "medianWindow", "alpha", "columnX0", "columnX1", "minConfidence",
    }
    assert required <= set(t), f"missing tuning defaults: {required - set(t)}"


def test_calibration_roundtrip(tmp_path):
    store = StateStore(tmp_path / "state.json")
    assert store.get_calibration() is None
    blob = {"weights": [1, 2, 3], "n": 9}
    store.set_calibration(blob)
    store2 = StateStore(tmp_path / "state.json")
    assert store2.get_calibration() == blob


def test_tolerates_corrupt_file(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("{ not valid json")
    store = StateStore(path)
    # Starts empty rather than raising.
    assert store.get_resume("Sonata.pdf") is None
    assert store.get_tuning()["setpoint"] == 0.4
