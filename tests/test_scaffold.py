def test_package_imports():
    import rollscore  # noqa: F401

    assert rollscore.__name__ == "rollscore"
