# 이식 가이드 — jhtechsmart의 통합 메일 + Notion sync 기능

> 대상 독자: 다른 프로젝트에서 같은 패턴을 적용하려는 개발자 / Claude Code
> 참고 reference 경로: `/Users/seonjecho/Projects/jhtechsmart`
> 핵심 파일: `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`, `/Users/seonjecho/Projects/jhtechsmart/appscript/mailer/Code.gs`, `/Users/seonjecho/Projects/jhtechsmart/admin.html`

---

## 어디서 무엇을 가져갈 수 있나 (한 줄 요약)

| 패턴 | 줄 위치 (Code.gs) | 핵심 함수 |
|---|---|---|
| 통합 마스터 시트 (멱등 upsert) | 41~260 | `UNIFIED_HEADERS`, `_getUnifiedSheet`, `upsertUnified`, `backfillUnified` |
| 이메일 템플릿 로드 + 5 PART 본문 치환 + Drive 저장 | 339~470 | `loadEmailTemplate`, `parseGuideScript`, `mergeGuideTemplate`, `saveGuideHtmlToDrive` |
| OpenAI gpt-4o-mini 호출 + 응답 검증 | 480~525 | `callOpenAI`, `GUIDE_SYSTEM_PROMPT` |
| 5분 polling + LockService + cooldown | 612~680 | `setupTriggers`, `pollAndSendGuides` |
| 별도 Mailer Web App (계정 분리 발송) | `mailer/Code.gs` 전체 | `doPost`, `_resolveAttachments` |
| Notion DB 단방향 push (upsert + Title 매칭) | 815~1000 | `_notionFetch`, `_toNotionValue`, `pushToNotion`, `ensureNotionSchema` |
| Notion ↔ 시트 양방향 sync (hash 무한루프 차단) | 1063~1260 | `BIDIRECTIONAL_FIELDS`, `syncFromNotion`, `_applyNotionPageToSheet`, `_calcBidirectionalHash` |
| admin 즉시 발송 + 인라인 수정 (토큰 인증) | 1778~1900 (GAS), admin.html 1733~1819 (JS) | `handleUpdateRequest`, `handleResendGuide`, `resendGuideNow` |

각 패턴은 독립적이라 필요한 것만 골라서 가져올 수 있습니다.

---

## 핵심 컴포넌트 5개

### 1. 통합 마스터 시트 (Unified Master Sheet)

**무엇?** 여러 입력 소스(신청·견적 등)를 한 시트로 합쳐 외부 시스템(Notion 등)과 1:1 매칭 가능한 마스터 데이터 만드는 패턴.

**왜?** 신청관리·견적관리·기타 시트가 각자 있으면 외부 동기화 시 어떤 키로 매칭할지 복잡. 마스터 시트 한 곳이 모든 정보 + 메타(노션 page ID, push 시각, hash 등)를 가지면 단순.

**핵심 코드** (`/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`):
- `UNIFIED_HEADERS` (line 44~59): 컬럼 정의 배열. 신청 그룹 + 견적 그룹 + 가이드/메일 그룹 + sync 메타 그룹
- `_getUnifiedSheet` (line 76~94): 시트 자동 생성 + 헤더 누락 보강 (멱등)
- `upsertUnified(reqId, requestData, quoteData)` (line 106~205): 키로 행 찾기 → INSERT or UPDATE
  - 빈 값으로 덮어쓰지 않음 (수정 보호)
  - 버전 비교 — 같거나 큰 버전만 견적 컬럼 overwrite

**⚠ 함정**:
- 헤더 보강 로직은 "끝에 append"만 안전 — 신규 컬럼은 항상 `UNIFIED_HEADERS` 배열 **끝에** 추가. 중간 삽입하면 기존 시트와 위치 불일치 발생
- `setValues` 직후 즉시 read하려면 `SpreadsheetApp.flush()` 호출 필요

**이식 시 변경할 부분**:
- 컬럼 이름·개수 (도메인 따라)
- 매칭 키 (jhtechsmart는 `접수번호`, 다른 프로젝트는 `주문번호`·`사용자ID` 등)
- `upsertUnified`의 필드 매핑 객체 (`reqMap`, `qMap`)

---

### 2. OpenAI 5 PART 가이드 생성

**무엇?** GPT API로 5개 섹션 markdown 응답을 받아 HTML 템플릿의 5개 마커 위치에 각각 치환하는 패턴.

**왜?** 한 번의 API 호출로 여러 영역 콘텐츠를 일관성 있게 만들 수 있음. 형식 강제(시스템 프롬프트)와 응답 파싱(split)을 결합.

