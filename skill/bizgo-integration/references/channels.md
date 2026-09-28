# Channels

All channels go through `POST /api/comm/v1/send/omni`. The `messageFlow` item key selects the channel.

| Channel | `messageFlow` key | Pre-registration (console) | Required fields | Limits |
|---|---|---|---|---|
| SMS | `sms` | sender number | `from`, `text` | text ≤ 90 bytes EUC-KR, no title |
| LMS | `mms` (no `fileKey`) | sender number | `from`, `text` | text ≤ 2,000 bytes EUC-KR, optional `title` |
| MMS | `mms` + `fileKey` | sender number | `from`, `text`, `fileKey[]` | ≤ 3 images, jpg ≤ 300KB each (upload `/file/mms` first) |
| International | `international` | sender | `from`, `text` | text ≤ 1,000 chars UTF-8; `to` = country code + number without `+` (e.g. `821000000000`); no `title`/`fileKey` |
| RCS | `rcs` | RCS brand | `from`, `formatId`, `brandKey`, `body` | media from `/file/rcs`; see spec for buttons/suggestions |
| Kakao AlimTalk | `alimtalk` | sender profile key + **approved template** | `senderKey`, `templateCode`, and `msgType` (`AT` text / `AI` image) + `text` unless `sendType: "template"` | text ≤ 1,300 chars and must match the template |
| Kakao BrandMessage | `brandmessage` | sender profile, brand message permission | `sendType` (`basic` / `template` / `free`), `senderKey`; `templateCode`+`targeting` for basic/template; `msgType` for basic/free | advertising rules apply; `msgType` FT/FI/FW/FL/FP/FM/FC/FA/FG |
| Naver TalkTalk | `navertalk` | partner key + template | `partnerKey`, `templateCode`, `productCode` | recipient must be an 11-digit mobile number |

Common request fields: `destinations[]` (≤ 200, each `to`, optional `replaceWords`, `ref`), `ref`, `groupKey` (statistics grouping), `paymentCode`, `idempotencyKey` (≤ 200 chars), `idempotencyTtl` (0–86400 s; required whenever `idempotencyKey` is sent — A309 otherwise; SDKs default it to 86400).

## Substitution

Put `#{key}` in `text`/`title` and give values per recipient in `destinations[].replaceWords`. Length limits apply to the text **after** substitution, so leave headroom for long names or values.

## Fallback design

- Order from richest/cheapest-per-engagement to most universal: e.g. `alimtalk → sms`, `alimtalk → rcs → mms(LMS)`.
- The fallback text must satisfy its own channel's limits. AlimTalk allows 1,300 chars; if the body is longer than ~45 Korean characters use an LMS (`mms` without `fileKey`) as fallback, not SMS.
- AlimTalk bodies must equal the approved template (with variables filled). A fallback SMS/LMS can be phrased freely but should carry the same information.
- Status lookups return one entry per channel attempted; the `fallback` field (`Y`/`N`) shows whether a fallback happened.

## When to use which

- OTP / verification codes: SMS (fast, universal). AlimTalk authentication templates are an option if the business has them.
- Transactional notices (order, shipping, payment): AlimTalk with SMS/LMS fallback.
- Marketing to channel friends: BrandMessage (advertising rules: `(광고)` marking, opt-out, night-time limits).
- Rich cards with buttons on Android: RCS with LMS fallback.
- Overseas recipients: International — domestic channels don't reach foreign numbers.

Kakao sender profiles, templates, RCS brands and reservations have their own management APIs (see the API reference); the SDKs cover sending, uploads, reports and lookups first.
