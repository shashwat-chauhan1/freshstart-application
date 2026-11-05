"""One-click launcher for FreshStart.

Usage:  python run.py

What it does:
  1. Starts the Node.js server (needs Node.js), using this same Python
     for the mentor matcher.
  2. Opens the app in its own window (Edge/Chrome app mode), falling
     back to the default browser.
Press Ctrl+C to stop.
"""
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = os.environ.get("PORT", "3000")
URL = "http://localhost:" + PORT


def app_already_running():
    try:
        with urllib.request.urlopen(URL + "/login", timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


def app_window_candidates():
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LocalAppData", "")
    return [
        os.path.join(pf86, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(pf, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(pf, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(pf86, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(local, r"Google\Chrome\Application\chrome.exe"),
    ]


def open_app_window(url):
    """Open url in a standalone window (no browser UI). Returns True on success."""
    for exe in app_window_candidates():
        if os.path.exists(exe):
            subprocess.Popen([exe, "--app=" + url])
            return True
    return False


def main():
    node = shutil.which("node")
    if not node:
        sys.exit("Node.js not found. Install it from https://nodejs.org and run again.")

    if app_already_running():
        print("FreshStart is already running — opening the app window.")
        open_app_window(URL) or webbrowser.open(URL)
        return

    env = dict(os.environ, PYTHON=sys.executable, PORT=PORT)
    print("Starting FreshStart at " + URL + "  (Ctrl+C to stop)")
    server = subprocess.Popen([node, os.path.join(ROOT, "server.js")], cwd=ROOT, env=env)

    threading.Thread(
        target=lambda: (
            time.sleep(1.2),
            open_app_window(URL) or webbrowser.open(URL),
        ),
        daemon=True,
    ).start()

    try:
        server.wait()
    except KeyboardInterrupt:
        print("\nStopping...")
        server.terminate()
    finally:
        # Give the browser thread a moment if the server died early.
        time.sleep(2)


if __name__ == "__main__":
    main()
