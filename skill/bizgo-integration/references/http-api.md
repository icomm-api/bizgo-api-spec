# Calling the HTTP API directly

Use this for languages without an official SDK (official SDKs exist for Python, Java, JavaScript/TypeScript, Go, C#/.NET and PHP — see SKILL.md), or when a project can't add a dependency.

## Basics

- Base URL: `https://mars.ibapi.kr` (production), `https://sandbox-mars.ibapi.kr` (sandbox, same key, nothing delivered).
- Headers: `Authorization: <API key>` — the raw key, **no** `Bearer`/`ApiKey` prefix (verified on the sandbox: prefixed values get 401). `Content-Type: application/json`, `Accept: application/json`.
- The key works only from public IPs registered for it in the console (`발송관리 > 연동관리`). There is no token endpoint; ID/password token issuance belongs to the old v1 OMNI API (`omni.ibapi.kr`) and must not be used.
- HTTPS only (TLS 1.2+). Set connect/read timeouts (e.g. 5 s / 30 s). Never disable certificate verification.
- Machine-readable spec: `dist/openapi.yaml` in the `bizgo-api-spec` repo — you can generate typed models from it.

## Send

```bash
curl -X POST "https://sandbox-mars.ibapi.kr/api/comm/v1/send/omni" \
  -H "Authorization: $BIZGO_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "destinations": [{ "to": "01000000000", "replaceWords": { "name": "홍길동" } }],
    "messageFlow": [
      { "alimtalk": { "senderKey": "SENDER_KEY_EXAMPLE", "templateCode": "TEMPLATE_CODE_EXAMPLE",
                      "msgType": "AT", "text": "#{name}님, 주문이 접수되었습니다." } },
      { "sms": { "from": "01000000000", "text": "#{name}님, 주문이 접수되었습니다." } }
    ],
    "idempotencyKey": "order-20260923-0001",
    "idempotencyTtl": 86400,
    "ref": "order-20260923-0001"
  }'
```

Always send `idempotencyTtl` (seconds, 0–86400) together with `idempotencyKey`: although the docs mark it optional, a key without a TTL is rejected with `data.code == "A309"` (verified on the sandbox, 2026-09-28). The official SDKs fill 86400 for you.

Success: `common.authCode == "A000"` and `data.code == "A000"`; then check each `data.data.destinations[].code` and keep its `msgKey`.

## JavaScript / TypeScript (Node 18+, built-in fetch)

```ts
const BASE = process.env.BIZGO_BASE_URL ?? "https://sandbox-mars.ibapi.kr";

export async function sendOmni(body: unknown): Promise<any> {
  const res = await fetch(`${BASE}/api/comm/v1/send/omni`, {
    method: "POST",
    headers: { Authorization: process.env.BIZGO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => null);
  const gateway = json?.common?.authCode, service = json?.data?.code;
  if (!res.ok || (gateway && gateway !== "A000") || (service && service !== "A000")) {
    // don't include the request body or phone numbers in the error
    throw new Error(`Bizgo error http=${res.status} gateway=${gateway} service=${service} trId=${json?.common?.infobankTrId}`);
  }
  return json.data.data; // { destinations: [{ to, msgKey, code, result }] }
}
```

## Java (11+, java.net.http)

```java
HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/api/comm/v1/send/omni"))
    .timeout(Duration.ofSeconds(30))
    .header("Authorization", System.getenv("BIZGO_API_KEY"))
    .header("Content-Type", "application/json")
    .header("Accept", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))   // build with Jackson/Gson, not string concatenation
    .build();
HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
// parse, then check common.authCode, data.code, and data.data.destinations[].code
```

Create one client per application and reuse it; keep the key in an instance field, not a `static` shared across tenants.

## Uploads

`multipart/form-data` with a `file` part (optional `fileKey`, `imageName`). Send the correct part Content-Type (`image/jpeg`, ...) — a mismatch returns A205. Endpoints: `/api/comm/v1/file/mms` (→ `fileKey`), `/file/rcs` (→ `media`), `/file/brandmessage/{default|wide|wideItemList|wideItemList/first|carouselFeed|carouselCommerce}` (→ `imgUrl`).

## Webhook signature (any language)

`expected = HMAC_SHA256(key = webhookSecret, message = X-IB-Timestamp header)`; compare in constant time against `X-IB-Signature` as hex (case-insensitive) or base64; reject if the timestamp (epoch ms) is more than ~5 minutes from now; reply `{"msgKey": "<received>"}` within 5 s. Request the webhook secret from Bizgo (it is delivered separately).
