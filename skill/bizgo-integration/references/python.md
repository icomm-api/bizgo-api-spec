# Python SDK (`bizgo-sdk-comm`)

`pip install bizgo-sdk-comm` · `import bizgo` · Python ≥ 3.10 · sync `Bizgo` and async `AsyncBizgo` with the same methods.

## Contents
- Client setup
- Sending (all channels, fallback, substitution, idempotency)
- Images
- Reports and webhooks
- Status, history, statistics
- Errors and retries
- Testing

## Client setup

```python
from bizgo import Bizgo, Environment

client = Bizgo(environment=Environment.SANDBOX)   # key from BIZGO_API_KEY; PRODUCTION is the default
# Bizgo(api_key=..., timeout=10.0, max_retries=2, http_client=httpx.Client(proxy=...))
```

Create one client per process and reuse it (it holds a connection pool). Use `with Bizgo(...) as client:` or call `client.close()`.
Set `logging.getLogger("httpx").setLevel(logging.WARNING)` in production — httpx logs full URLs at INFO, and some query strings contain phone numbers. The SDK's own `bizgo` logger never logs keys, bodies or query strings.

## Sending

```python
from bizgo import AlimtalkMessage, Destination, MmsMessage, SmsMessage

# simple
client.send.sms(to="01000000000", from_="01000000000", text="[서비스] 인증번호 123456")
client.send.lms(to="01000000000", from_="01000000000", title="안내", text="긴 본문 ...")

# any channel + fallback + substitution + idempotency
result = client.send.omni(
    to=[Destination(to=phone, replace_words={"name": name, "order": order_id}) for phone, name in rows],  # ≤ 200
    messages=[
        AlimtalkMessage(sender_key=SENDER_KEY, template_code=TEMPLATE_CODE, msg_type="AT",
                        text="#{name}님, 주문(#{order})이 접수되었습니다."),   # must match the approved template text
        MmsMessage(from_=SENDER_NUMBER, title="주문 안내", text="#{name}님, 주문(#{order})이 접수되었습니다."),
    ],
    idempotency_key=f"order-{order_id}",   # idempotency_ttl defaults to 86400 s (bizgo.DEFAULT_IDEMPOTENCY_TTL)
    ref=order_id,               # echoed back in reports
)
for d in result.failed:         # rejected at acceptance; these recipients get nothing
    log.warning("rejected msg code=%s", d.code)
store(result.msg_keys)          # keep msg_keys to match reports later
```

- `from` is a Python keyword → `from_`. Fields accept snake_case (`sender_key`) or API camelCase (`senderKey`).
- Channel models: `SmsMessage`, `MmsMessage` (LMS, or MMS when `file_key=[...]`), `InternationalMessage`, `RcsMessage`, `AlimtalkMessage`, `BrandMessage`, `NaverTalkMessage`. They are wrapped into `messageFlow` items automatically.
- Models reject unknown fields and check byte limits *before* any request, raising `pydantic.ValidationError`. Validation errors don't include input values, so they are safe to log.
- AlimTalk template auto-substitution: `AlimtalkMessage(sender_key=..., template_code=..., send_type="template")` plus `replace_words` on each destination — Bizgo builds the body from the template.
- `idempotency_ttl` (0–86400 s) is required by the server whenever `idempotency_key` is sent (A309 otherwise); the SDK fills `bizgo.DEFAULT_IDEMPOTENCY_TTL` (86400) when you set only the key. An explicit value (including 0) is kept.
- Raw body: `client.send.request({...})` accepts a dict with API field names (validated the same way).
- More than 200 recipients: use `client.send.bulk(...)` (chunks of 200, idempotency key per chunk). The send limit is 200 **messages** per second counted per recipient, so 200-recipient chunks go out about once per second; the client-side limiter paces this automatically.

## Images

