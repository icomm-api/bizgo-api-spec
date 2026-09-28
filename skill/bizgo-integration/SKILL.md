---
name: bizgo-integration
description: Write correct, secure code that integrates the Bizgo (비즈고) Communication API — sending SMS/LMS/MMS, international SMS, RCS, Kakao AlimTalk(알림톡)/BrandMessage(브랜드메시지), Naver TalkTalk, with fallback(대체발송), handling delivery reports (polling/webhook), message status/history, and error codes — using the official SDKs (Python, Java, JavaScript/TypeScript, Go, C#/.NET, PHP) or raw HTTP. Use this whenever the user mentions Bizgo, 비즈고, mars.ibapi.kr, Infobank/인포뱅크 messaging, 문자 발송 연동, 알림톡 연동, 카카오 비즈메시지 API, sending verification codes or notifications by SMS/KakaoTalk from a backend in Korea, or migrating from the old infobank-omni SDK — even if they don't name the SDK.
---

# Bizgo integration

Bizgo is a Korean messaging platform. One endpoint (`POST /api/comm/v1/send/omni`) sends every channel; the channel is chosen by the message object inside `messageFlow`, and extra messages in that array are **fallbacks** tried in order when the previous one fails.

Most integration bugs come from a handful of misunderstandings. Keep these in mind while writing code:

1. **Accepted is not delivered.** The send response only says which recipients were *accepted*. The final result arrives later as a *report*. Code that marks a message "sent" from the send response alone is wrong for anything that matters (OTP retries, billing, customer notices).
2. **A request can partially fail.** Each recipient has its own code in the response. Always look at the per-recipient results (`result.failed` in Python), not just the top-level status.
3. **Retrying a send can deliver twice.** After a timeout you don't know whether Bizgo accepted the message. Set an idempotency key derived from your own business ID (order ID, OTP request ID) so a retry is rejected as a duplicate instead of delivered again. Raw HTTP callers must send `idempotencyTtl` with the key (A309 otherwise); the SDKs default it to 86400 s.
4. **Limits are bytes, not characters.** SMS is 90 bytes and LMS/MMS 2,000 bytes in EUC-KR (Hangul = 2 bytes, so ~45 Korean characters for SMS). Emoji are not allowed in SMS/LMS/MMS.
5. **Credentials are server-side only.** The API key goes in the `Authorization` header as the raw key (no `Bearer`/`ApiKey` prefix — those return 401). It only works from IPs registered in the console, so it can never be used from a browser or mobile app anyway.

## Workflow

1. **Pick the language path.**
   - Python → use the SDK: read [references/python.md](references/python.md).
   - Java, JavaScript/TypeScript, Go, C#/.NET, PHP → use the official SDK and read its `llms.txt` first (API surface, examples, rules):

     | Language | Install | llms.txt |
     |---|---|---|
     | Java 11+ | `implementation 'io.github.icomm-api:bizgo-sdk-comm-java:1.2.0'` | https://github.com/icomm-api/bizgo-sdk-comm-java/blob/main/llms.txt |
     | JavaScript/TypeScript (Node) | `npm install @bizgo/bizgo-sdk-comm-js@^1.2.0` | https://github.com/icomm-api/bizgo-sdk-comm-js/blob/main/llms.txt |
     | Go | `go get github.com/icomm-api/bizgo-sdk-comm-go@v1.2.0` | https://github.com/icomm-api/bizgo-sdk-comm-go/blob/main/llms.txt |
     | C#/.NET | `dotnet add package Bizgo.Sdk.Comm --version 1.2.0` | https://github.com/icomm-api/bizgo-sdk-comm-cs/blob/main/llms.txt |
     | PHP | `composer require icomm-api/bizgo-sdk-comm:^1.2` | https://github.com/icomm-api/bizgo-sdk-comm-php/blob/main/llms.txt |

     Don't copy code from the old `infobank-omni-sdk-*` repositories or the v1 `bizgo-sdk-comm-java/js` READMEs — they target the previous OMNI API.
   - Anything else → call the HTTP API directly: [references/http-api.md](references/http-api.md).
2. **Pick channels and fallback order** with [references/channels.md](references/channels.md) (limits, required fields, which channel needs which pre-registration).
3. **Decide how you get results**: report polling vs webhook, see [references/reports-webhooks.md](references/reports-webhooks.md). Ask the user which one their API key is configured for in the console if it isn't clear — the two are mutually exclusive per key.
4. **Handle errors** with [references/errors.md](references/errors.md).
5. **Before you finish**, run through the checklist below.

## What to ask the user (only if you can't infer it)

- Which channels they have registered: a sender number (필수 for SMS/LMS/MMS), a Kakao sender profile key + approved template codes (AlimTalk/BrandMessage), an RCS brand, a Naver partner key. Code can't work without these, and they come from the Bizgo console, not from the API.
- Whether the message is informational (정보성) or advertising (광고성). Advertising content has legal requirements in Korea (e.g. `(광고)` prefix, opt-out info, and no scheduled ad sends between 20:00–08:00 KST). Mention this; don't silently generate ad copy without it.

Use placeholders like `SENDER_KEY_EXAMPLE`, `TEMPLATE_CODE_EXAMPLE` and `01000000000` in code, and read real values from environment variables or config — never invent keys or put real phone numbers in examples.

## Checklist before handing code back

- [ ] API key and webhook secret come from env vars / a secret store; nothing secret in code, tests, or logs.
- [ ] Tests and local runs use the **sandbox** (`https://sandbox-mars.ibapi.kr`, same key, nothing is delivered).
- [ ] Sends that may be retried carry an idempotency key based on a business ID.
- [ ] Per-recipient failures are handled; recipients are batched at ≤ 200 per request.
- [ ] Final status comes from reports (polling with ack-after-store, or a verified webhook that answers `{"msgKey": ...}` within 5 s and deduplicates by `msgKey`).
- [ ] Webhook signatures are verified for report and MO webhooks only; Kakao counsel (상담톡) webhooks have no signature — parse them and answer `{"code": "A000", "result": "Success"}` (see [references/reports-webhooks.md](references/reports-webhooks.md)).
- [ ] Phone numbers and message bodies are not written to logs as-is (they are personal data); log `msgKey` and codes instead.
- [ ] Rate limits respected: send is **200 messages/s counted per recipient** (one request with 200 destinations uses the whole second), everything else 5 req/s (status, history, reports). Polling loops sleep between empty polls.
- [ ] Text fits the byte limit of *every* channel in the fallback chain (an AlimTalk text that falls back to SMS must also fit SMS, or use LMS as the fallback).

## Source of truth

- OpenAPI spec (field-level constraints, examples): `dist/openapi.yaml` in the `bizgo-api-spec` repository.
- Unconfirmed behavior is marked `x-unverified` in the spec (sandbox-verified facts are `x-verified`). If something you need is marked unverified, say so to the user instead of guessing.
- Official reference: https://developers.bizgo.io/api-sdk/api-reference
