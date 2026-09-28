# Bizgo SDK 공통 설계 규약

모든 언어 SDK(`bizgo-sdk-comm-python`, `-java`, `-js`, `-go`, `-cs`, `-php`)가 따르는 설계입니다. 참조 구현은 Python SDK입니다. 언어 관례에 맞게 이름은 바꾸되(`send.omni` / `send().omni()` / `send.omni()`), **동작은 같아야 합니다.**

## 1. 기준 스펙

- 모델은 `dist/openapi.yaml`에서 생성하거나 그대로 옮깁니다. 스펙에 없는 필드·제약을 만들지 않습니다.
- 스펙 사본은 각 SDK 저장소의 `spec/`에 두고, 생성 결과가 스펙과 같은지 CI에서 검사합니다.
- 에러코드 표(`data/error-codes.json`)의 service 코드(코드 → HTTP 상태, 한국어 설명)를 SDK에 포함합니다.

## 2. 클라이언트

| 항목 | 규약 |
|---|---|
| 생성 | API Key 인자 또는 환경변수 `BIZGO_API_KEY`. 없으면 설정 오류. 공백이 있으면(`Bearer x` 등) 설정 오류 |
| 환경 | `PRODUCTION = https://mars.ibapi.kr`(기본), `SANDBOX = https://sandbox-mars.ibapi.kr`, `baseUrl` 재정의는 https만(localhost 예외) |
| 헤더 | `Authorization: <raw key>`(접두어 없음, 2026-09-23 sandbox 확인), `Accept: application/json`, `User-Agent`와 `X-Bizgo-Client`(§2.1) |
| 타임아웃 | 기본 연결 5초, 전체 30초 |
| 재시도 | 기본 `maxRetries = 2` |
| 상태 | 키·설정은 **인스턴스별**. static/전역 공유 금지. 스레드 안전 |
| 표현 | `toString`/`repr`/`inspect`에 키를 넣지 않음 |
| 리소스 | `send`, `files`, `reports`, `messages` (+ `webhooks` 유틸리티) |

### 2.1 SDK 식별 헤더

비즈고 서버가 SDK 사용 현황(언어·버전·런타임)을 집계할 수 있게 모든 요청에 붙입니다. SDK가 데이터를 따로 보내는 기능(phone-home)은 만들지 않습니다.

| 헤더 | 형식 | 예 |
|---|---|---|
| `User-Agent` | `bizgo-sdk-comm-<lang>/<sdkVer> <runtime>/<runtimeVer> (<os>; <arch>)[ app/<name>-<ver>]` | `bizgo-sdk-comm-python/0.2.0 python/3.12.10 (linux; x64) app/myshop-1.4.2` |
| `X-Bizgo-Client` | `bizgo-sdk-comm-<lang>/<sdkVer>` (프록시가 User-Agent를 바꿔도 남도록 별도 헤더) | `bizgo-sdk-comm-java/2.0.0` |

- `<lang>`: `python`, `java`, `js`, `go`, `cs`, `php`. `<runtime>`: `python`, `java`, `node`/`bun`/`deno`, `go`, `dotnet`/`dotnetfx`, `php`.
- `<os>`: `linux`, `windows`, `darwin`, `freebsd`, 그 외는 `other`. `<arch>`: `x64`, `arm64`, `x86`, `arm`, 그 외 `other`. 호스트명·사용자명·커널 버전 등 자세한 값은 넣지 않습니다.
- 앱 정보(선택): 옵션 `appInfo(name, version)`. `name`은 `^[A-Za-z0-9._-]{1,50}$`, `version`은 `^[A-Za-z0-9._+-]{1,30}$`만 허용하고 그 밖이면 설정 오류(헤더 인젝션·개인정보 유입 방지). 이메일·전화번호처럼 보이는 값은 넣지 말라고 문서화합니다.
- 사용자가 넘긴 HTTP 클라이언트나 헤더 옵션으로 이 두 헤더와 `Authorization`을 덮어쓸 수 없습니다.
- 헤더 값은 클라이언트 생성 시 한 번 만들고, 로그·hook에는 넘기지 않아도 됩니다(민감 정보는 아니지만 일관성 유지).

## 3. 리소스와 메서드

