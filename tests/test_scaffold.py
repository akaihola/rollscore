def test_package_imports():
    import gazescroll  # noqa: F401

    assert gazescroll.__name__ == "gazescroll"
