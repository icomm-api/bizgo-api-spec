# AGENTS.md — bizgo-api-spec

이 파일은 AI 코딩 도구(Claude Code, Copilot, Cursor 등)와 기여자가 이 저장소를 수정할 때 따라야 하는 규칙입니다.

## 저장소 목적

비즈고(Bizgo) 커뮤니케이션 API의 **OpenAPI 3.1 스펙**을 관리합니다. 스펙은 [developers.bizgo.io](https://developers.bizgo.io/api-sdk/api-reference)의 공개 문서를 옮긴 것이며, 각 언어 SDK(`bizgo-sdk-comm-python`, `-java`, `-js`)가 이 스펙을 기준으로 모델과 테스트를 만듭니다.

## 명령

```bash
npm ci                 # 도구 설치 (@redocly/cli, 버전 고정)
npm run lint           # 스펙 검사 (CI 필수)
npm run bundle         # dist/openapi.yaml 생성 (단일 파일)
npm run examples       # 요청 본문 예시가 x-sdk-required-if 규칙을 지키는지 검사 (스키마 검사는 lint가 함)
npm run collections    # dist/openapi.yaml → collections/ (Postman·Bruno) 다시 생성
npm run check          # lint + examples + bundle 결과가 커밋된 dist와 같은지, collections/가 최신인지 확인
```

## 디렉터리 구조

```
openapi/
  openapi.yaml                      # 루트: info, servers, security, paths/webhooks/components 목록
  paths/<경로>.yaml                  # 경로 1개 = 파일 1개. "/" → "_", 예: api_comm_v1_report_polling_{reportId}.yaml
  webhooks/<이름>.yaml               # 비즈고 → 고객 서버로 오는 웹훅
  components/schemas/<Name>.yaml     # 스키마 1개 = 파일 1개, 파일명 = 스키마명(PascalCase)
  components/parameters|responses|headers|securitySchemes/<Name>.yaml
dist/openapi.yaml                   # 번들 결과 (직접 수정 금지)
tools/sandbox-check/                # 미확인 항목을 sandbox에서 검증하는 스크립트 (표준 라이브러리만 사용)
tools/examples/validate.mjs         # 요청 본문 예시의 x-sdk-required-if 검사기 (Node 표준 라이브러리 + 고정된 @redocly/cli)
tools/collections/generate.mjs      # Postman·Bruno 컬렉션 생성기 (Node 표준 라이브러리 + 고정된 @redocly/cli)
collections/                        # 생성된 API 테스트 컬렉션 (직접 수정 금지, apiKey 값은 항상 비움)
```

## 스펙 작성 규칙

1. **공개 문서에 있는 내용만 씁니다.** 추측으로 필드·제약·enum을 만들지 않습니다. 문서끼리 다르거나 불명확하면 `x-unverified: "<무엇이 불확실한지>"`를 답니다. sandbox에서 확인한 내용은 `x-verified: "<날짜> sandbox: <결과>"`로 남기고, 이때는 문서보다 확인 결과를 우선합니다. 확인 결과에는 코드와 필드 이름만 쓰고 응답 값은 쓰지 않습니다.
2. 모든 operation에 `operationId`(camelCase, 예: `sendOmni`, `getReportPolling`), `summary`, `description`, `tags`, `x-source`(원문 URL)를 둡니다.
3. 모든 property에 `type`과 한국어 `description`을 씁니다. 필수 필드는 `required`에 넣습니다.
4. 문서에 고정값 목록이 있으면 `enum`을 씁니다. 목록이 더 늘 수 있는 코드값은 `enum` 대신 `description`에 알려진 값을 나열하고 `x-known-values`로 둡니다.
5. 길이 제약:
   - 글자 수 제한은 `maxLength`.
   - **바이트 제한**(SMS 90byte 등)은 JSON Schema로 표현할 수 없으므로 `x-max-bytes: <정수>`와 `x-charset: EUC-KR`(해당 시)을 쓰고 description에도 적습니다.
   - 배열 개수는 `maxItems`/`minItems`.
6. 날짜·시각 문자열은 `type: string` + 문서의 형식을 `description`과 `x-format`(예: `yyyy-MM-dd'T'HH:mm:ssXXX`, `YYYYMMDD`)에 적습니다. `format: date-time`은 ISO 8601이 명확할 때만 씁니다.
7. 응답은 항상 봉투 구조입니다: `{ common: CommonResult, data: { code, result, data?, ref? } }`. 새 응답은 두 스키마로 만듭니다(예시: `SendOmniResponse.yaml`, `SendOmniServiceResult.yaml`).
   - `<Op>Response`: `common`(→ `CommonResult`) + `data`(→ `<Op>ServiceResult`)
   - `<Op>ServiceResult`: `allOf: [ServiceResult, { properties: { data: <실제 데이터 스키마> } }]`
   - 개별 데이터가 없는 응답(예: 수신 확인 DELETE)은 `ApiResponse`를 그대로 씁니다.
8. 발송 채널 스키마 이름 규칙: `<Channel>Message`(채널 객체 본문), `<Channel>FlowItem`(`{ <key>: <Channel>Message }` 래퍼). 하위 객체는 `<Channel><Thing>`(예: `RcsButton`, `AlimtalkButton`).
9. `$ref`는 **상대 경로 파일 참조**만 씁니다(예: `./RcsButton.yaml`, `../components/schemas/ApiResponse.yaml`). JSON pointer로 다른 파일 내부를 가리키지 않습니다.
10. YAML 들여쓰기 2칸, 문자열에 `:`·`#`·`{`가 있으면 따옴표를 씁니다.
11. **SDK 생성용 메타데이터**: 모든 operation에 다음 확장 필드를 둡니다. 각 언어 SDK는 이 값으로 리소스 메서드를 생성합니다.
    - `x-sdk-resource`: 점으로 구분한 리소스 경로(camelCase). 예: `send`, `reservations`, `reservations.recipients`, `kakao.senders`, `alimtalk.templates`, `brandMessage.groupSends`, `rcs.templates`, `insights.alimtalk`, `counsel.chats`.
    - `x-sdk-method`: 리소스 안의 메서드 이름(camelCase 동사). 관례: `list`, `get`, `create`, `update`, `delete`, `cancel`, `pause`, `resume`, 그 밖의 동작은 짧은 동사구(`requestToken`, `recover`, `checkPermission`). 같은 리소스 안에서 겹치지 않아야 합니다.
    - `x-sdk-retry`: `safe`(GET, 같은 결과를 내는 PUT/DELETE — 429·5xx·네트워크 오류 재시도) 또는 `rate_limit_only`(생성·발송처럼 두 번 실행되면 안 되는 요청 — 429만 재시도).
    - `x-sdk-pagination`(목록 조회만): `{ style: cursor, request: lastSeq, response: data.data.lastSeq, hasNext: data.data.hasNext, items: data.data.<배열> }` , `{ style: page, request: <페이지 파라미터>, size: <크기 파라미터>, items: ..., total: ... }` 또는 `{ style: offset, request: <offset 파라미터>, size: <limit 파라미터>, items: ..., total?: ... }`처럼 문서에 있는 방식 그대로 적습니다. 문서에 없으면 넣지 않습니다.
    - `x-sdk-rate`(선택): `send`면 발송 API입니다. 클라이언트 속도 제한에서 **send 버킷(초당 200 메시지, 비용 = 수신자 수)**을 씁니다. 없으면 other 버킷(초당 5 요청)입니다. 발송 여부는 제품 기준(2026-09-24 확인)으로 정하며, 현재 `sendOmni`, `createReservation`, `addReservationRecipients`, `createBrandMessageGroupSend`, `sendCounselPlain`, `sendCounselRich`입니다.
    - `x-sdk-result`(선택): 응답에서 SDK가 돌려줄 부분의 경로. 기본값 `data.data`.
    - 웹훅(`webhooks:`)은 `x-sdk-webhook: <이름>`(예: `report`, `mo`, `counselMessage`)을 둡니다.
    - `x-sdk-required-if`(**스키마**에 둠, 선택): 다른 필드 값에 따라 필수가 되는 필드(발송 방식·타입별 필수). 문서가 조건과 필드를 분명히 적은 경우에만 넣고, 조건이 모호하면 `description`에만 적습니다. `description`에도 같은 조건을 적어 둘이 어긋나지 않게 합니다. 형식은 규칙 목록이며 규칙은 모두 따로 적용됩니다(AND).
      ```yaml
      x-sdk-required-if:
        - when: { field: sendType, notEquals: template }    # 이 객체의 속성 1개 + 연산자 1개
          required: [msgType, text]                          # 이 객체의 속성 이름
        - when: { field: sendType, equals: template }
          requiredPaths: ["$.destinations[].replaceWords"]   # 경로
      ```
      - `when.field`: 규칙이 붙은 객체의 속성 이름(점 경로 아님). 연산자는 `equals`, `notEquals`(값 1개), `in`, `notIn`(값 목록) 중 정확히 하나. 값은 문자열로 비교합니다. 필드가 없거나 null이면 `equals`·`in`은 거짓, `notEquals`·`notIn`은 참입니다.
      - `required`: 이 객체의 속성 이름 목록. `requiredPaths`: `.`으로 이은 경로 목록. `$.`로 시작하면 요청 본문 루트 기준, 아니면 이 객체 기준입니다. `name[]`은 배열의 모든 원소를 뜻하며, 배열이 없거나 비어 있으면 검사할 원소가 없습니다(배열 자체의 필수 여부는 `required`로 따로 정함). 중간 객체가 없으면 그 경로는 빠진 것으로 봅니다. `$.` 경로의 첫 속성이 요청 본문 스키마에 없으면(예: 수신자 추가 API) 그 항목은 검사하지 않습니다.
      - "있음"의 기준은 일반 `required`와 같습니다(키가 있고 null이 아님).
      - 한 규칙에 `required`와 `requiredPaths` 중 하나 이상이 있어야 합니다. 새 키나 연산자가 필요하면 이 규칙과 SDK-DESIGN §4를 함께 고칩니다.
    - 웹훅 서명 헤더(`WebhookTimestampHeader`/`WebhookSignatureHeader`)는 리포트·MO 웹훅에만 둡니다. 상담톡 웹훅(`counsel*`)에는 서명이 없으므로 서명 헤더 파라미터를 두지 않습니다(비즈고 확인, 2026-09-28). SDK는 서명 헤더가 정의된 웹훅만 검증합니다.
12. 영역별 스키마 이름 접두어: `Reservation*`, `KakaoSender*`/`KakaoGroup*`/`KakaoCategory*`, `AlimtalkTemplate*`, `BrandMessageTemplate*`/`BrandMessageGroupSend*`, `RcsBrand*`/`RcsTemplate*`/`RcsMessagebase*`, `Insight*`, `Counsel*`. 기존 스키마 이름과 겹치면 안 되며, 이미 있는 스키마는 재사용합니다(수정이 필요하면 따로 알립니다).

## 보안 규칙 (오픈소스 저장소)

- **실제 값 금지**: API Key, 웹훅 secret, 실제 전화번호, 실제 발신프로필 키·브랜드 ID·템플릿 코드, 사내 호스트명/IP, 개인 이메일을 커밋하지 않습니다.
- 예시 값은 문서의 placeholder만 씁니다: 전화번호 `01000000000`, 키 `{ApiKey}`, `SENDER_KEY_EXAMPLE`, `FILE_KEY_001` 등.
- 비즈고 공개 문서에 게시된 서버 IP(방화벽 안내용)는 공개 정보이므로 문서 링크로만 안내하고 스펙에 복사하지 않습니다.
- 인증 정보는 환경변수(`BIZGO_API_KEY`, `BIZGO_WEBHOOK_SECRET`)로만 읽습니다. 스크립트는 키·secret·응답 본문(수신번호 포함 가능)을 출력하거나 파일에 저장하지 않습니다.
- 커밋 전 `gitleaks`가 pre-commit과 CI에서 실행됩니다. 우회(`--no-verify`)하지 않습니다.
- 새 의존성은 버전을 고정하고 lockfile을 커밋합니다. `tools/`는 표준 라이브러리만 씁니다.