**핵심 코드** (`/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`):
- `GUIDE_SYSTEM_PROMPT` (line 460~488): 5 PART markdown 형식 강제 + 필수 문구 + 금지 사항
- `callOpenAI(promptInput)` (line 495~525):
  - `max_tokens: 2500` 명시 필수 (미명시 시 PART 2~3에서 truncation)
  - `finish_reason !== 'stop'`이면 명시적 에러
- `parseGuideScript(rawMarkdown)` (line 371~390): split + capture group으로 5 PART 추출
  - JavaScript는 `\Z` 미지원이라 lookahead 패턴 안 됨 — split 방식이 안전
- `mergeGuideTemplate(templateHtml, parts5)` (line 401~430): 마커 다음 가장 가까운 특정 패턴 div의 내부 content 교체
  - 마커 형식: `<!-- 1. xxx --> ... <div style="background-color:#f9f5ed; ...">본문</div>`
  - style 보존 (PART별 다른 색 유지 가능)

**⚠ 함정**:
- `max_tokens` 미명시 시 응답 truncation
- `parseGuideScript`의 정규식은 capture group split — `\Z`/`$` 같은 anchor 쓰면 다른 PART 못 잡을 수 있음
- 마커 패턴이 본문 안에 우연히 들어가면 잘못 split — 마커를 충분히 독특하게 (`<!-- PART N -->` 보다 `<!-- N. 자기소개 -->` 같은 형식 권장)

**이식 시 변경할 부분**:
- `GUIDE_SYSTEM_PROMPT` 전체 (도메인별 콘텐츠)
- 마커 패턴 (현재 `<!-- N. 제목 -->`)
- 본문 영역 식별자 (현재 `background-color:#f9f5ed` div)
- PART 수 (5개 → 임의 N개로 변경 시 loop 인덱스 조정)

---

### 3. 5분 polling + 별도 Mailer Web App

**무엇?** Google Apps Script의 Time-driven trigger로 5분마다 폴링 + 다른 계정의 Web App을 HTTP로 호출해 그 계정의 ID로 메일 발송.

**왜?** `MailApp.sendEmail`은 스크립트 소유자 계정으로 발송됨. 메인 서비스 계정 ≠ 발송 계정인 경우 별도 GAS 프로젝트로 분리해야 함.

**핵심 코드** (`/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`):
- `setupTriggers()` (line 620~635): 멱등 trigger 등록 — 기존 동일 함수 trigger 모두 삭제 + 새로 생성
- `pollAndSendGuides()` (line 640~672):
  - `LockService` 동시 실행 방지
  - `MAIL_POLL_MAX_PER_TICK = 30` 처리 한도
  - `MAIL_RESEND_COOLDOWN_MS = 5*60*1000` 멱등성 보장
- `sendGuideForRow(row)` (line 678~720): Drive HTML fetch + PDF blob 첨부 + Mailer 호출 + 시트 update
- `callMailer(payload)` (line 728~745): `application/x-www-form-urlencoded` (data=JSON) — preflight 회피

**Mailer Web App** (`/Users/seonjecho/Projects/jhtechsmart/appscript/mailer/Code.gs`):
- `doPost(e)` (line 39~70): 토큰 검증 + 페이로드 검증 + 첨부 blob 변환 + `MailApp.sendEmail`
- `_resolveAttachments(arr)` (line 136~163): Drive URL/fileId에서 blob, 25MB 초과 자동 skip
- `_parsePayload(e)` (line 78~99): urlencoded(data=JSON) / JSON / fallback 다 지원

**⚠ 함정**:
- Mailer 배포 시 **실행 권한**: "나" (= 발신자 계정). "사용자가 액세스 중인 계정"으로 두면 호출 측 계정으로 발송됨
- 액세스 권한: "모든 사용자"
- 양쪽 Script Properties의 `MAILER_TOKEN`이 **정확히 동일**해야 함
- `MailApp` 일 한도: 개인 200건 / Workspace 1500건 — 발송 계정 기준

**이식 시 변경할 부분**:
- 메일 제목·본문 생성 함수
- 첨부 파일 결정 로직 (jhtechsmart는 견적 PDF + 장비사진 PDF 두 개)
- `MAIL_POLL_INTERVAL_MIN` (분 단위)
- 시트의 발송 큐 컬럼 이름 (`가이드_발송요청` 등)

---

### 4. Notion DB 단방향 push + 사전 등록 페이지 자동 병합

**무엇?** 시트 행을 Notion DB로 push. 캐시된 page ID 우선, 없으면 1차/2차 매칭 키로 query → upsert.

