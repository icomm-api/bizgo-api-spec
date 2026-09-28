"""Receive one Bizgo sandbox webhook and report which signature encoding (hex/base64) it uses.

Usage (the secret is read from the environment and never printed):
    export BIZGO_WEBHOOK_SECRET=...    # PowerShell: $env:BIZGO_WEBHOOK_SECRET = "..."
    python tools/sandbox-check/webhook_probe.py --port 8080

Expose the port through your own HTTPS endpoint that is registered as the webhook URL
(only the sandbox webhook IP should be allowed to reach it), then send a sandbox message.

The report lists header *names*, body field *names* and the matching scheme only.
Header values, the secret and the body values (which may contain phone numbers) are never printed.
The probe answers {"msgKey": ...} so the sandbox does not retry.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from _common import require_env
from signature import match

MAX_BODY_BYTES = 64 * 1024
SIGNATURE_HEADER = "x-ib-signature"


class Handler(BaseHTTPRequestHandler):
    secret: bytes = b""

    def log_message(self, format, *args):  # noqa: A002 - silence default access log (it prints client IPs)
        pass

    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._reply(413, {"error": "invalid length"})
            return
        body = self.rfile.read(length)
        headers = {k.lower(): v for k, v in self.headers.items()}
        timestamp = headers.get("x-ib-timestamp", "")

        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None

        print(f"\n## 웹훅 수신 ({time.strftime('%H:%M:%S')}) path={self.path.split('?')[0]}")
        print(f"- header names: {sorted(headers)}")
        print(f"- body field names: {sorted(payload) if isinstance(payload, dict) else '(JSON 객체 아님)'}")
        if timestamp.isdigit():
            skew = time.time() - int(timestamp) / (1000 if len(timestamp) >= 13 else 1)
            print(f"- X-IB-Timestamp: {len(timestamp)}자리 숫자, 현재 시각과 차이 약 {skew:.1f}초")
        else:
            print(f"- X-IB-Timestamp: {'없음' if not timestamp else '숫자가 아님'}")

        if SIGNATURE_HEADER in headers:
            found = match(headers[SIGNATURE_HEADER], self.secret, timestamp.encode())
            print(f"- {SIGNATURE_HEADER}: 길이 {len(headers[SIGNATURE_HEADER])}, 일치하는 방식 = {found or '없음'}")
        else:
            print(f"- {SIGNATURE_HEADER}: 없음")

        msg_key = payload.get("msgKey") if isinstance(payload, dict) else None
        self._reply(200, {"msgKey": msg_key} if msg_key else {})

    def do_GET(self):  # noqa: N802
        self._reply(405, {"error": "POST only"})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    Handler.secret = require_env("BIZGO_WEBHOOK_SECRET").encode("utf-8")
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"주의: {args.host}에 바인딩합니다. 방화벽으로 비즈고 sandbox 웹훅 IP만 허용하세요.", file=sys.stderr)

    server = HTTPServer((args.host, args.port), Handler)
    print(f"대기 중: http://{args.host}:{args.port} (Ctrl+C로 종료)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
