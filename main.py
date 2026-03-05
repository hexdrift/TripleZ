#!/usr/bin/env python3
"""
TripleZ - Main Entry Point for PyInstaller bundle.

Starts the FastAPI backend, serves the pre-built Next.js frontend,
and opens the browser.
"""

import os
import sys
import signal
import threading
import time
import webbrowser
import subprocess
import platform
from typing import Optional

import uvicorn

# PyInstaller with console=False sets sys.stdout/stderr to None,
# which crashes uvicorn's log formatter (.isatty() on None).
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")


def resource_path(relative_path: str) -> str:
    """Get absolute path to a resource, works for dev and PyInstaller."""
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)


def open_browser():
    """Open the app in the default browser after a short delay."""
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")


def monitor_browser():
    """Monitor browser connection and exit when it closes."""
    time.sleep(5)
    browser_opened = False
    no_browser_count = 0

    while True:
        try:
            if platform.system() == "Darwin":
                result = subprocess.run(
                    ["lsof", "-ti:8000"],
                    capture_output=True, text=True, timeout=2,
                )
                has_connections = len(result.stdout.strip()) > 0
            else:
                has_connections = True

            if has_connections:
                browser_opened = True
                no_browser_count = 0
            elif browser_opened:
                no_browser_count += 1
                if no_browser_count >= 10:
                    print("Browser closed. Exiting application...")
                    os._exit(0)

            time.sleep(3)
        except Exception:
            time.sleep(3)


def main():
    """Start the backend server and open the browser."""
    threading.Thread(target=monitor_browser, daemon=True).start()
    threading.Thread(target=open_browser, daemon=True).start()

    def signal_handler(sig: int, frame: Optional[object]) -> None:
        print("\nShutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        uvicorn.run("src.backend.main:app", host="0.0.0.0", port=8000, log_level="info")
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == "__main__":
    main()
