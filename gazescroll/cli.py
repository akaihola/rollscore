"""Command-line entry point: run the gaze-scroll server with uvicorn.

Installed as the ``gazescroll`` console script (see pyproject ``[project.scripts]``).
Host/port default from ``GAZESCROLL_HOST``/``GAZESCROLL_PORT``; flags win over env.
"""
from __future__ import annotations

import argparse
import os


def build_config(argv: list[str] | None = None) -> dict:
    """Parse CLI args into the kwargs passed to ``uvicorn.run``."""
    parser = argparse.ArgumentParser(
        prog="gazescroll",
        description="Run the gaze-scroll score-reader server.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("GAZESCROLL_HOST", "127.0.0.1"),
        help="bind address (default 127.0.0.1; env GAZESCROLL_HOST)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("GAZESCROLL_PORT", "8765")),
        help="bind port (default 8765; env GAZESCROLL_PORT)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="auto-reload on code changes (development)",
    )
    args = parser.parse_args(argv)
    return {
        "app": "gazescroll.app:create_app",
        "factory": True,
        "host": args.host,
        "port": args.port,
        "reload": args.reload,
    }


def main(argv: list[str] | None = None) -> None:
    import uvicorn

    config = build_config(argv)
    uvicorn.run(config.pop("app"), **config)


if __name__ == "__main__":
    main()
