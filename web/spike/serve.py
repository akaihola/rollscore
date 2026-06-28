#!/usr/bin/env python3
"""Serve the `web/` dir same-origin so the webcam permission sticks.

WebGazer needs a stable origin (not file://) for getUserMedia to keep its
camera grant. This is a throwaway stdlib server for the Phase 0 spike only;
the real app is served by FastAPI (rollscore.app).

Usage:
    python3 web/spike/serve.py            # serves web/ on http://localhost:8000
    python3 web/spike/serve.py 8001       # custom port

Then open http://localhost:8000/spike/gaze-accuracy.html in Chromium and grant
camera access.
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent  # the web/ directory


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(SimpleHTTPRequestHandler, directory=str(WEB_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://localhost:{port}/spike/gaze-accuracy.html"
    print(f"Serving {WEB_DIR} at http://localhost:{port}/")
    print(f"Open: {url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
        server.shutdown()


if __name__ == "__main__":
    main()
