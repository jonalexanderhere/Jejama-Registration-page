import json
import re
import sqlite3
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = ROOT / "registrations.sqlite3"
API = "/api/registrations"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT / "dist", **kwargs)

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == API:
            self.reply(200, {"enabled": True})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != API:
            return self.reply(404, {"error": "Halaman tidak ditemukan."})
        if self.headers.get_content_type() != "application/json":
            return self.reply(415, {"error": "Format pengiriman tidak didukung."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError
            data = json.loads(self.rfile.read(length))
            team = data["team"].strip()
            captain = data["captain"].strip()
            email = data["email"].strip().lower()
            if not (0 < len(team) <= 80 and 0 < len(captain) <= 100 and len(email) <= 254):
                raise ValueError
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                raise ValueError
        except (ValueError, TypeError, KeyError, AttributeError):
            return self.reply(400, {"error": "Periksa nama tim, nama kapten, dan email."})

        code = uuid.uuid4().hex[:12].upper()
        try:
            with sqlite3.connect(DB) as db:
                db.execute(
                    "INSERT INTO registrations (id, team, captain, email) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(team, email) DO NOTHING",
                    (code, team, captain, email),
                )
                code = db.execute(
                    "SELECT id FROM registrations WHERE team = ? AND email = ?", (team, email)
                ).fetchone()[0]
        except sqlite3.Error:
            return self.reply(503, {"error": "Penyimpanan sedang bermasalah. Coba lagi."})
        self.reply(200, {"id": code})


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with sqlite3.connect(DB) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS registrations (
            id TEXT PRIMARY KEY,
            team TEXT NOT NULL COLLATE NOCASE,
            captain TEXT NOT NULL,
            email TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(team, email)
        )""")
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        print(f"JEJAMA CTF — http://127.0.0.1:{args.port}", flush=True)
        server.serve_forever()
