"""Find out which Authorization header format the Bizgo sandbox accepts.

Usage (the key is read from the environment and never printed):
    export BIZGO_API_KEY=...        # PowerShell: $env:BIZGO_API_KEY = "..."
    python tools/sandbox-check/check_auth.py

Only read-only endpoints are called. No message is sent.
The printed report contains codes and field names only, so it is safe to share.
"""

from __future__ import annotations

import datetime as dt
import time

from _common import Result, get, require_env

PAUSE_SECONDS = 0.5  # non-send APIs are limited to 5 TPS
KST = dt.timezone(dt.timedelta(hours=9))


def fmt(result: Result) -> str:
    parts = [f"HTTP {result.http_status}", f"authCode={result.auth_code}", f"data.code={result.service_code}"]
    if result.error:
        parts.append(f"error={result.error}")
    return ", ".join(parts)


def is_success(result: Result) -> bool:
    return result.http_status == 200 and result.auth_code == "A000"


def main() -> None:
    api_key = require_env("BIZGO_API_KEY")
    today = dt.datetime.now(KST)
    stats_query = {"startDate": today.strftime("%Y%m%d")}

    print("## 1. Authorization 헤더 형식 (GET /api/comm/v1/message/statistics)")
    candidates = {"raw key": "", "ApiKey prefix": "ApiKey ", "Bearer prefix": "Bearer "}
    accepted = []
    for label, prefix in candidates.items():
        result = get("/api/comm/v1/message/statistics", prefix + api_key, stats_query)
        print(f"- {label:14}: {fmt(result)}")
        if is_success(result):
            accepted.append(prefix)
        time.sleep(PAUSE_SECONDS)

    print("\n## 2. 잘못된 키로 호출했을 때의 응답 코드")
    print(f"- invalid key   : {fmt(get('/api/comm/v1/message/statistics', 'invalid-key-for-test', stats_query))}")
    time.sleep(PAUSE_SECONDS)

    if not accepted:
        print("\n성공한 형식이 없습니다. 허용 IP 등록(A050 가능성)과 키 반영 시간(최대 10분)을 확인하세요.")
        return

    prefix = accepted[0]
    print("\n## 3. 발송 이력 조회 응답의 data.data 필드 이름 (페이지네이션 필드 확인)")
    history = get(
        "/api/comm/v1/message/history",
        prefix + api_key,
        {"requestTime": (today - dt.timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S"), "limit": "1"},
    )
    print(f"- {fmt(history)}")
    print(f"- data.data keys: {history.data_keys}")
    time.sleep(PAUSE_SECONDS)

    print("\n## 4. Rate-limit 관련 응답 헤더")
    print(f"- {history.safe_headers or '없음'}")
    time.sleep(PAUSE_SECONDS)

    print("\n## 5. SDK 식별 헤더가 거부되지 않는지 (User-Agent, X-Bizgo-Client)")
    sdk_headers = {
        "User-Agent": "bizgo-sdk-comm-python/1.2.0 python/3.12.10 (linux; x64) app/sandbox-check-1.0.0",
        "X-Bizgo-Client": "bizgo-sdk-comm-python/1.2.0",
    }
    tagged = get("/api/comm/v1/message/statistics", prefix + api_key, stats_query, sdk_headers)
    print(f"- {fmt(tagged)} -> {'정상' if is_success(tagged) else '확인 필요'}")

    print("\n## 요약")
    print(f"- 허용된 형식: {[k for k, v in candidates.items() if v in accepted]}")


if __name__ == "__main__":
    main()
