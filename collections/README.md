# API 테스트 컬렉션 (Postman · Bruno)

비즈고 커뮤니케이션 API를 바로 호출해 볼 수 있는 컬렉션입니다. [`dist/openapi.yaml`](../dist/openapi.yaml)의 모든 operation(146개)이 요청으로 들어 있고(총 171개), 태그 → SDK 리소스(`x-sdk-resource`) 폴더로 나뉘어 있습니다.

| 도구 | 파일 |
|---|---|
| Postman | [`postman/bizgo-api.postman_collection.json`](postman/bizgo-api.postman_collection.json) (Collection v2.1), 환경 [`bizgo-sandbox`](postman/bizgo-sandbox.postman_environment.json) · [`bizgo-production`](postman/bizgo-production.postman_environment.json) |
| Bruno | [`bruno/`](bruno/) 폴더 전체, 환경 `environments/sandbox.bru` · `production.bru` |

> **생성 파일입니다. 직접 수정하지 마세요.** 스펙(`openapi/`)을 고친 뒤 `npm run bundle && npm run collections`로 다시 만듭니다. CI(`npm run collections:check`)가 스펙과 다르면 실패합니다.

## 가져오기

**Postman**: `Import` → 파일 선택(위 JSON 3개) 또는 `Link`에 raw URL을 넣습니다.

```
https://raw.githubusercontent.com/icomm-api/bizgo-api-spec/main/collections/postman/bizgo-api.postman_collection.json
```

**Bruno**: `Open Collection` → 이 저장소의 `collections/bruno` 폴더를 고릅니다. 오른쪽 위 환경 선택에서 `sandbox`를 고릅니다.

## API Key 설정 (안전하게)

모든 파일의 `apiKey` 값은 **비어 있습니다.** 키를 파일에 써서 커밋하거나 공유하지 마세요. 요청에는 컬렉션 수준에서 `Authorization: {{apiKey}}` 헤더가 붙습니다(접두어 없이 키 그대로, `Bearer` 금지).

- **Postman**: 환경(또는 컬렉션 변수)의 `apiKey`에 **Current value에만** 키를 넣습니다. Current value는 로컬에만 저장되고 동기화·공유되지 않습니다. Initial value는 비워 둡니다. Postman Vault(`{{vault:...}}`)를 써도 됩니다.
- **Bruno**: 환경 파일은 `apiKey: {{process.env.BIZGO_API_KEY}}`로 환경변수를 읽습니다. `bruno/.env.example`을 `bruno/.env`로 복사해 `BIZGO_API_KEY=`에 키를 넣거나, Bruno를 실행하는 셸에 `BIZGO_API_KEY` 환경변수를 설정합니다. `.env`는 `.gitignore` 대상이므로 커밋되지 않습니다.

API Key는 콘솔에 허용 IP로 등록한 서버에서만 동작합니다.

## 환경

- 기본값은 **sandbox**(`https://sandbox-mars.ibapi.kr`)입니다. 실제로 발송되지 않습니다. 운영과 같은 API Key를 씁니다.
- 운영(`https://mars.ibapi.kr`)은 `production` 환경을 고를 때만 씁니다. 발송 요청은 실제로 발송되고 비용이 듭니다.

## 요청 값

- 본문·파라미터에는 스펙 예시의 placeholder만 들어 있습니다(`01000000000`, `SENDER_KEY_EXAMPLE`, `TEMPLATE_CODE_EXAMPLE` 등). 실제 값으로 바꿔서 보내세요.
- 선택 쿼리 파라미터·multipart 필드는 꺼진(disabled) 상태로 들어 있습니다. 파일 업로드는 파일 필드에 파일을 직접 고릅니다(Bruno의 `PATH_TO_FILE`은 자리표시자).
- 멱등성 키 필드(선택)는 샘플에 넣지 않았습니다. 필요하면 스펙의 `SendOmniRequest` 설명을 참고하세요.
- 스펙에 예시가 여러 개인 operation은 operation 이름의 하위 폴더에 **예시마다 요청이 하나씩** 있습니다. 예시는 `npm run lint`(스키마)와 `npm run examples`(조건부 필수 `x-sdk-required-if`)로 검사됩니다.

## 채널별 발송 예시

`Send/send/통합 발송`(`POST /api/comm/v1/send/omni`) 폴더에 채널별 요청 20개가 있습니다.

| 채널 | 요청 |
|---|---|
| 문자 | SMS (단문), LMS (장문), MMS (이미지+장문, `fileKey`는 이미지 업로드로 받은 값) |
| 국제 | 국제메시지 (수신번호는 E.164에서 `+`를 뺀 숫자) |
| RCS | 통합 RCS, 이미지·버튼, 안드로이드 RCS(광고 표시 + 수신거부 번호) |
| 알림톡 | 전문 발송(`msgType: AT` + 버튼), 템플릿 자동 치환 발송(`sendType: template` + `replaceWords`), 이미지형(`AI`) |
| 브랜드메시지 | 기본형, 기본형 템플릿 자동 치환, 자유형 텍스트·이미지·와이드 이미지·캐러셀 피드 |
| 네이버 톡톡 | 스마트알림 |
| 공통 | 대체발송(알림톡 → SMS, RCS → LMS), 동보 발송(수신자별 치환) |

`Reservation/reservations/예약 발송 등록` 폴더에는 SMS(실패 시 MMS)·국제·통합 RCS·알림톡·브랜드메시지(기본형·자유형) 예약 요청 6개가 있습니다.

## 웹훅

웹훅(리포트, MO, 상담톡)은 비즈고가 고객 서버로 보내는 요청이라 컬렉션에 없습니다. 형식은 스펙의 `webhooks:`를 참고하세요.
