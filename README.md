# bizgo-api-spec

[비즈고(Bizgo)](https://bizgo.io) 커뮤니케이션 API의 **OpenAPI 3.1 스펙**입니다.
비즈고 SDK([Python](https://github.com/icomm-api/bizgo-sdk-comm-python) · [Java](https://github.com/icomm-api/bizgo-sdk-comm-java) · [JavaScript](https://github.com/icomm-api/bizgo-sdk-comm-js) · [Go](https://github.com/icomm-api/bizgo-sdk-comm-go) · [C#](https://github.com/icomm-api/bizgo-sdk-comm-cs) · [PHP](https://github.com/icomm-api/bizgo-sdk-comm-php))는 이 스펙을 기준으로 만들어집니다.

> 원문은 [비즈고 개발자센터 API 레퍼런스](https://developers.bizgo.io/api-sdk/api-reference)입니다. 이 스펙과 원문이 다르면 원문을 따르고 Issue로 알려 주세요.

## 바로 쓰기

단일 파일 스펙: [`dist/openapi.yaml`](dist/openapi.yaml)

```bash
# 문서 미리보기
npx @redocly/cli preview-docs dist/openapi.yaml
```

## 범위 (v0.2)

커뮤니케이션 API 전체 **146개 operation + 웹훅 9종**을 담고 있습니다(2FA·소셜로그인 등 `/api/verify` 제외).

| 영역 | 내용 |
|---|---|
| 발송 | `POST /api/comm/v1/send/omni` — SMS/LMS/MMS, 국제, RCS, 알림톡, 브랜드메시지, 네이버 톡톡, 대체발송 |
| 예약 | 예약 등록·조회·수정·취소·중지·재개, 예약 수신자 관리 |
| 파일 | MMS, RCS, 알림톡 템플릿, 브랜드메시지(이미지·카탈로그) 업로드 |
| 리포트·조회 | 리포트 Polling/Inquiry, 메시지 상태·이력·통계, MO 이력 |
| 인사이트 | 알림톡·브랜드메시지·RCS 인사이트 |
| 카카오 공통 | 발신프로필 등록·조회·휴면 해제, 카테고리, 그룹, 제재 조회 |
| 알림톡 | 템플릿 등록·수정·삭제·검수 요청, 카테고리 |
| 브랜드메시지 | 동보 발송, 발송 대상 확인, 발송 권한, 템플릿, 그룹 태그, 친구 그룹, 동영상 |
| RCS | 브랜드, 챗봇, 템플릿(messagebase)·양식, 템플릿 이미지 |
| 상담톡 | 메시지 발송, 세션, 사용자 차단, 채널 설정, 상담 시간, 시스템 메시지 |
| 웹훅 | 리포트, MO, 상담톡 7종 |

모든 operation에는 SDK 생성용 메타데이터(`x-sdk-resource`, `x-sdk-method`, `x-sdk-retry`, `x-sdk-pagination`)가 있어 각 언어 SDK가 메서드를 자동 생성합니다. 규칙은 [AGENTS.md](AGENTS.md), 언어 공통 설계는 [docs/SDK-DESIGN.md](docs/SDK-DESIGN.md)에 있습니다.

에러코드 전체 목록은 [`data/error-codes.json`](data/error-codes.json)에 있습니다(게이트웨이/개별부/리포트 코드).

## AI 코딩 도구용 Skill

[`skill/bizgo-integration/`](skill/bizgo-integration/SKILL.md)은 Claude가 비즈고 연동 코드를 정확하고 안전하게 작성하도록 돕는 [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)입니다.
채널 선택, 대체발송 설계, 멱등성, 리포트·웹훅 처리, 에러코드, 보안 체크리스트를 담고 있습니다.

```bash
# Claude Code: 프로젝트에 설치
mkdir -p .claude/skills && cp -r skill/bizgo-integration .claude/skills/
```

## 스펙 확장 필드

| 필드 | 뜻 |
|---|---|
| `x-max-bytes` | 바이트 기준 길이 제한 (예: SMS 본문 90byte) |
| `x-charset` | 허용 문자 집합 (예: `EUC-KR`) |
| `x-format` | 날짜·시각 문자열 형식 (예: `yyyy-MM-dd'T'HH:mm:ssXXX`) |
| `x-known-values` | 알려진 값 목록 (늘어날 수 있어 `enum`으로 고정하지 않음) |
| `x-unverified` | 원문끼리 다르거나 불명확한 부분 (스펙에서 `x-unverified`로 검색) |
| `x-verified` | sandbox에서 직접 확인한 내용과 날짜 |
| `x-source` | 원문 URL |
| `x-sdk-*` | SDK 생성용 메타데이터(리소스·메서드 이름, 재시도 정책, 페이지 방식) |

## 개발

```bash
npm ci
npm run lint     # 스펙 검사
npm run bundle   # dist/openapi.yaml 갱신
npm run check    # CI와 같은 검사
```

작성 규칙은 [AGENTS.md](AGENTS.md), 기여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.
문서끼리 다른 부분은 [tools/sandbox-check](tools/sandbox-check)로 sandbox에서 확인합니다.

## 보안

API Key와 웹훅 secret은 저장소에 두지 않습니다. 취약점 신고와 키 노출 대응은 [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스

[Apache-2.0](LICENSE)
