#!/usr/bin/env python3
"""PhiLearn R0: authenticated loopback-only bridge to local Ollama (stdlib only)."""
from __future__ import annotations

import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BIND_HOST = "127.0.0.1"
PORT = int(os.environ.get("PHILEARN_PORT", "8765"))
OLLAMA_URL = os.environ.get("PHILEARN_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
TOKEN = secrets.token_urlsafe(32)
ORIGINS = {
    origin.strip() for origin in os.environ.get(
        "PHILEARN_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,https://michaelwave369.github.io",
    ).split(",") if origin.strip()
}
MAX_BODY = 12_000


def ollama(path: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(f"{OLLAMA_URL}{path}", data=body, headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    with urlopen(request, timeout=120) as response:
        return json.load(response)


class Handler(BaseHTTPRequestHandler):
    server_version = "PhiLearnBridge/0.1"

    def log_message(self, format, *args):  # noqa: A002
        # Do not log bearer tokens, prompts, model replies, or request headers.
        pass

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def reply(self, status: int, data: dict):
        message = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(message)))
        self.end_headers()
        self.wfile.write(message)

    def authorized(self) -> bool:
        if self.headers.get("Origin") not in ORIGINS and self.headers.get("Origin") is not None:
            self.reply(403, {"error": "Origin not allowed"})
            return False
        if not secrets.compare_digest(self.headers.get("Authorization", ""), f"Bearer {TOKEN}"):
            self.reply(401, {"error": "Invalid or missing session token"})
            return False
        return True

    def do_OPTIONS(self):
        if self.headers.get("Origin") not in ORIGINS:
            self.reply(403, {"error": "Origin not allowed"})
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if not self.authorized():
            return
        if self.path != "/api/models":
            self.reply(404, {"error": "Not found"})
            return
        try:
            response = ollama("/api/tags")
            names = [entry.get("name", "") for entry in response.get("models", []) if entry.get("name")]
            self.reply(200, {"models": names})
        except (URLError, HTTPError, TimeoutError, ValueError) as exc:
            self.reply(502, {"error": f"Ollama not reachable: {type(exc).__name__}. Ensure ollama serve is running."})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/api/generate":
            self.reply(404, {"error": "Not found"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > MAX_BODY:
                self.reply(413, {"error": "Request must be between 1 and 12000 bytes"})
                return
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError("Body must be a JSON object")
            model, prompt = payload.get("model"), payload.get("prompt")
            if not isinstance(model, str) or not model or len(model) > 150 or not isinstance(prompt, str) or not prompt or len(prompt) > 9000:
                self.reply(400, {"error": "Invalid model or prompt"})
                return
            start = time.monotonic()
            result = ollama("/api/generate", {
                "model": model, "prompt": prompt, "stream": False,
                "options": {"temperature": 0, "num_predict": 48},
            })
            elapsed = round((time.monotonic() - start) * 1000)
            self.reply(200, {"response": result.get("response", ""), "elapsed_ms": elapsed})
        except (ValueError, TypeError):
            self.reply(400, {"error": "Invalid JSON request"})
        except (URLError, HTTPError, TimeoutError) as exc:
            self.reply(502, {"error": f"Ollama request failed: {type(exc).__name__}"})


if __name__ == "__main__":
    print("\nPhiLearn bridge R0")
    print(f"Listening (loopback only): http://{BIND_HOST}:{PORT}")
    print(f"Ollama: {OLLAMA_URL}")
    print("Allowed web origins:", ", ".join(sorted(ORIGINS)))
    print("SESSION TOKEN (paste into PhiLearn; do not share):")
    print(TOKEN, flush=True)
    print("Press Ctrl+C to stop.\n", flush=True)
    try:
        ThreadingHTTPServer((BIND_HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nBridge stopped")
