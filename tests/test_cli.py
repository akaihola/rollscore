from rollscore.cli import build_config


def test_defaults():
    cfg = build_config([])
    assert cfg["app"] == "rollscore.app:create_app"
    assert cfg["factory"] is True
    assert cfg["host"] == "127.0.0.1"
    assert cfg["port"] == 8765
    assert cfg["reload"] is False


def test_flag_overrides():
    cfg = build_config(["--host", "0.0.0.0", "--port", "9000", "--reload"])
    assert cfg["host"] == "0.0.0.0"
    assert cfg["port"] == 9000
    assert cfg["reload"] is True


def test_env_defaults(monkeypatch):
    monkeypatch.setenv("ROLLSCORE_HOST", "0.0.0.0")
    monkeypatch.setenv("ROLLSCORE_PORT", "9100")
    cfg = build_config([])
    assert cfg["host"] == "0.0.0.0"
    assert cfg["port"] == 9100
    # An explicit flag still wins over the env default.
    assert build_config(["--port", "1234"])["port"] == 1234