| 리소스 | 메서드 | 엔드포인트 |
|---|---|---|
| send | `omni(to, messages, ref?, groupKey?, paymentCode?, idempotencyKey?, idempotencyTtl?)` → `SendResult` | `POST /api/comm/v1/send/omni` |
| | `request(SendOmniRequest)` → `SendResult` | 〃 |
| | `sms(to, from, text, ref?, idempotencyKey?, idempotencyTtl?)`, `lms(... title?)`, `mms(... fileKeys, title?)` | 〃 |
| files | `uploadMms(file, filename?, fileKey?, imageName?)` → `{fileKey, expired}` (300KB 초과 시 보내기 전 오류) | `POST /api/comm/v1/file/mms` |
| | `uploadRcs(file, ...)` → `{media, expired}` | `POST /api/comm/v1/file/rcs` |
| | `uploadBrandMessage(file, kind, ...)` → `{imgUrl}`; kind ∈ `default, wide, wideItemList, wideItemList/first, carouselFeed, carouselCommerce` (그 외 값은 오류) | `POST /api/comm/v1/file/brandmessage/{kind}` |
| reports | `poll()` → `ReportBatch{reportId, reports, empty}` | `GET /api/comm/v1/report/polling` |
| | `ack(reportId)` | `DELETE /api/comm/v1/report/polling/{reportId}` |
| | `consume(handler, maxBatches?)` → 처리 건수. handler가 성공한 배치만 ack, 빈 배치에서 종료 | |
| | `inquiry(msgKey)` → `Report[]` | `GET /api/comm/v1/report/inquiry/{msgKey}` |
| messages | `status(msgKey)`, `statusByRequestId(requestId)` → `MessageStatus[]` | `GET /api/comm/v1/message/inquiry/...` |
| | `statistics(startDate, endDate?, serviceType?, groupKey?)` | `GET /api/comm/v1/message/statistics` |
| | `history(requestTime, serviceType?, groupKey?, lastSeq?, limit?)` → `MessagePage`, `iterHistory(...)` | `GET /api/comm/v1/message/history` |
| | `mo(msgKey)`, `moHistory(occurredTime, from?, to?, lastSeq?, limit?)`, `iterMoHistory(...)` | `GET /api/comm/v1/message/{inquiry/mo,history/mo}` |

- `to`는 문자열 하나, 문자열 목록, `Destination` 목록을 받습니다.
- `idempotencyTtl`(초, 0~86400)은 `idempotencyKey`를 지정하고 TTL을 비워 두면 **SDK가 86400을 채웁니다**(§12.20). 서버는 키만 있고 TTL이 없으면 A309로 거절합니다(2026-09-28 sandbox 확인). 기본값은 언어별 상수(`DEFAULT_IDEMPOTENCY_TTL` 등, 값 86400)로 공개합니다.
- `messages`에는 채널 메시지 모델을 순서대로 넣고, SDK가 `{ <채널키>: message }`로 감쌉니다.
- iterator는 `hasNext`가 false이거나, `lastSeq`가 없거나, 커서가 움직이지 않으면 멈춥니다.
- 날짜 형식: statistics `YYYYMMDD`, history `requestTime`은 KST `yyyy-MM-dd'T'HH:mm:ss`(시간대가 있으면 KST로 변환), MO `occurredTime`은 `+09:00` 오프셋 포함(시간대가 없으면 KST로 간주).
- `limit`는 1~1000, 범위 밖이면 보내기 전 오류.
- 경로 파라미터는 URL 인코딩합니다(`/`, `?` 포함).

## 4. 요청 검증 (보내기 전)

- 필수 필드, 알 수 없는 필드(가능한 언어에서), `maxLength`, `maxItems`(수신자 200), `enum`.
- `x-max-bytes` + `x-charset: EUC-KR`: CP949로 인코딩한 바이트 수로 셉니다. 인코딩할 수 없는 문자(이모지 등)는 오류. CP949 인코더가 없는 런타임(JS)은 문서화된 근사 규칙(ASCII 1byte, 그 외 BMP 2byte, BMP 밖 문자 오류)을 씁니다.
- **조건부 필수(`x-sdk-required-if`)**: 스키마에 이 확장이 있으면(형식은 [AGENTS.md](../AGENTS.md) 11번) 보내기 전에 규칙을 모두 검사하고, 어기면 다른 필수 필드 누락과 같은 클라이언트 검증 오류를 냅니다. 서버에 요청을 보내지 않습니다(재시도·속도 제한 토큰도 쓰지 않음). 규칙 목록은 스펙에서 읽고 SDK에 하드코딩하지 않습니다. 오류 메시지는 필드 경로와 조건만 씁니다(예: `messageFlow[0].alimtalk.msgType: required when sendType != template`). 입력값은 넣지 않습니다. `$.` 경로는 요청 본문 루트(`SendOmniRequest`, `ReservationCreateRequest` 등) 기준이며, 채널 모델만 따로 만들 때가 아니라 요청 전체를 검증할 때 검사합니다. 예: 알림톡 전문 발송에서 `msgType`이 빠지면 서버는 A523으로 거절하므로(2026-09-28 sandbox 확인) SDK가 먼저 막습니다.
- `messageFlow` 항목은 채널 키가 정확히 하나.
- 사용자가 설정한 필드만 직렬화합니다(스펙 기본값을 임의로 보내지 않음). JSON 필드명은 API 이름(camelCase, `from`).
- 검증 오류 메시지에 입력값(전화번호 등)을 넣지 않습니다. 필드 경로와 이유만 씁니다.

