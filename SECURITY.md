# 보안 정책

## 취약점 신고

보안 취약점은 **공개 Issue로 올리지 마세요.** GitHub의 [Private vulnerability reporting](../../security/advisories/new)으로 비공개 신고해 주세요.
확인 후 영업일 기준 5일 안에 답변합니다.

## 자격 증명이 노출됐을 때

API Key나 웹훅 secret이 커밋·Issue·로그 등에 노출됐다면:

1. 즉시 비즈고 콘솔 `발송관리 > 연동관리`에서 해당 키를 폐기하고 새로 발급합니다. (저장소 기록에서 지워도 이미 복제됐을 수 있으므로 **폐기가 먼저**입니다.)
2. 웹훅 secret은 비즈고에 재발급을 요청합니다.
3. 허용 IP(ACL) 목록을 점검합니다.

## 이 저장소의 보안 원칙

- 실제 API Key, secret, 전화번호, 발신프로필 키 등은 저장소에 두지 않습니다. 예시는 placeholder만 씁니다.
- 모든 커밋과 PR은 [gitleaks](https://github.com/gitleaks/gitleaks)로 검사합니다(`.gitleaks.toml`).
- `tools/`의 스크립트는 표준 라이브러리만 쓰고, 키·secret·응답 본문을 출력하거나 저장하지 않습니다.
- CI는 읽기 권한만 가지며 저장소 secret을 쓰지 않습니다.
