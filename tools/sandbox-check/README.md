# sandbox-check

비즈고 문서끼리 서로 다른 항목을 **sandbox**에서 직접 확인하는 스크립트입니다. Python 3.9 이상, 표준 라이브러리만 씁니다.

| 스크립트 | 확인하는 것 | 필요한 환경변수 |
|---|---|---|
| `check_auth.py` | `Authorization` 헤더 형식(접두어 없음 / `ApiKey` / `Bearer`), 잘못된 키의 응답 코드, 발송 이력 조회의 페이지네이션 필드, rate-limit 응답 헤더, SDK 식별 헤더(`User-Agent`, `X-Bizgo-Client`) 허용 여부 | `BIZGO_API_KEY` |
| `webhook_probe.py` | 웹훅 서명 출력 인코딩(hex/base64), timestamp 단위, 헤더·본문 필드 이름 | `BIZGO_WEBHOOK_SECRET` |

## 안전 장치

- 접속 대상은 `https://sandbox-mars.ibapi.kr`로 고정되어 있습니다. 운영 서버는 호출하지 않습니다.
- 조회 API만 호출합니다. 메시지를 발송하지 않습니다.
- 키·secret·헤더 값·응답 본문 값(전화번호 등)은 출력하지 않습니다. **결과 코드와 필드 이름만** 출력하므로 결과를 이슈나 채팅에 붙여도 됩니다.
- TLS 인증서 검증을 끄는 옵션은 없습니다.

## 실행

```bash
# bash
read -rs BIZGO_API_KEY && export BIZGO_API_KEY   # 입력값이 화면·히스토리에 남지 않음
python tools/sandbox-check/check_auth.py
```

```powershell
# PowerShell 7.1+
$env:BIZGO_API_KEY = Read-Host -MaskInput "API Key"

# Windows PowerShell 5.1
$s = Read-Host -AsSecureString "API Key"
$env:BIZGO_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))

python tools/sandbox-check/check_auth.py
Remove-Item Env:BIZGO_API_KEY   # 확인 후 세션에서 제거
```

웹훅 확인은 등록된 웹훅 URL(HTTPS)이 이 스크립트로 전달되도록 설정한 뒤 sandbox에서 메시지를 한 건 보내 확인합니다.

```bash
read -rs BIZGO_WEBHOOK_SECRET && export BIZGO_WEBHOOK_SECRET
python tools/sandbox-check/webhook_probe.py --port 8080
```

오프라인 테스트(키 불필요):

```bash
python -m unittest discover -s tools/sandbox-check -p "test_*.py" -v
```
