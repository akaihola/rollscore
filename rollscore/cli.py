"""Command-line entry point: run the Rollscore server with uvicorn.

Installed as the ``rollscore`` console script (see pyproject ``[project.scripts]``).
Host/port default from ``ROLLSCORE_HOST``/``ROLLSCORE_PORT``; flags win over env.
"""
from __future__ import annotations

import argparse
import os


def build_config(argv: list[str] | None = None) -> dict:
    """Parse CLI args into the kwargs passed to ``uvicorn.run``."""
    parser = argparse.ArgumentParser(
        prog="rollscore",
        description="Run the Rollscore score-reader server.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("ROLLSCORE_HOST", "127.0.0.1"),
        help="bind address (default 127.0.0.1; env ROLLSCORE_HOST)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("ROLLSCORE_PORT", "8765")),
        help="bind port (default 8765; env ROLLSCORE_PORT)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="auto-reload on code changes (development)",
    )
    args = parser.parse_args(argv)
    return {
        "app": "rollscore.app:create_app",
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
