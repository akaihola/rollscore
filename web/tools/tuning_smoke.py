# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.59.0"]
# ///
"""Headless smoke for the Phase 12 dev tuning panel.

Boots the FastAPI app against ./out, opens the first score in the reader with
?fakegaze=1 (no webcam), toggles the tuning panel with `t`, moves the setpoint
slider, and asserts that the change was persisted via PUT /api/tuning.
"""
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

WORKTREE = Path(__file__).resolve().parents[2]


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
    state_file = Path(tempfile.mkdtemp()) / "state.json"  # isolated; don't touch real tuning
    server = subprocess.Popen(
        [
            "uv", "run", "uvicorn",
            "rollscore.app:create_app", "--factory",
            "--host", "127.0.0.1", "--port", str(port),
        ],
        cwd=WORKTREE,
        env={
            **os.environ,
            "ROLLSCORE_SOURCE": str(WORKTREE / "out"),
            "ROLLSCORE_STATE": str(state_file),
        },
    )
    try:
        wait_up(port)
        base = f"http://127.0.0.1:{port}"
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            puts: list[dict] = []
            page.on(
                "request",
                lambda r: puts.append({"url": r.url, "post": r.post_data})
                if r.method == "PUT" and "/api/tuning" in r.url
                else None,
            )

            page.goto(f"{base}/?fakegaze=1", wait_until="networkidle")
            # Composer groups render inside collapsed <details>; expand them all.
            page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
            # Open the first score.
            page.locator("button.score").first.click()
            page.wait_for_selector(".scroller .strip", timeout=10_000)

            # Panel starts hidden.
            panel = page.locator(".tuning-panel")
            assert panel.count() == 1, "tuning panel not in DOM"
            assert panel.is_hidden(), "panel should start hidden"

            # Toggle on with `t`.
            page.keyboard.press("t")
            assert panel.is_visible(), "panel did not show on `t`"

            sliders = page.locator('.tuning-panel input[type="range"]')
            n = sliders.count()
            assert n == 10, f"expected 10 sliders, got {n}"

            # Move the setpoint slider and confirm a PUT /api/tuning fired.
            sp = page.locator('.tuning-panel input[data-key="setpoint"]')
            sp.fill("0.55")
            sp.dispatch_event("input")
            page.wait_for_timeout(900)  # past the 500ms throttle window

            assert puts, "no PUT /api/tuning observed after slider move"
            assert any("setpoint" in (x["post"] or "") for x in puts), (
                f"setpoint not in any PUT body: {puts}"
            )

            # And it persisted: GET reflects the new value.
            got = page.evaluate(
                "fetch('/api/tuning').then(r => r.json())"
            )
            assert abs(got["setpoint"] - 0.55) < 1e-6, f"GET shows {got['setpoint']}"

            # Toggle off with `t`.
            page.keyboard.press("t")
            assert panel.is_hidden(), "panel did not hide on second `t`"

            browser.close()
        print("SMOKE OK:", {"sliders": n, "puts": len(puts), "setpoint": got["setpoint"]})
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
