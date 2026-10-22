#!/usr/bin/env python3
"""DealBriz local dev server.

Serves the frontend from this directory and forwards /api and /uploads to an
upstream backend, so the site behaves like the production nginx setup.

    python3 dev-server.py                 # proxy to https://dealbriz.com
    python3 dev-server.py --upstream http://127.0.0.1:5000
    python3 dev-server.py --no-proxy     # static files only, API calls fail
    python3 dev-server.py --allow-write   # also forward POST/PUT/PATCH/DELETE

Why writes are blocked by default: the upstream may be the live production
database. The handover rules say to never test against production data, so
this server refuses anything that could create or modify a record unless you
opt in with --allow-write.

Reads (GET/HEAD/OPTIONS) are passed through untouched.
"""

import argparse
import http.server
import json
import mimetypes
import os
import socketserver
import ssl
import sys
import urllib.error
import urllib.request
from http import HTTPStatus

ROOT = os.path.dirname(os.path.abspath(__file__))
PROXY_PREFIXES = ("/api/", "/uploads/")
WRITE_METHODS = ("POST", "PUT", "PATCH", "DELETE")

DEFAULT_UPSTREAM = "https://dealbriz.com"
DEFAULT_PORT = 5500


def build_ssl_context():
    """SSL context that actually verifies certificates.

    The default context points at an openssl cert path that does not exist
    on macOS, so https calls fail with CERTIFICATE_VERIFY_FAILED. certifi
    is used when present, otherwise the system bundle.
    """
    candidates = []
    try:
        import certifi
        candidates.append(certifi.where())
    except Exception:
        pass
    candidates.append("/etc/ssl/cert.pem")

    for cafile in candidates:
        try:
            return ssl.create_default_context(cafile=cafile)
        except Exception:
            continue
    return ssl.create_default_context()


class DevHandler(http.server.SimpleHTTPRequestHandler):
    upstream = DEFAULT_UPSTREAM
    allow_write = False
    proxy_enabled = True
    ssl_context = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # --- routing -----------------------------------------------------------

    def do_GET(self):
        self._route("GET")

    def do_HEAD(self):
        self._route("HEAD")

    def do_OPTIONS(self):
        self._route("OPTIONS")

    def do_POST(self):
        self._route("POST")

    def do_PUT(self):
        self._route("PUT")

    def do_PATCH(self):
        self._route("PATCH")

    def do_DELETE(self):
        self._route("DELETE")

    def _route(self, method):
        path = self.path.split("?", 1)[0]
        if self.proxy_enabled and path.startswith(PROXY_PREFIXES):
            self._proxy(method, path)
            return
        if method in WRITE_METHODS:
            self._reject_write(path)
            return
        self._serve_static(path)

    # --- proxy -------------------------------------------------------------

    def _proxy(self, method, path):
        if method in WRITE_METHODS and not self.allow_write:
            self._reject_write(path)
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        url = self.upstream + self.path
        req = urllib.request.Request(url, data=body, method=method)
        for header in ("Cookie", "Authorization", "Content-Type", "Accept",
                       "X-CSRF-Token", "X-Requested-With", "User-Agent"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)

        try:
            kwargs = {"timeout": 60}
            if url.startswith("https://"):
                kwargs["context"] = self.ssl_context
            with urllib.request.urlopen(req, **kwargs) as resp:
                payload = resp.read()
                self._relay(resp.status, resp.headers, payload)
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            self._relay(exc.code, exc.headers, payload)
        except Exception as exc:  # upstream down, DNS, timeout
            self._json_error(502, f"Upstream {self.upstream} unreachable: {exc}")

    def _relay(self, status, headers, payload):
        self.send_response(status)
        ctype = headers.get("Content-Type")
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        # Session cookies live in Set-Cookie (httpOnly access/refresh tokens
        # plus the readable CSRF tokens). Without relaying every one of them
        # the browser never receives a session and every login appears to
        # succeed but leaves the user logged out.
        for cookie in headers.get_all("Set-Cookie") or []:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, X-CSRF-Token, X-Requested-With")
        self.send_header("Access-Control-Allow-Methods",
                         "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _reject_write(self, path):
        self._json_error(
            503,
            "Write blocked by the local dev server (read-only proxy mode). "
            "This upstream may be production. Restart with --allow-write if "
            "you really intend to modify data.",
            path=path,
        )

    # --- static ------------------------------------------------------------

    def _serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        target = os.path.join(ROOT, rel)
        if os.path.isdir(target):
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            # SPA fallback, same as the nginx config on the server.
            target = os.path.join(ROOT, "index.html")
            if not os.path.isfile(target):
                self._json_error(404, f"Not found: {path}")
                return
        ctype, _ = mimetypes.guess_type(target)
        with open(target, "rb") as handle:
            payload = handle.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _json_error(self, status, message, path=None):
        payload = json.dumps({"error": message, "path": path}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description="DealBriz local dev server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--upstream", default=DEFAULT_UPSTREAM,
                        help=f"backend origin (default {DEFAULT_UPSTREAM})")
    parser.add_argument("--no-proxy", action="store_true",
                        help="serve static files only, do not forward /api")
    parser.add_argument("--allow-write", action="store_true",
                        help="forward write methods too (mutates upstream data)")
    args = parser.parse_args()

    DevHandler.upstream = args.upstream.rstrip("/")
    DevHandler.allow_write = args.allow_write
    DevHandler.proxy_enabled = not args.no_proxy
    DevHandler.ssl_context = build_ssl_context()

    with Server(("127.0.0.1", args.port), DevHandler) as httpd:
        mode = "static only" if args.no_proxy else f"proxy -> {DevHandler.upstream}"
        if not args.no_proxy and not args.allow_write:
            mode += " (READ ONLY: writes blocked)"
        print(f"DealBriz dev server on http://127.0.0.1:{args.port}  [{mode}]")
        if args.allow_write:
            print("WARNING: --allow-write is on. Writes will hit the upstream.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping.")


if __name__ == "__main__":
    main()
