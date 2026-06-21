# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.59.0"]
# ///
"""Headless smoke for the calibration-dot cleanup fix.

Boots the app against ./out, opens the first score with ?fakegaze=1 (no webcam),
and verifies the 9-dot calibration grid hides in every case the bug reported:
re-pressing `c` restarts (no stacking) and returning to the library clears it.
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


def open_reader(page, base: str) -> None:
    page.goto(f"{base}/?fakegaze=1", wait_until="networkidle")
    page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
    page.locator("button.score").first.click()
    page.wait_for_selector(".scroller .strip", timeout=10_000)


def main() -> int:
    port = free_port()
    state_file = Path(tempfile.mkdtemp()) / "state.json"
    server = subprocess.Popen(
        [
            "uv", "run", "uvicorn",
            "gazescroll.app:create_app", "--factory",
            "--host", "127.0.0.1", "--port", str(port),
        ],
        cwd=WORKTREE,
        env={
            **os.environ,
            "GAZESCROLL_SOURCE": str(WORKTREE / "out"),
            "GAZESCROLL_STATE": str(state_file),
        },
    )
    try:
        wait_up(port)
        base = f"http://127.0.0.1:{port}"
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            dots = page.locator(".cal-dot")

            open_reader(page, base)

            # Press `c` → the 9-dot grid appears.
            page.keyboard.press("c")
            page.wait_for_timeout(100)
            assert dots.count() == 9, f"expected 9 dots, got {dots.count()}"

            # Press `c` again → restarts, does NOT stack to 18.
            page.keyboard.press("c")
            page.wait_for_timeout(100)
            assert dots.count() == 9, f"re-press stacked dots: {dots.count()}"

            # Return to the library (Escape) → dots are gone.
            page.keyboard.press("Escape")
            page.wait_for_selector("button.score, .chooser", timeout=5_000)
            page.wait_for_timeout(100)
            assert dots.count() == 0, f"dots survived return to library: {dots.count()}"

            # Re-open and complete the grid → cleanup on completion too.
            page.evaluate("document.querySelectorAll('details').forEach(d => d.open = true)")
            page.locator("button.score").first.click()
            page.wait_for_selector(".scroller .strip", timeout=10_000)
            page.keyboard.press("c")
            page.wait_for_timeout(100)
            assert dots.count() == 9
            # Each dot needs 3 clicks; click each 3×.
            for i in range(dots.count()):
                for _ in range(3):
                    dots.nth(i).click(force=True)
            page.wait_for_timeout(100)
            assert dots.count() == 0, f"dots survived completion: {dots.count()}"

            browser.close()
        print("SMOKE OK: calibration dots hide on re-press, library return, and completion")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
