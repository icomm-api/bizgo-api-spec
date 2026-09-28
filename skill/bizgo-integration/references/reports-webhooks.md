# Reports and webhooks

Each API key is configured in the console for **one** report method: POLLING or WEBHOOK (changes take up to ~15 minutes). Use report inquiry to fill gaps either way.

## Polling

1. `GET /api/comm/v1/report/polling` → `data.data.reportId` and `data.data.report[]` (empty `reportId` / `null` list when there is nothing).
2. Store the reports durably.
3. `DELETE /api/comm/v1/report/polling/{reportId}` to acknowledge. Until you ack, the same batch comes back.

Ack **after** storing, never before — otherwise a crash between ack and store loses reports. Because a batch can be delivered twice, write reports idempotently (upsert by `msgKey`). Poll again immediately while batches keep coming; sleep a few seconds when empty (non-send APIs are limited to 5 req/s).

Report fields: `msgKey`, `serviceType`, `msgType`, `sendTime`, `reportTime`, `reportType`, `reportCode` (`10000` = success), `reportText`, `carrier` (SMS), `userType` (BrandMessage), `resCnt` (international), `ref`.

## Webhook

Bizgo POSTs one report per request to the registered URL.

- Headers: `X-IB-Timestamp` (epoch milliseconds in the docs' example) and `X-IB-Signature` = `HmacSHA256(key = webhook secret, message = X-IB-Timestamp header value)`. These two are the only signature headers. The output encoding is not confirmed yet; accept hex (any case) or base64. Customers get the webhook secret by requesting it from Bizgo (it is delivered separately).
- Verify with a constant-time comparison and reject timestamps outside a tolerance window (e.g. 5 minutes) to limit replays.
- Respond within **5 seconds** with `{"msgKey": "<the msgKey you received>"}`. Anything else counts as failure and is retried up to 3 times → deduplicate by `msgKey`.
- Also serve the endpoint over HTTPS only, allow only Bizgo's webhook source IPs (listed on the API overview page), and confirm important results with `GET /api/comm/v1/report/inquiry/{msgKey}` before acting on them.
- Return 401 for failed verification and don't log the body (it has phone numbers).

MO (inbound replies for verification/voting) uses the same headers and response; body fields: `msgKey`, `serviceType` (`MO`), `msgType` (`SM`), `to` (MO number), `from`, `originator`, `carrier`, `content`, `occurredTime`.

## Kakao counsel (상담톡) webhooks

Counsel events (user message, meta info, session end, seen info, personal info, cert result, send result) are POSTed to the registered webhook URL plus a path suffix (e.g. `/cstalk/message`).

- Counsel webhooks carry no signature headers — signatures (`X-IB-Timestamp`/`X-IB-Signature`) apply only to report and MO webhooks. Don't ask for or check a webhook secret here; just parse the JSON body (size limit, reject malformed JSON with 400).
- Respond with HTTP 200 and `{"code": "A000", "result": "Success"}` (not `{"msgKey"}`); otherwise Bizgo retries up to 3 times (5 s timeouts). Events can repeat and arrive out of order: handle them idempotently (deduplicate by `msgKey` where present) and link them by `sessionId`.
- Serve the endpoint over HTTPS and allow only Bizgo's webhook source IPs (listed on the API overview page).
- Bodies contain end-user identifiers, chat content and personal data: don't log them.

## Lookups

- `GET /api/comm/v1/report/inquiry/{msgKey}` — reports of one message, ≤ 30 days.
- `GET /api/comm/v1/message/inquiry/msgKey/{msgKey}` — acceptance + send + report status, one entry per channel tried.
- `GET /api/comm/v1/message/inquiry/requestId/{requestId}` — all messages of one broadcast request (`requestId` = `msgKey` minus its last 3 characters).
- `GET /api/comm/v1/message/history?requestTime=yyyy-MM-ddTHH:mm:ss[&serviceType=SMS,ALIMTALK][&lastSeq=][&limit≤1000]` — paginate with `lastSeq` while `hasNext` is true.
- `GET /api/comm/v1/message/history/mo?occurredTime=yyyy-MM-ddTHH:mm:ss+09:00` — MO history, same pagination.
- `GET /api/comm/v1/message/statistics?startDate=YYYYMMDD[&endDate=][&serviceType=]` — daily counts.