## 5. 응답과 오류

판정 순서: HTTP 응답 → JSON이 아니면(4xx/5xx는 상태별 APIError, 2xx는 InvalidResponse) → `common.authCode ≠ A000`이면 **gateway** 오류 → `data.code ≠ A000`이면 **service** 오류 → HTTP ≥ 400이면 gateway 오류 → 성공.

예외 계층(이름은 언어 관례에 맞게):

```
BizgoError
├── ConfigurationError
├── APIConnectionError ── APITimeoutError
├── APIError {httpStatus, code, message, layer: gateway|service, description?, trackingId?, body}
│   ├── BadRequestError (400)        ├── AuthenticationError (401)   ├── PermissionDeniedError (403)
│   ├── NotFoundError (404)          ├── DuplicateRequestError (service A301)
│   ├── RateLimitError (429 / A020, retryAfter?)                     └── InternalServerError (5xx)
├── InvalidResponseError
└── WebhookVerificationError
```

코드 매핑(층별로 별도 표):
- gateway: `A400`→BadRequest, `A401`→Authentication, `A403`→PermissionDenied, `A404`→NotFound
- service: `A001/A002/A100`→Authentication, `A110/A111`→PermissionDenied, `A020`→RateLimit, `A301`→DuplicateRequest
- 표에 없으면 HTTP 상태로. HTTP 200인데 service 코드가 실패면 에러코드 표의 문서상 HTTP 상태로 고릅니다(예: A306 → 400 → BadRequest).
- `description`은 service 코드의 한국어 설명. 오류 문자열: `HTTP 400 | service code=A306 | <result> | <description> | infobankTrId=...`.

## 6. 재시도

| 정책 | 대상 | 재시도 조건 |
|---|---|---|
| SAFE | 조회, DELETE(ack), `idempotencyKey`가 있는 발송 | 429, 500/502/503/504, 네트워크 오류 |
| RATE_LIMIT_ONLY | `idempotencyKey`가 없는 발송, 업로드 | 429만 |

- 대기: `Retry-After`(초, 최대 60) 우선, 없으면 `min(0.5 × 2^attempt, 8) × jitter(0.75~1.25)`.
- 네트워크 오류 후 재시도한 요청이 `A301`을 받으면, "이전 시도가 이미 접수됨"을 설명하는 메시지로 DuplicateRequestError를 냅니다.
- 업로드 파일은 한 번 읽어 재시도에 재사용합니다.

## 7. 웹훅

- `verifySignature(secret, timestamp, signature, tolerance = 300s, now?)`: `X-IB-Signature` = `HMAC-SHA256(key=secret, msg=X-IB-Timestamp)`(비즈고 확인, 2026-09-28). 서명 헤더는 `X-IB-Signature`/`X-IB-Timestamp`만 읽고 다른 헤더 이름은 받지 않습니다. 출력 인코딩은 아직 확인되지 않아 hex(대소문자 무시)·base64를 모두 허용하며, 접두어(`sha256=` 등)는 허용하지 않습니다. **constant-time 비교**. timestamp는 13자리 이상이면 epoch ms, 아니면 초. 허용 오차 밖이면 오류.
- `WebhookReceiver(secret)`(secret은 비즈고에 요청해 별도로 받습니다): `report(headers, rawBody)`, `mo(headers, rawBody)`(헤더 이름 대소문자 무시), `ack(msgKey)` → `{"msgKey": msgKey}`.
- 본문 최대 1MB, JSON이 아니면 WebhookVerificationError.
- 권장 운영 방식을 문서화합니다: 서명·timestamp 검증, HTTPS, 발신 IP 허용 목록, `msgKey` 중복 제거, 중요한 판단 전 조회 API로 결과 확인.

## 8. 보안

