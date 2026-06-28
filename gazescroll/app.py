"""FastAPI application factory for the gaze-scroll reader.

The app is constructed around a resolved data source (a ``.4sb`` archive or an
extracted ``out/`` dir) and a JSON state path. Both default from the environment
(``GAZESCROLL_SOURCE`` / ``GAZESCROLL_STATE``) so the console script and tests
can construct the app without arguments. When no source is configured the API
routes return ``503`` while ``/healthz`` and the static front-end still work.
"""
from __future__ import annotations

import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from gazescroll.ingest import ExtractionRoot, resolve_source
from gazescroll.library import Library, load_library
from gazescroll.render import page_dimensions, render_cached
from gazescroll.state import StateStore
from gazescroll.systems import detect_cached

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _library_json(library: Library) -> dict:
    """Serialize the chooser model: scores, ordered setlists, composer groups."""
    scores = {name: asdict(score) for name, score in library.scores.items()}
    return {
        "scores": scores,
        "setlists": {
            name: [asdict(s) for s in entries]
            for name, entries in library.setlists.items()
        },
        "composers": [asdict(group) for group in library.by_composer()],
    }


def create_app(
    source: Path | str | None = None,
    state_path: Path | str | None = None,
) -> FastAPI:
    app = FastAPI(title="gaze-scroll score reader")

    source = source or os.environ.get("GAZESCROLL_SOURCE")
    state_path = state_path or os.environ.get("GAZESCROLL_STATE")

    root: ExtractionRoot | None = resolve_source(Path(source)) if source else None
    app.state.root = root
    app.state.library = load_library(root) if root else None
    app.state.store = StateStore(state_path) if state_path else None

    def get_root(request: Request) -> ExtractionRoot:
        root = request.app.state.root
        if root is None:
            raise HTTPException(503, "no data source configured")
        return root

    def get_store(request: Request) -> StateStore:
        store = request.app.state.store
        if store is None:
            raise HTTPException(503, "no state store configured")
        return store

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    @app.get("/api/library")
    def library(request: Request) -> dict:
        lib = request.app.state.library
        if lib is None:
            raise HTTPException(503, "no data source configured")
        return _library_json(lib)

    @app.get("/api/score/{score_file}/pages")
    def pages(score_file: str, request: Request) -> list[dict]:
        return page_dimensions(get_root(request), score_file)

    @app.get("/api/score/{score_file}/page/{page}.png")
    def page_image(
        score_file: str, page: int, request: Request, annotated: bool = False
    ) -> FileResponse:
        try:
            path = render_cached(
                get_root(request), score_file, page=page, annotated=annotated
            )
        except KeyError:
            raise HTTPException(404, f"unknown score: {score_file!r}")
        return FileResponse(path, media_type="image/png")

    @app.get("/api/score/{score_file}/systems")
    def systems(score_file: str, request: Request) -> list[list[dict]]:
        root = get_root(request)
        try:
            n_pages = len(page_dimensions(root, score_file))
        except KeyError:
            raise HTTPException(404, f"unknown score: {score_file!r}")
        return [detect_cached(root, score_file, page=p) for p in range(1, n_pages + 1)]

    @app.get("/api/score/{score_file}/resume")
    def get_resume(score_file: str, request: Request) -> dict | None:
        return get_store(request).get_resume(score_file)

    @app.put("/api/score/{score_file}/resume")
    def put_resume(score_file: str, body: dict, request: Request) -> dict:
        get_store(request).set_resume(
            score_file, page=body["page"], scroll=body["scroll"]
        )
        return {"ok": True}

    @app.get("/api/tuning")
    def get_tuning(request: Request) -> dict:
        return get_store(request).get_tuning()

    @app.put("/api/tuning")
    def put_tuning(body: dict, request: Request) -> dict:
        get_store(request).set_tuning(body)
        return {"ok": True}

    @app.get("/api/calibration")
    def get_calibration(request: Request) -> Any:
        return get_store(request).get_calibration()

    @app.put("/api/calibration")
    def put_calibration(body: Any = Body(...), *, request: Request) -> dict:
        get_store(request).set_calibration(body)
        return {"ok": True}

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/score/{score_file}")
    def score_page(score_file: str) -> FileResponse:
        # Same shell as `/`; the front-end routes on the path. `/api` routes and
        # the `/web` mount still win (distinct path namespaces).
        return FileResponse(WEB_DIR / "index.html")

    # Static front-end (js/, vendor/, spike/). Mounted last so API routes win.
    app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")
    return app
