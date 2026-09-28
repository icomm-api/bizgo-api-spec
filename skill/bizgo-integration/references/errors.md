# Errors

Every response is an envelope:

```json
{ "common": { "authCode": "A000", "authResult": "Success", "infobankTrId": "..." },
  "data":   { "code": "A000", "result": "Success", "data": { ... }, "ref": "..." } }
```

Judge it in two layers:

1. **Gateway** — `common.authCode`. Authentication, permission and format checks. When this fails, `data` may be missing entirely (e.g. wrong key → HTTP 401, `authCode: A401`, no `data`).
2. **Service** — `data.code`. The product API's own result, sometimes with HTTP 200.
3. **Per recipient** (send only) — `data.data.destinations[].code`.

The same code string means different things per layer: gateway `A401` is "Unauthorized", service `A401` is an invalid `paymentCode` field; gateway `A301` is a redirect, service `A301` is a duplicate idempotency key. Always interpret a code together with the layer it came from. Keep `infobankTrId` for support requests.

## Codes you will actually handle

| Layer | Code | Meaning | What to do |
|---|---|---|---|
| gateway | A401 (HTTP 401) | wrong/missing key | check the key has no prefix, and that the caller's public IP is registered for that key |
| gateway | A403 | forbidden | account/permission issue |
| service | A020 (HTTP 429) | rate limit | back off exponentially; honour `Retry-After` if present |
| service | A301 | same `idempotencyKey` already processed | treat as already sent; don't resend |
| service | A306 | invalid/empty `to` | fix the recipient |
| service | A318 | more than 200 recipients | split the request |
| service | A321 | `title` or `fileKey` sent on an international SMS | remove the field |
| service | A2xx | file problems (size, type, resolution, missing file) | fix the upload |
| service | A910 / A920 / A999 | server error / busy / unknown | retry with backoff (sends only with an idempotency key) |
| report | 10000 | delivered | — |

The full tables (gateway, service with HTTP status and Korean description, ~580 report codes) are in `data/error-codes.json` of the `bizgo-api-spec` repository and at https://developers.bizgo.io/api-sdk/api-reference/error-codes.

## Retry policy

| Situation | Retry? |
|---|---|
| 429 / A020 | yes, with backoff (the gateway rejected it before processing) |
| 5xx, network error on reads, report ack | yes |
| 5xx, timeout, network error on **send** | only if the request has an `idempotencyKey`; otherwise check status/history first |
| 4xx other than 429 | no — fix the request |