- 로그·예외·`toString`에 API Key, 요청 본문, 쿼리 문자열, 전화번호, 웹훅 secret을 넣지 않습니다. 로그는 `METHOD path -> status (ms, attempt n)`만.
- HTTP 라이브러리 예외를 감쌀 때 원인 체인에 URL이 남지 않게 합니다.
- TLS 검증을 끄는 옵션을 두지 않습니다.
- 사용자 URL로 Authorization 헤더를 보내지 않습니다(웹훅 "발송" 기능 같은 것을 만들지 않음).
- 테스트·예제 값은 placeholder만: `01000000000`, `SENDER_KEY_EXAMPLE`, `test-api-key-not-real`.
- 런타임 의존성은 최소로 둡니다.

## 9. 테스트와 문서

- 모든 단위 테스트는 mock HTTP로 오프라인 실행. 최소한 다음을 검사합니다: 헤더(raw key), 요청 본문 직렬화(기본값 미전송), 대체발송 순서, 부분 실패, 바이트 제한·이모지, 200명 제한, 알 수 없는 필드, 채널 키 1개, 재시도 정책(발송 타임아웃: 키 없으면 1회, 있으면 재시도), Retry-After, A301 설명, 게이트웨이 401(data 없음), 층별 코드 의미 차이, 비 JSON 응답, 로그·예외에 키·전화번호 없음, http base URL 거부, 경로 인코딩, 페이지 순회, 날짜 변환, 업로드 multipart·크기 제한·kind 검증, 웹훅 서명(hex/base64/접두어/오차/틀린 secret), 스펙 예제 왕복, 스펙의 operation 전체 구현 여부.
- 예제는 테스트에서 mock으로 실행합니다.
- 저장소마다 `README.md`(한국어), `AGENTS.md` + `CLAUDE.md`(`@AGENTS.md`), `llms.txt`, `SECURITY.md`, `CHANGELOG.md`, gitleaks 설정, CI(테스트, lint, 생성 코드 검사, 의존성 감사, 비밀정보 검사), 배포 워크플로(토큰 없는 방식 우선)를 둡니다.

## 10. 스펙 기반 메서드 생성 (전체 API)

P0 이후의 모든 operation은 SDK가 **스펙 메타데이터로 메서드를 생성**합니다(직접 작성 금지). 규칙은 [AGENTS.md](../AGENTS.md) 11번의 `x-sdk-*` 필드입니다.

- 위치: `client.<x-sdk-resource>.<x-sdk-method>(...)`. 점으로 구분된 리소스는 중첩 객체입니다(예: `client.alimtalk.templates.list(...)`, 언어 관례에 맞게 `client.alimtalk().templates().list(...)`).
- 인자: 경로 파라미터(순서대로, 필수) → 요청 본문 모델(있으면) → 쿼리 파라미터 객체/키워드 인자(선택 항목은 선택). 본문 모델은 §4 검증을 그대로 받습니다.
- 반환: `x-sdk-result` 경로(기본 `data.data`)의 응답 모델. 데이터가 없는 응답은 void/None.
- 재시도: `x-sdk-retry` 값(`safe` → SAFE, `rate_limit_only` → RATE_LIMIT_ONLY).
- 페이지: `x-sdk-pagination`이 있으면 한 페이지 메서드와 함께 전체 순회 메서드(`iter<Method>` / `<method>All` 등 언어 관례)를 생성합니다. cursor는 §3 iterator 규칙, page·offset은 받은 항목 수가 0이거나 요청한 크기보다 적거나 `total`에 도달하면 멈춥니다.
- multipart 업로드 operation은 §3 업로드 규칙(한 번 읽기, content type, 파일 이름)을 따르는 공통 헬퍼를 씁니다.
- 요청 본문 스키마에 `idempotencyKey`와 `idempotencyTtl`이 모두 있는 operation(현재 `sendOmni`)은 §12.20 규칙을 적용합니다. 모델이 아닌 dict/map/배열 같은 raw 본문도 같으며, 사용자가 넘긴 객체는 바꾸지 않고 복사본에 채웁니다. 대상 operation은 스펙에서 찾고 SDK에 하드코딩하지 않습니다.
- 웹훅: `x-sdk-webhook` 이름마다 `WebhookReceiver.<name>(headers, body)` 파서를 생성합니다. 스펙에 서명 헤더(`WebhookTimestampHeader`/`WebhookSignatureHeader`)가 정의된 웹훅(리포트·MO)만 서명을 검증하고, 상담톡 웹훅은 서명 없이 파싱합니다(§11.5).
- P0에서 직접 만든 편의 메서드(`send.sms`, `reports.consume` 등)는 유지하고, 같은 이름이면 편의 메서드가 우선합니다.
- 생성 결과가 스펙과 다르면 CI가 실패해야 하며, "스펙의 모든 operation이 SDK에 있는지" 테스트를 둡니다.