**왜?** 운영자가 노션을 메인 도구로 쓰면서 사업이 시작되기 전 사전 등록한 페이지가 있는 경우, 같은 회사 신청 들어왔을 때 자동 병합 필요.

**핵심 코드** (`/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`):
- `NOTION_PROP_MAP` (line 778~820): 시트 컬럼 ↔ Notion 속성 이름·타입 매핑
- `_notionFetch(path, method, body)` (line 825~849): Bearer + Notion-Version 헤더, 에러 명시적 throw
- `_toNotionValue(item, raw)` (line 854~896): 시트 값 → Notion 속성 value 형식
- `ensureNotionSchema()` (line 916~945): 누락 속성 자동 추가 + 타입 불일치 ⚠ 경고
- `pushToNotion(reqId)` (line 967~1010):
  - 1순위: `Notion_PageID` 캐시
  - 2순위: query `OR(접수번호, 사업자번호)` — 사전 등록 페이지 자동 매칭
  - 3순위: 새 페이지 POST
- `_safePushToNotion(reqId)` (line 1015~1024): try-catch + `SpreadsheetApp.flush()` 선행

**push 호출 지점 5곳**:
1. `upsertUnified` 끝 (line 210)
2. `handleSaveQuote` PDF URL update 직후 (line 1812)
3. `_ensureGuideForUnified` 끝 (line 601)
4. `sendGuideForRow` 끝 (line 713)
5. `syncPendingToNotion` 내부 (line 1024)

**⚠ 함정**:
- 노션에서 속성 타입을 바꾸면 코드의 `NOTION_PROP_MAP`도 같이 바꿔야 함 (validation_error) — `ensureNotionSchema` ▶ 실행으로 즉시 검출
- `SpreadsheetApp.flush()` 누락 시 옛 시트 값을 read → 잘못된 페이로드로 PATCH
- query filter는 **rich_text equals**만 안전 — title 속성으로 query 시 검색 결과 일관성 떨어짐
- 매칭 키 빈 값은 OR 조건에서 제외 (잘못 매칭 방지)

**이식 시 변경할 부분**:
- `NOTION_PROP_MAP` 전체 (도메인별 컬럼)
- Title 속성 이름 (현재 `업체명`)
- 1차/2차 매칭 키 (현재 `접수번호` / `사업자번호`)

---

### 5. Notion ↔ 시트 양방향 sync (hash 기반 무한루프 차단)

**무엇?** 노션에서 수정된 일부 필드(`BIDIRECTIONAL_FIELDS`)를 시트로 다시 받아오기. 시트→노션 push 직후 hash 저장으로 핑퐁 방지.

**왜?** 운영자가 노션을 메인 환경으로 쓸 때 노션 수정이 시트에 반영되어야 자동 발송·트리거가 동작. 단순 양방향은 무한루프 위험.

**핵심 코드** (`/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`):
- `BIDIRECTIONAL_FIELDS` (line 1063): 양방향 6개 필드
- `REQUEST_SHEET_COLS` (line 1067~1072): 양방향 필드 중 신청관리 시트에도 존재하는 4개의 컬럼 인덱스 (이중 시트 동기용)
- `syncFromNotion()` (line 1075~1102): pollAndSendGuides 끝에서 호출, `LAST_SYNC_AT > 이전` 페이지만 fetch
- `_fetchNotionUpdatedPages(dbId, filter)` (line 1105~1122): pagination 포함 query
- `_extractBidirectionalFromNotion(page)` (line 1124~1170): 페이지 속성 → 시트 값 형식
- `_calcBidirectionalHash(values)` (line 1181~1185): SHA-256 hash
- `_getStoredHash`, `_setStoredHash` (line 1187~1193): PropertiesService `hash_<reqId>`
- `_applyNotionPageToSheet(page)` (line 1195~1242): last-write-wins 정책
  - 노션 hash == 저장 hash → skip (이미 sync 됨)
  - 시트 hash == 노션 hash → 우연 일치 → hash 갱신
  - 시트 hash == 저장 hash, 노션 다름 → 노션 새 값 → 시트 update + hash 갱신
  - 양쪽 다 다름 → 시트 우선, 노션을 시트로 다시 push
- `_updateRequestSheetField(reqId, colIdx1, value)` (line 1244~1257): 신청관리 시트 직접 update (이중 시트 정합성)
- `pushToNotion` 끝에 hash 저장 (line 1006~1014): sync에서 비교 기준

