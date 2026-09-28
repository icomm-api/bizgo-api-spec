# 기여 가이드

1. 스펙 수정 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다(사람·AI 공통).
2. 변경 전후로 `npm run check`를 실행합니다. `dist/openapi.yaml`은 `npm run bundle`로만 갱신합니다.
3. `pre-commit install`로 gitleaks 훅을 켭니다.
4. 비즈고 공식 문서와 다른 점을 발견하면 근거 URL과 함께 GitHub Issues에 알려 주세요.
5. PR에는 실제 API 응답을 붙이지 마세요. 필요하면 값을 모두 placeholder로 바꿉니다.