## 11. 편의 기능

### 11.1 대량 발송

`send.bulk(to, messages, chunkSize = 200, concurrency = 4, idempotencyKeyPrefix?, ...omni 옵션)` → `BulkSendResult`

- 수신자 수에 제한이 없습니다. `chunkSize`(1~200)씩 나눠 `send.omni`를 호출합니다.
- `idempotencyKeyPrefix`가 있으면 요청마다 `<prefix>-<chunkSize>-<startIndex>-<hash8>`(§12.3)을 멱등성 키로 씁니다(재실행 시 같은 청크는 중복 발송되지 않음). 청크마다 `idempotencyTtl`도 §12.20 규칙대로 보냅니다(지정하지 않으면 86400). 없으면 재시도 정책은 §6과 같습니다.
- 한 청크가 실패해도 나머지는 계속 보냅니다. 결과: `results`(청크별 `SendResult`), `errors`(청크 번호, 수신자 범위(인덱스), 예외), `succeeded`/`failed`/`msgKeys`(전체 합계).
- 동시 요청은 `concurrency` 이하. §11.2 속도 제한(수신자 수 기준)을 함께 적용하므로, 200명씩 나누면 기본 한도에서 초당 1청크로 맞춰집니다.
- 수신자 목록을 로그·예외에 넣지 않습니다(인덱스 범위만).

### 11.2 클라이언트 속도 제한

- 클라이언트 인스턴스마다 토큰 버킷 2개: **send**(발송, 기본 **초당 200 메시지**), **other**(그 외 API, 기본 초당 5 요청).
- **send 한도는 요청 수가 아니라 메시지(수신번호) 수 기준입니다.** 발송 요청 1건이 쓰는 토큰 = 요청의 `destinations` 개수(최소 1). 수신자 200명짜리 요청은 토큰 200개를 쓰므로 초당 1건만 나갑니다. 수신자 목록이 없는 발송(예: 친구 그룹 대상 동보)은 1로 셉니다. other 버킷은 요청마다 1입니다.
- 버킷 용량(burst)은 초당 한도와 같습니다. 요청 비용이 용량보다 크면(예: 한도를 100으로 낮췄는데 200명 요청) 버킷이 가득 찰 때까지 기다린 뒤 보내고 부족분은 음수 잔량(빚)으로 남깁니다. 그래서 막히지 않으면서 평균 속도는 한도를 지킵니다.
- 대기는 요청 전(재시도 포함, 시도마다)에 합니다. 비동기 런타임은 non-blocking으로 기다립니다.
- 기본 켜짐. 옵션으로 값 변경 또는 끄기(`rateLimit: { send, other }` / `null`).
- 한도는 계정 단위이므로 여러 프로세스·서버에서 같은 키를 쓰면 이 제한만으로는 부족하다는 점을 문서화합니다. 429 재시도(§6)는 그대로 유지합니다.

### 11.3 테스트 도구

고객이 자기 코드를 네트워크 없이 테스트할 수 있게 제공합니다(`bizgo.testing` 등 별도 모듈, 운영 코드에서 import하지 않아도 되게).

- **FakeTransport / mock 클라이언트**: 실제 클라이언트에 주입해 요청을 기록하고 응답을 돌려줍니다. 기본 응답은 operation별 성공 봉투(발송은 수신자마다 `A000` + 가짜 `msgKey`). `respond(operationId 또는 method+path, body/status)`, `requests`(기록된 요청: method, path, query, JSON 본문)로 검증.
- **오류 주입**: 특정 호출에 HTTP 상태·코드(예: 429 A020, 401 A401, 수신자별 A306)를 지정.
- **웹훅 테스트 요청 생성**: `signWebhook(secret, payload, timestamp?)` → 헤더 + 본문. 서명 방식은 §7과 같게.
- 가짜 키·번호는 placeholder(`test-api-key-not-real`, `01000000000`)를 씁니다.

### 11.4 관측(Observability)