**⚠ 함정**:
- push 끝에서 hash 저장 누락하면 핑퐁 무한루프 (노션 last_edited_time이 갱신되므로 sync가 다시 시트에 적용 → push → ...)
- `LAST_SYNC_AT` 미저장 시 매 polling마다 전체 DB query — 비용 큼
- 양방향 필드를 너무 늘리면 무한루프 위험과 충돌 위험 증가. 6~10개 정도 권장
- archive(휴지통) 페이지도 query 결과에 포함될 수 있음 (필요하면 `archived: false` 필터 추가)

**이식 시 변경할 부분**:
- `BIDIRECTIONAL_FIELDS` 배열 (도메인별 — 운영자가 노션에서 수정할 만한 필드만)
- `REQUEST_SHEET_COLS` 매핑 (다른 시트에도 동기화 필요한 필드)
- last-write-wins 우선순위 (노션 우선으로 바꾸려면 정책 반전)

---

## 의존성 / 사전 작업 체크리스트

### Google Apps Script

| 항목 | 확인 |
|---|---|
| 시트 ID | Script Properties `SPREADSHEET_ID` |
| 메인 GAS 계정 | 시트·Drive 폴더 모두 접근 권한 있어야 함 |
| Drive 폴더 (메일 본문 저장용) | Script Properties `GUIDE_DRIVE_FOLDER_ID` |
| 이메일 템플릿 파일 | Script Properties `GUIDE_TEMPLATE_FILE_ID` (PART 마커 필수) |
| OpenAI API Key | Script Properties `OPENAI_API_KEY` (gpt-4o-mini는 매우 저렴, 1건 ~1원) |

### Mailer Web App (별도 GAS 프로젝트, 발신자 계정)

| 항목 | 확인 |
|---|---|
| 발신자 계정으로 새 GAS 프로젝트 생성 | mailer/Code.gs 붙여넣기 |
| Script Properties `MAILER_TOKEN` | 임의 32자 hex, 메인 GAS와 동일 |
| 배포: Web App | 실행 권한 "나" (= 발신자 계정), 액세스 "모든 사용자" |
| 발급된 URL | 메인 GAS Script Properties `MAILER_WEBAPP_URL` 등록 |

### Notion

| 항목 | 확인 |
|---|---|
| 데이터베이스 생성 | Title 속성 이름을 매칭에 맞게 (예: `업체명`) |
| Integration 생성 | https://www.notion.so/my-integrations — Internal Secret 복사 |
| DB와 Integration 연결 | DB 페이지 `···` → Connections → 선택 |
| DB ID | URL `https://www.notion.so/<workspace>/<db_id>?v=...` 의 `db_id` (32자) |
| 메인 GAS Script Properties | `NOTION_TOKEN`, `NOTION_DB_ID` 등록 |
| 속성 자동 보강 | `ensureNotionSchema()` ▶ 실행 (Title 외 모든 속성 자동 생성) |

---

## 적용 순서 (다른 프로젝트에서 처음 도입할 때)

1. **통합 마스터 시트만** — 가장 작은 단위. 신청·견적 데이터 모이는지 확인
2. **이메일 템플릿 + Drive 저장** — 본문 생성 흐름. GPT 없이 placeholder 본문으로 검증
3. **OpenAI 통합** — 5 PART 응답 흐름 + 단순 동영상 가이드 / 임의 분야로 적용
4. **Time-driven 자동 발송 + Mailer Web App** — 별도 GAS 배포, 발송 계정 분리
5. **Notion 단방향 push** — 마스터 시트 → 노션 동기. `ensureNotionSchema`로 속성 자동 추가
6. **양방향 sync (선택)** — 운영자가 노션을 메인으로 쓸 때만. hash 기반 무한루프 차단 필수
7. **admin UI에 즉시 발송 버튼 (선택)** — 진짜 즉시 처리 필요 시. 토큰 인증 + 권한 체크

---

## 주의사항 / 운영 노트 (운영 중 만난 함정)

### 1. 헤더 보강은 끝에 append만
`UNIFIED_HEADERS`의 신규 컬럼은 항상 배열 끝. 중간 삽입 시 기존 시트와 위치 불일치 → 데이터 손상 가능. 한 번 운영하기 시작하면 헤더 순서를 바꾸지 말 것.

### 2. SpreadsheetApp.flush() 타이밍
`setValues` 같은 write 직후 즉시 read하면 batch가 flush 안 된 옛 값을 받음. push 직전 명시적 `SpreadsheetApp.flush()` 호출 필요.

### 3. OpenAI max_tokens 명시
미명시 시 응답 길이가 짧게 잘림. 5 PART 응답에 최소 2500 권장. `finish_reason === 'stop'` 검증으로 truncation 감지.

