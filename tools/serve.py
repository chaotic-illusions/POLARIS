#!/usr/bin/env python3
"""Serve POLARIS for local work, telling browsers to always check for newer files.

Python's plain `http.server` lets browsers keep cached copies, so after an edit
a reload can still run the old scripts. This server sends Cache-Control:
no-cache, so a normal reload always picks up changes.

Usage:  python tools/serve.py [port]      (default 8765; serves the project folder)
Then open http://127.0.0.1:8765/builder/
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving {ROOT} at http://127.0.0.1:{port}/builder/  (Ctrl+C to stop)")
        server.serve_forever()


if __name__ == "__main__":
    main()