- **hooks**: 요청 시작/종료 콜백. 전달 값: operationId, resource.method, HTTP method, **경로 템플릿**(예: `/api/comm/v1/report/inquiry/{msgKey}`), 상태 코드, `layer`/`code`, 시도 횟수, 소요 시간. **본문·쿼리·전화번호·키·실제 경로 값은 넘기지 않습니다.**
- OpenTelemetry: 런타임 의존성을 추가하지 않는 방식으로 제공합니다 — .NET은 `ActivitySource("Bizgo")`, Python은 선택 extra(`bizgo-sdk-comm[otel]`), Java/JS/Go/PHP는 hooks 위의 작은 어댑터(선택 의존성 또는 예제 코드). span 이름 `bizgo <resource>.<method>`, 속성 `http.request.method`, `url.template`, `http.response.status_code`, `bizgo.code`, `bizgo.layer`, `bizgo.retry_count`.

### 11.5 언어 간 통일 규칙 (Java 구현에서 확정, 2026-09-24)

- **send 버킷**(비용 = 수신자 수, §11.2)은 스펙에서 `x-sdk-rate: send`가 붙은 operation만 씁니다(목록을 SDK에 하드코딩하지 않음). 현재: `sendOmni`(+ `send.*` 편의 메서드·`bulk`), `createReservation`, `addReservationRecipients`, `createBrandMessageGroupSend`, `sendCounselPlain`, `sendCounselRich`. 수신자 목록이 없는 발송(상담톡, 친구 그룹 대상 동보)은 비용 1. 그 외 모든 API는 other 버킷(초당 5 요청)입니다.
- **상담톡 웹훅**: 서명(`X-IB-Timestamp`/`X-IB-Signature`, secret)은 리포트·MO 웹훅에만 있고 상담톡 웹훅에는 없습니다(비즈고 확인, 2026-09-28). SDK는 상담톡 웹훅의 서명을 요구하거나 검사하지 않으며, 서명 헤더가 와도 무시합니다. 기존 입력 방어(본문 크기 제한, JSON 깊이 64, 필드 형태 검사)만 적용해 파싱하고 타입이 있는 payload를 돌려줍니다. 상담톡 파싱에는 웹훅 secret이 필요 없습니다(언어별로 secret 없이 쓰는 방법을 README에 적습니다). 리포트·MO 웹훅은 항상 서명이 필요합니다. 권장 운영 방식: HTTPS, 비즈고 웹훅 발신 IP 허용 목록, `msgKey`가 있으면 그 값으로 중복 제거.
- 상담톡 웹훅 응답은 `{"code": "A000", "result": "Success"}`(리포트·MO의 `{"msgKey"}`와 다름).
- `createReservation`은 `x-sdk-result: data`라 `resvKey`와 `data`(수신자별 결과)를 함께 돌려줍니다. 테스트 도구의 기본 성공 응답에도 `resvKey`를 넣습니다.
- 테스트 도구·OpenTelemetry는 core와 분리된 패키지/모듈(또는 subpath/extra)로 제공해 core의 런타임 의존성을 늘리지 않습니다.

## 12. 보안·편의성 검토 후 강화 규칙 (2026-09-24, Python·Java·JS 검토에서 확인)

모든 언어에 적용합니다(20개). 각 항목은 재현 테스트를 둡니다.

