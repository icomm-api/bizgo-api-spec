"""Shared helpers for the sandbox checks.

Safety rules (see AGENTS.md):
- Credentials are read only from environment variables and are never printed.
- Only the sandbox host is contacted.
- Response bodies are never printed; only codes and field *names* are reported.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

for _stream in (sys.stdout, sys.stderr):
    # Piped output on Windows defaults to the ANSI code page and garbles Korean text.
    if not _stream.isatty() and (_stream.encoding or "").lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

SANDBOX_BASE_URL = "https://sandbox-mars.ibapi.kr"
TIMEOUT_SECONDS = 10
# Header names whose values are safe to show (rate-limit hints only).
SAFE_HEADER_PREFIXES = ("x-ratelimit", "ratelimit", "retry-after")


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"환경변수 {name}가 비어 있습니다. 값은 출력되지 않으니 셸에서 직접 설정하세요.")
    return value


@dataclass
class Result:
    http_status: int | None
    auth_code: str | None = None
    service_code: str | None = None
    data_keys: list[str] = field(default_factory=list)
    safe_headers: dict[str, str] = field(default_factory=dict)
    error: str | None = None


def _summarize(status: int, headers, raw: bytes) -> Result:
    result = Result(http_status=status)
    result.safe_headers = {
        k.lower(): v for k, v in headers.items() if k.lower().startswith(SAFE_HEADER_PREFIXES)
    }
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        result.error = "응답이 JSON이 아닙니다"
        return result
    if not isinstance(body, dict):
        result.error = "응답 최상위가 객체가 아닙니다"
        return result
    common = body.get("common") or {}
    data = body.get("data") or {}
    result.auth_code = common.get("authCode") if isinstance(common, dict) else None
    if isinstance(data, dict):
        result.service_code = data.get("code")
        inner = data.get("data")
        if isinstance(inner, dict):
            result.data_keys = sorted(inner.keys())
    return result


def get(
    path: str, authorization: str, query: dict[str, str] | None = None, extra_headers: dict[str, str] | None = None
) -> Result:
    """GET a sandbox endpoint and return a redacted summary."""
    url = SANDBOX_BASE_URL + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": authorization, "Accept": "application/json", **(extra_headers or {})},
    )
    context = ssl.create_default_context()  # certificate verification stays on
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as resp:
            return _summarize(resp.status, resp.headers, resp.read(1_000_000))
    except urllib.error.HTTPError as exc:
        return _summarize(exc.code, exc.headers, exc.read(1_000_000))
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        # str(exc) never contains request headers, so the key cannot leak here.
        return Result(http_status=None, error=type(exc).__name__ + ": " + str(getattr(exc, "reason", exc)))
