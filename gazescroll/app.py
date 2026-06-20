"""FastAPI application factory for the gaze-scroll reader."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def create_app() -> FastAPI:
    app = FastAPI(title="gaze-scroll score reader")

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    # Static front-end (js/, vendor/, spike/). Mounted last so API routes win.
    app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")
    return app