1. **응답 파싱 실패는 SDK 예외로**: 응답 모델 검증·JSON 오류(언어별 ValidationError, JsonException, RecursionError 등)를 그대로 던지지 않고 `InvalidResponseError`로 감쌉니다(HTTP 상태, `trackingId`, 원본 `body` 포함). 발송 operation이면 메시지에 "요청은 접수됐을 수 있으니 상태 조회로 확인하세요"를 넣습니다. 봉투 필드(`common.authResult`, `data.result` 등)는 응답 모델에서 필수로 두지 않습니다.
2. **대량 발송은 청크 단위로 모든 예외를 잡습니다**(설정 오류 제외). 언어의 치명적 오류(Java `Error`, 스레드 인터럽트 등)가 나도 이미 접수된 청크의 결과는 돌려주거나 예외에 담아 잃지 않게 합니다. hooks·관측은 파싱 실패를 성공으로 보고하지 않습니다. 한 청크의 어떤 실패도 나머지 청크와 이미 받은 결과를 잃게 하지 않습니다.
3. **대량 발송 멱등성 키** = `<prefix>-<chunkSize>-<startIndex>-<hash8>`. `hash8`은 청크 수신번호 목록(순서 포함)의 SHA-256 앞 8자리(16진). 같은 목록·같은 청크 크기로 다시 실행하면 같은 키가 되어 중복 발송이 막히고, 키가 다른 수신자 묶음에 재사용되는 일은 없습니다. README에 "재실행은 같은 목록·같은 chunkSize로, 실패한 청크만 다시 보내려면 `errors`의 청크 번호를 쓰세요"를 적습니다. 키 길이는 200자 이하로 검증합니다. `hash8`은 청크 수신번호를 순서대로 `
`으로 이어 붙인 UTF-8 문자열의 SHA-256입니다. **공통 테스트 벡터**(모든 언어가 같은 값을 내야 함): 수신자 `01000000000`, `01000000001`, `01000000002`, `chunkSize=2`, prefix `camp` → `camp-2-0-32fe30d2`, `camp-2-2-370752d8`(Python·Java·JS에서 확인).
4. **재시도 뒤 A301**: 첫 시도 이후 어떤 이유로든 재시도한 요청이 `A301`을 받으면 `DuplicateRequestError`에 `alreadyAccepted = true`와 "이전 시도가 이미 접수됨" 안내를 붙입니다(연결 오류뿐 아니라 5xx·429 뒤 재시도도 포함).
   **수신자별 A301**(2026-09-28 sandbox 확인): 같은 `idempotencyKey`로 다시 보낸 발송은 요청 전체 오류가 아니라 HTTP 200·`data.code` 성공으로 오고, 각 `destinations[].code`가 `A301`입니다. SDK는 이 수신자를 `failed`에 넣지 않고 `duplicates`(같은 키로 이미 접수된 수신자)로 따로 돌려줍니다. `succeeded`에도 넣지 않습니다(이번 요청에서 새로 접수된 것은 아님). `send.bulk` 결과도 청크별 `duplicates`를 합쳐 `duplicates`로 돌려줍니다. 요청 전체가 A301로 오는 경우의 `DuplicateRequestError`는 그대로 둡니다.
