# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.59.0"]
# ///
"""Headless smoke for the gaze-eval session recorder.

Serves web/ with the spike server, opens spike/record-session.html with
Chromium's fake camera (?fast=1&autostart=1 → the whole protocol runs in a few
seconds), and verifies the two saved artifacts: a non-trivial video.webm and a
session.json whose segments/targets/frames logs are structurally sound.
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError, sync_playwright

WORKTREE = Path(__file__).resolve().parents[2]


def launch_chromium(p, **kwargs):
    """Launch Chromium, falling back to a preinstalled binary when the
    playwright-pinned build isn't downloaded (e.g. sandboxed CI images that
    ship one system Chromium; override with PLAYWRIGHT_CHROMIUM)."""
    try:
        return p.chromium.launch(**kwargs)
    except PlaywrightError:
        exe = os.environ.get("PLAYWRIGHT_CHROMIUM", "/opt/pw-browsers/chromium")
        if Path(exe).exists():
            return p.chromium.launch(executable_path=exe, **kwargs)
        raise


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_up(port: int, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.25)
    raise TimeoutError("server did not come up")


def main() -> int:
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, str(WORKTREE / "web" / "spike" / "serve.py"), str(port)],
        cwd=WORKTREE,
    )
    outdir = Path(tempfile.mkdtemp())
    try:
        wait_up(port)
        with sync_playwright() as p:
            browser = launch_chromium(
                p,
                args=[
                    "--use-fake-device-for-media-stream",
                    "--use-fake-ui-for-media-stream",
                ]
            )
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            saved: dict[str, Path] = {}

            def on_download(dl):
                dest = outdir / dl.suggested_filename
                dl.save_as(dest)
                saved[Path(dl.suggested_filename).suffix] = dest

            page.on("download", on_download)
            page.goto(
                f"http://127.0.0.1:{port}/spike/record-session.html"
                "?fast=1&autostart=1"
            )
            page.wait_for_function("window.__record && window.__record.done",
                                   timeout=60_000)
            page.wait_for_timeout(500)  # let both downloads land
            browser.close()

        assert ".webm" in saved, f"no video saved (got {list(saved)})"
        assert ".json" in saved, f"no session.json saved (got {list(saved)})"
        video_size = saved[".webm"].stat().st_size
        assert video_size > 10_000, f"video suspiciously small: {video_size} B"

        session = json.loads(saved[".json"].read_text())
        assert session["schema"] == "rollscore-gaze-session/1"
        segs = session["segments"]
        kinds = [s["kind"] for s in segs]
        assert kinds == (
            ["dwell"] + ["calib"] * 9 + ["pursuit"] + ["head_sweep"] * 4
        ), f"unexpected segment sequence: {kinds}"
        assert all(
            s["tEnd"] is not None and s["tEnd"] > s["tStart"] for s in segs
        ), "segment with missing/inverted tStart/tEnd"

        targets = session["targets"]
        assert len(targets) > 50, f"too few target samples: {len(targets)}"
        seg_ids = {s["id"] for s in segs}
        assert {t["seg"] for t in targets} <= seg_ids, "target with unknown segment id"

        frames = session["frames"]
        assert len(frames) > 10, f"too few camera frames logged: {len(frames)}"
        mts = [f["mt"] for f in frames]
        assert mts == sorted(mts), "frame mediaTime not monotonic"

        meta = session["meta"]
        assert meta["video"]["width"] and meta["video"]["height"]
        assert meta["fast"] is True

        print(
            "SMOKE OK: recorded fast session — "
            f"{len(segs)} segments, {len(targets)} target samples, "
            f"{len(frames)} frames, {video_size / 1e3:.0f} kB video"
        )
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