### 4. JavaScript 정규식 `\Z` 미지원
markdown PART 파싱에서 lookahead `(?=...|\Z)` 패턴이 마지막 PART를 못 잡음. **split + capture group** 방식이 안전.

### 5. Notion 속성 타입 일치
사용자가 노션에서 속성 타입 변경하면 코드와 어긋남. `ensureNotionSchema()`가 mismatch 경고 출력하도록 강화. 운영 후 한 번씩 실행 권장.

### 6. push 직후 hash 저장
양방향 sync에서 push 후 hash 저장 누락 시 무한루프. push의 모든 분기 끝(POST·PATCH 모두)에서 저장 필요.

### 7. Mailer 토큰 동기
메인 / Mailer 양쪽 Script Properties의 `MAILER_TOKEN`이 정확히 동일해야 함. 한쪽 변경 시 다른 쪽도 동시 변경.

### 8. Notion checkbox false 값
Notion API의 checkbox 속성은 false도 명시적 boolean. 빈 값으로 두면 안 됨. `_toNotionValue`의 checkbox case 참고.

### 9. Drive 폴더 ANYONE_WITH_LINK
첨부 PDF·가이드 HTML 모두 ANYONE_WITH_LINK + VIEW. 폴더 자체 권한도 확인 (폴더가 private이면 폴더 안 파일이 ANYONE_WITH_LINK여도 접근 불가)

### 10. 5분 polling 간격
- `MAIL_POLL_INTERVAL_MIN = 5` 기준 — 시간당 12회 polling
- 더 짧게 (1~3분)도 가능. 무료 한도 내
- GAS Time-driven trigger 최소 1분

---

## Claude Code로 이 가이드 활용하는 방법

다른 프로젝트에서 Claude Code에게 다음과 같이 지시:

```
/Users/seonjecho/Projects/jhtechsmart/docs/portability-guide.md를 읽고
/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs와
/Users/seonjecho/Projects/jhtechsmart/appscript/mailer/Code.gs를 참고해서
[현재 프로젝트]에 [패턴 이름] 패턴을 적용해줘.
도메인별 변경 포인트는 [...]야.
```

또는 더 구체적으로:

```
@/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs의 line 612~680
(pollAndSendGuides + setupTriggers)을 reference로 해서
[현재 프로젝트 GAS]에 Time-driven trigger 5분 polling 기능 추가해줘.
폴링 대상 시트 컬럼은 [...], 발송 액션은 [...]야.
```

Claude Code가 reference 파일 읽고 패턴만 차용해서 도메인에 맞게 작성합니다.

---

## 빠른 시작 — 다른 프로젝트에서 처음 도입할 때 한 시간 안에

1. 운영 시트 + Drive 폴더 + 노션 DB 미리 만들기
2. Script Properties 모두 등록 (위 체크리스트)
3. `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`를 새 GAS 프로젝트에 복사
4. 도메인별 변경:
   - `UNIFIED_HEADERS` — 자기 도메인 컬럼
   - `NOTION_PROP_MAP` — 동일
   - 매칭 키 (`접수번호` → 자기 도메인 ID)
   - `GUIDE_SYSTEM_PROMPT` — 도메인별 GPT 응답 형식
   - `handleSaveQuote`의 PDF 저장 로직 (필요 시)
5. `appscript/mailer/Code.gs`를 발신자 계정 GAS에 복사 + 배포
6. `initSheets` ▶ → 시트 자동 생성
7. `ensureNotionSchema` ▶ → 노션 속성 자동 추가
8. `setupTriggers` ▶ → 5분 trigger 자동 설정
9. 검증 — 위 devlog의 검증 시나리오 참고

---

## 관련 파일 절대 경로

| 파일 | 경로 |
|---|---|
| 메인 GAS | `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs` |
| Mailer Web App | `/Users/seonjecho/Projects/jhtechsmart/appscript/mailer/Code.gs` |
| admin UI | `/Users/seonjecho/Projects/jhtechsmart/admin.html` |
| 이메일 템플릿 (참고용) | Drive 폴더 `1l8uSZhiEURmoog6rIkvGCEvA3d8eVj3z`의 `jaehyun_tech_guide_fixed.html` |
| 개발 노트 | `/Users/seonjecho/Projects/jhtechsmart/docs/devlog-2026-05-13.md` |
| 인증 시스템 (Phase 0 참고) | `/Users/seonjecho/Projects/jhtechsmart/docs/auth-system.md` |
| 통합 마일 계획서 | `/Users/seonjecho/Projects/jhtechsmart/docs/integration-mail-notion-plan.md` |