5. **경로 값**: `.`과 `..`(인코딩 전 기준)를 거부합니다. 그 밖의 값은 `/`, `?`, `#`, `%`를 포함해 한 세그먼트로 인코딩합니다.
6. **인증 헤더를 빼앗기지 않게**: 사용자 HTTP 클라이언트의 인증 설정(Basic auth 등)과 기본 헤더가 `Authorization`을 바꾸지 못하게 요청마다 명시적으로 설정하고 클라이언트 인증을 끕니다. `baseUrl`의 userinfo(`user:pw@`), query, fragment는 설정 오류입니다. HTTP 라이브러리가 자체 인증 재시도(예: Java `HttpClient.authenticator()`, 401 시 자동 재전송)를 하면 SDK 헤더가 사라지고 **발송이 여러 번 재전송**될 수 있으므로, 그런 클라이언트는 설정 오류로 거부합니다(2026-09-24 Java 검토에서 재현). **일반 원칙**(Java·C#·PHP 검토에서 세 번 재현): SDK가 설정을 점검하거나 안전한 값(리다이렉트 끔, 자체 인증·쿠키·자동 재시도 끔)을 강제할 수 없는 사용자 HTTP 클라이언트는 기본적으로 거부합니다. 꼭 필요하면 사용자가 `trustHttpClient` 같은 옵션으로 명시적으로 허용하게 하고, "리다이렉트·재시도·자체 인증을 하지 않아야 한다"는 위험을 문서화합니다. 프록시·CA 설정처럼 사용자 클라이언트가 필요한 흔한 이유는 SDK 자체 옵션으로 제공합니다.
7. **웹훅 입력 방어**: `X-IB-Timestamp`는 ASCII 숫자 1~16자리만 허용합니다. 본문 JSON 오류·깊은 중첩(최대 깊이 제한)·필드 형태 오류는 모두 `WebhookVerificationError`(또는 그 하위 `WebhookPayloadError`)로 올려 핸들러가 4xx로 답하게 합니다. 웹훅 secret은 공백만 있는 값도 거부하고, `tolerance`는 0보다 큰 유한한 값이거나 명시적 비활성화만 허용합니다.
8. **응답 크기 제한**: 압축 해제 후 16MB를 넘으면 읽기를 멈추고 `InvalidResponseError`. JSON 중첩 깊이는 **64단계**로 제한합니다(응답·웹훅 공통, 모든 언어 동일).
9. **`Retry-After`**: 유한한 0 이상의 숫자만 쓰고(최대 60초), 그 밖의 값은 무시하고 기본 백오프를 씁니다.
10. **예외 직렬화**: `APIError` 계열은 언어의 표준 직렬화(pickle, Serializable 등)로 왕복할 수 있어야 합니다(작업 큐·멀티프로세스).
11. **전화번호 마스킹**: 결과·응답 모델의 `repr`/`toString`에서 전화번호 필드(`to`, `from`, `phoneNumber`, `originator`, `callback` 등)는 가운데를 가립니다(예 `010****0000`). 값 자체(속성 접근)는 그대로입니다. 상담 본문 등 `content`류는 길이만 표시합니다. 요청 파라미터 객체(params/options 구조체)에도 같은 규칙을 적용합니다. 짧은 번호도 가운데 절반 이상을 가립니다(예 8자리 `158****4`처럼 앞 3·뒤 1~4자리만).
12. **문서 정확성**: 사용자 HTTP 클라이언트를 넘기면 그 클라이언트의 TLS 설정이 적용된다는 점을 SECURITY.md에 정확히 적습니다("SDK 자체에는 TLS 검증을 끄는 옵션이 없음"). 리다이렉트를 따르지 않아 실패할 때 오류 메시지에 HTTP 상태를 넣습니다.
13. **타입 안정성(정적 타입 언어·타입 힌트)**: README와 예제 코드가 엄격한 타입 검사(mypy strict / tsc strict 등)를 통과해야 합니다. Optional 결과는 예제에서 처리합니다.
14. **초기 버스트**: 비즈고 서버의 한도 판정은 **토큰 버킷** 방식입니다(2026-09-24 확인). 클라이언트도 같은 방식으로 버킷을 가득 찬 상태로 시작합니다. 서버 버킷의 용량(버스트 크기)은 문서화되지 않았으므로 초당 한도와 같다고 보고, 넘치면 429를 기존 재시도로 처리합니다.
15. **사용자 콜백 격리** (JS 검토에서 확인): 사용자 logger·hooks(동기·비동기)에서 난 예외나 Promise 거부는 SDK가 삼키고(선택적으로 경고 한 번), API 결과·재시도·대량 발송 결과에 영향을 주지 않습니다. 접수된 발송 결과가 콜백 오류 때문에 사라지면 안 됩니다.
16. **API Key 형식**: 생성 시 `^[\x21-\x7e]+$`(공백·제어문자·비ASCII 없음)만 허용합니다. 앞뒤 공백·줄바꿈을 조용히 잘라내지 말고 설정 오류로 알립니다.
17. **리다이렉트는 재시도하지 않습니다**: 3xx는 즉시 `InvalidResponseError`(메시지에 `HTTP <status>`, baseUrl 확인 안내)이며 재시도 대상이 아닙니다.
18. **파일 입력 오류**: 업로드 파일을 읽지 못하면(없음·권한) 언어 기본 예외를 그대로 던지지 않고 SDK의 검증 오류로 올립니다. 메시지에 전체 경로를 넣지 않습니다(파일 이름만).
19. **성공 응답에 null 결과를 돌려주지 않습니다** (Go 검토에서 확인): `data.data`가 없거나 null인 성공 응답도 빈 결과 객체(목록은 빈 배열)를 돌려줘서, 사용자가 null 검사 없이 필드에 접근해도 죽지 않게 합니다. 반환값이 원래 없는 operation(void)만 예외입니다.
20. **멱등성 키 유효시간 기본값** (2026-09-28 sandbox 확인): 서버는 `idempotencyKey`만 있고 `idempotencyTtl`이 없으면 A309로 거절합니다(공개 문서는 TTL을 선택 항목으로 표기). 그래서 SDK는 다음처럼 보냅니다. `idempotencyKey`가 있고 `idempotencyTtl`이 없음 → `idempotencyTtl=86400`을 채움. `idempotencyTtl`을 직접 지정함(0 포함) → 그대로 보냄. `idempotencyKey` 없이 `idempotencyTtl`만 지정함 → 받은 그대로 보냄(SDK가 추가·삭제하지 않음). 키가 없으면 TTL을 추가하지 않습니다. 적용 범위: 직접 만든 발송 메서드(`send.omni`/`sms`/`lms`/`mms` 등), `send.bulk`의 청크(`idempotencyKeyPrefix`), 본문 스키마에 두 필드가 모두 있는 생성 operation(raw dict/map 본문 포함, 사용자 객체는 바꾸지 않음). 기본값은 언어별 상수 하나(`DEFAULT_IDEMPOTENCY_TTL = 86400` 등)로 공개하고 README·docstring에 "idempotencyKey가 있으면 기본 86400"을 적습니다. 테스트: 키만 → 86400, TTL 지정(0 포함) 유지, 키 없음 → TTL 없음, bulk 청크, raw 본문 비변경.