```python
up = client.files.upload_mms("banner.jpg")          # jpg ≤ 300KB; path, bytes or file object
client.send.mms(to=..., from_=..., text="...", file_keys=[up.file_key])   # max 3 keys
client.files.upload_rcs("card.png").media                                  # → RcsBody(media=...)
client.files.upload_brand_message("wide.jpg", kind="wide").img_url         # default|wide|wideItemList|wideItemList/first|carouselFeed|carouselCommerce
```

File keys expire (`up.expired`); re-upload if you cache them longer.

## Reports and webhooks

```python
def save(reports):                      # called once per batch
    for r in reports:
        db.upsert(r.msg_key, status="ok" if r.report_code == "10000" else r.report_code)

client.reports.consume(save)            # poll → save → ack; a batch is NOT acked if save raises
client.reports.inquiry(msg_key)         # fill gaps (≤ 30 days)
```

Run `consume` on a schedule (e.g. every few seconds); it returns when there is nothing left.

Webhook (framework-agnostic):

```python
from bizgo.webhooks import WebhookReceiver, WebhookVerificationError
receiver = WebhookReceiver(secret=os.environ["BIZGO_WEBHOOK_SECRET"])   # tolerance=300s by default

def on_report(headers: Mapping[str, str], raw_body: bytes):
    try:
        report = receiver.report(headers, raw_body)     # receiver.mo(...) for inbound MO
    except WebhookVerificationError:
        return 401, {}
    queue.put(report)                                   # heavy work async: must answer within 5 s
    return 200, receiver.ack(report.msg_key)            # {"msgKey": ...}; otherwise Bizgo retries (≤ 3)
```

Pass the **raw** request body and the headers mapping from your framework (FastAPI `await request.body()`, Flask `request.get_data()`, Django `request.body`).

Kakao counsel (상담톡) webhooks are not signed, so they need no secret — use the module-level parsers (or `receiver.counsel_message(...)` etc., which don't verify either):

```python
from bizgo.webhooks import WebhookVerificationError, counsel_ack, parse_counsel_message

def on_counsel_message(raw_body: bytes):
    try:
        event = parse_counsel_message(raw_body)         # size / JSON depth / type checks only
    except WebhookVerificationError:                    # malformed body
        return 400, {}
    queue.put(event)
    return 200, counsel_ack()                           # {"code": "A000", "result": "Success"}
```

## Status, history, statistics

```python
client.messages.status(msg_key)                    # list, one entry per channel tried (fallback)
client.messages.status_by_request_id(msg_key[:-3]) # whole broadcast request
for m in client.messages.iter_history(since_datetime, service_type=["SMS", "ALIMTALK"]):   # follows lastSeq
    ...
client.messages.statistics(date(2026, 9, 1), date(2026, 9, 30), service_type="SMS")
for mo in client.messages.iter_mo_history(since_datetime):   # inbound MO
    ...
```

Datetimes: aware datetimes are converted to KST; naive ones are treated as KST.

## Errors and retries

```python
import bizgo, pydantic
try:
    client.send.omni(...)
except pydantic.ValidationError: ...        # fix the request; nothing was sent
except bizgo.AuthenticationError: ...       # wrong key or caller IP not registered in the console
except bizgo.DuplicateRequestError: ...     # same idempotency_key already accepted → treat as success
except bizgo.RateLimitError as e: ...       # still limited after automatic retries; e.retry_after
except bizgo.APIError as e: ...             # e.code, e.layer ("gateway"/"service"), e.description, e.tracking_id
except bizgo.APIConnectionError: ...        # unknown outcome → check client.messages.status / history before resending
```

Automatic retries (default 2, exponential backoff): reads and report acks on 429/5xx/network errors; sends only on 429 unless `idempotency_key` is set; uploads only on 429.
`e.body` holds the raw response and can contain phone numbers — don't log it whole.

## Testing

- Integration tests: `Environment.SANDBOX` with the real key from the environment.
- Unit tests: mock HTTP with `respx` (httpx) — e.g. `respx.post("https://sandbox-mars.ibapi.kr/api/comm/v1/send/omni").respond(json={...})`. Responses are `{"common": {"authCode": "A000", ...}, "data": {"code": "A000", "result": "Success", "data": {...}}}`.
