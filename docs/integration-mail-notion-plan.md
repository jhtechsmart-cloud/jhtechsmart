# 통합정보 시트 + 자동 메일 발송 + Notion 동기화 — 구현 계획

> 작성일: 2026-05-13
> 참고 reference: `/Users/seonjecho/Projects/bpksmart2026`
> 대상 프로젝트: jhtechsmart (`admin.html`, `appscript/Code.gs`)

---

## 배경

bpksmart2026이 사용자가 요청한 8가지 기능을 모두 구현한 reference. 다만 그대로 옮기기엔 다음 차이가 있어 단계적 이식 + 일부 단순화로 진행.

- jhtechsmart는 신청관리(21열)/견적서발급관리(13열) 구조이고 매칭 키는 `REQ-YYYYMMDD-NNNNN` 접수번호 (bpksmart는 사업자번호)
- bpksmart는 양방향 Notion sync, 별도 Mailer Web App, 큐 시스템, Make.com 백업까지 운영 노하우가 누적된 결과물

## 첫 도입 시 단순화 결정 (변경 가능 — 사용자 검토)

| bpksmart | jhtechsmart 첫 도입 | 이유 |
|---|---|---|
| 양방향 Notion sync (시트↔노션) | 단방향만 (시트→노션) | last-write-wins 정책 복잡, 안정화 후 추가 |
| 별도 Mailer Web App 배포 | main GAS의 `MailApp.sendEmail` 직접 호출 | 별도 배포·인증 부담 제거, 일 200통(개인)/1500통(Workspace) 한도 |
| `_sync_queue` 시트 + 재시도 | 첫 도입엔 생략 — `guide_error` 컬럼만 | 실패는 다음 폴링에서 자연 재시도 |
| Make.com 즉시 발송 백업 | 생략 | 필요해지면 "지금 발송" 버튼 추가 |
| GPT 응답 5-PART 분리 | 1개 PART (동영상 가이드만) | 사용자 요구 = "동영상 가이드 부분만 수정" |

---

## 통합정보 시트 헤더 (총 39컬럼)

### 신청 그룹 (21개) — 신청관리 시트와 동일
1. 접수번호 / 2. 접수일시 / 3. 업체명 / 4. 사업자번호 / 5. 대표자 / 6. 연락처 / 7. 이메일 / 8. 주소
9. 사업자등록일 / 10. 주업종 / 11. 매출2023 / 12. 매출2024 / 13. 매출2025
14. 문제공정 / 15. 도입목적 / 16. 선택문제목표 / 17. 선택장비 / 18. 요청사항
19. 상태 / 20. 담당자 / 21. 공정흐름도

### 견적 그룹 (10개) — 견적서발급관리 시트 중복 제외 + 버전 메타
22. 견적번호 / 23. 발급일시 / 24. 포함옵션 / 25. 추가옵션(JSON)
26. 공급가액 / 27. 부가세 / 28. 합계 / 29. 유효기간
30. version / 31. isLatest

### 가이드/메일 그룹 (6개)
32. 가이드_생성일시 / 33. 가이드_HTML_URL / 34. 가이드_발송요청
35. 가이드_발송일시 / 36. 가이드_발송상태 / 37. 가이드_에러

### Notion sync 메타 (2개)
38. Notion_PageID / 39. 최종푸시일시

**매칭 키**: 접수번호 (REQ-YYYYMMDD-NNNNN)

---

## Phase 1 — 통합정보 시트 + 자동 동기화 (기능 #1~#4) ◀ 진행 중

### 내가 작성하는 코드 (`appscript/Code.gs`)

- [ ] `UNIFIED_HEADERS` 상수 + `UNIFIED_COL_INDEX` 매핑
- [ ] `initSheets()`에 통합정보 시트 자동 생성/헤더 보강 (idempotent)
- [ ] `upsertUnified(reqId, requestData, quoteData)` 함수
  - 접수번호로 행 찾기 → INSERT 또는 UPDATE
  - 버전 비교 (`-vN` 추출) — 같거나 큰 경우만 견적 컬럼 overwrite
- [ ] `handleSubmit()` 끝에 `upsertUnified(id, request, null)` 호출
- [ ] `handleConfirm()` 끝에 `upsertUnified(data.id, request, data)` 호출
- [ ] (선택) `_backfillUnified()` — 기존 신청·견적 데이터 1회 마이그레이션

### 사용자 사전 작업
- 없음 (`initSheets()`가 자동으로 시트 생성)

### 검증 체크리스트
- [ ] GAS 재배포 + `initSheets` 1회 실행 → 운영 시트에 "통합정보" 시트 자동 생성, 39컬럼 헤더 표시
- [ ] 새 신청 제출(quote.html) → 통합정보 시트 새 행 (신청 21컬럼 채워짐)
- [ ] 견적 확정(admin.html) → 같은 접수번호 행에 견적 정보 추가 (10컬럼 채워짐, version=1, isLatest=1)
- [ ] 수정확정(v2 발급) → 같은 행이 v2 값으로 overwrite, version=2

### 롤백 방안
- 통합정보 시트 단순 삭제. 다른 4개 시트는 영향 받지 않음. 코드 revert 시 자동 비활성

---

## Phase 2 — 템플릿 로드 + 본문 생성 + 발송 큐 등록 (기능 #5~#6)

### 내가 작성하는 코드
- [ ] `loadEmailTemplate()` — `GUIDE_TEMPLATE_FILE_ID`에서 Drive HTML fetch + 5분 캐시
- [ ] `buildGuideHtml(template, replacement)` — 동영상 가이드 placeholder 치환
- [ ] `saveGuideHtmlToDrive(html, company, reqId)` — `GUIDE_DRIVE_FOLDER_ID` 폴더에 저장 + ANYONE_WITH_LINK
- [ ] `enqueueGuideMail(reqId)` — 통합정보 행의 `guide_send_request=TRUE` 마킹
- [ ] `handleSaveQuote()` 흐름 — 두 PDF(견적·장비사진) 모두 저장 직후 본문 생성 + 큐 등록 호출

### 사용자 사전 작업
- [ ] Google Drive에 폴더 생성 (예: `재현테크_가이드메일`)
- [ ] 폴더에 `email_sample.html` 업로드 (placeholder 마커 포함 필요)
- [ ] 폴더 ID 복사 → 운영 GAS Script Properties `GUIDE_DRIVE_FOLDER_ID`
- [ ] 파일 ID 복사 → 운영 GAS Script Properties `GUIDE_TEMPLATE_FILE_ID`
- [ ] **email_sample.html 보내주세요** — placeholder 마커 위치 의논 필요

### 검증 체크리스트
- [ ] 견적 확정 + PDF 두 개 모두 Drive 저장 후 → 회사별 본문 HTML이 Drive에 자동 생성
- [ ] 통합정보 시트의 `guide_html_url`, `guide_send_request=TRUE` 마킹 확인

---

## Phase 3 — GPT API로 동영상 촬영 가이드 생성 (기능 #7~#8)

### 내가 작성하는 코드
- [ ] `GUIDE_SYSTEM_PROMPT` 상수 (사용자 검토 필요)
- [ ] `callOpenAI(input)` — `gpt-4o-mini` (또는 사용자 선택), temperature 0.7
- [ ] `generateVideoGuide(reqId)` — 통합정보 행 입력 → GPT 호출 → 본문 치환 → 시트 update
- [ ] Phase 2 흐름에 generateVideoGuide 통합

### 사용자 사전 작업
- [ ] OpenAI 계정 + API 키 발급 (https://platform.openai.com/)
- [ ] 결제 정보 등록 (`gpt-4o-mini` 한 건당 약 1~5원)
- [ ] 운영 GAS Script Properties `OPENAI_API_KEY` = `sk-...`

### 검증 체크리스트
- [ ] 본문 HTML 안 동영상 가이드 부분이 GPT 생성 내용으로 채워짐
- [ ] Drive 저장된 회사별 본문 HTML 미리보기 확인

---

## Phase 4 — Time-driven 트리거 자동 발송 (기능 #9)

### 내가 작성하는 코드
- [ ] `pollAndSendGuides()` — 발송 큐 수집, LockService, 30건/회 한도
- [ ] `sendGuideForRow(row)` — 본문 fetch + PDF 첨부 + `MailApp.sendEmail`
- [ ] 시트 update (status, sent_at, send_request=FALSE)
- [ ] 5분 내 중복 발송 차단

### 사용자 사전 작업
- [ ] 운영 GAS 에디터 → 좌측 트리거 → "+ 트리거 추가"
  - 함수: `pollAndSendGuides`
  - 이벤트: "시간 기반" / "분 단위 타이머" / "10분마다" (또는 5분)
  - 저장

### 검증 체크리스트
- [ ] Phase 2~3 완료 후 5~10분 안에 메일 inbox 도착
- [ ] 통합정보 `guide_sent_status=발송완료` 변경

### MailApp 일 한도
- 개인 Gmail: 200건 / Google Workspace: 1,500건

---

## Phase 5 — Notion DB 단방향 동기화 (기능 #10)

### 내가 작성하는 코드
- [ ] `NOTION_PROP_MAP` — 통합정보 ↔ Notion DB 속성 매핑 (사용자 승인 필요)
- [ ] `pushToNotion(reqId)` — 접수번호로 페이지 조회/upsert
- [ ] 자동 호출 — `upsertUnified()` 끝 + `pollAndSendGuides()` 발송 직후
- [ ] (선택) `ensureNotionSchema()` — 누락 속성 자동 추가

### 사용자 사전 작업
- [ ] Notion 데이터베이스 생성 (속성 정의는 매핑표 승인 후)
- [ ] Notion Integration 생성 (https://www.notion.so/my-integrations)
- [ ] DB와 Integration 연결 (Connections)
- [ ] 운영 GAS Script Properties:
  - `NOTION_TOKEN` = `secret_...`
  - `NOTION_DB_ID` = DB URL의 32자 hex

### 검증 체크리스트
- [ ] 신청·견적·메일 발송 후 Notion DB에 같은 페이지 추가/갱신 확인
- [ ] `메일발송여부`, `메일발송일`이 노션에 반영

---

## 사용자 검토 요청 사항

- [ ] **단순화 결정 4가지 OK?** (Notion 단방향만 / Mailer 별도 배포 X / 큐 생략 / GPT 1개 PART)
- [ ] **email_sample.html 공유** — Phase 2 시작 전 placeholder 위치 의논
- [ ] **GPT 모델** — `gpt-4o-mini` (기본) / `gpt-4o` (10배 비싸지만 품질 ↑)
- [ ] **이메일 발송 계정** — 개인 Gmail vs Google Workspace (한도 결정용)
- [ ] **메일 발송 폴링 주기** — 5분 / 10분 / 15분

---

## 진행 로그

| 일자 | 단계 | 내용 |
|---|---|---|
| 2026-05-13 | Plan 작성 | bpksmart 분석 후 5 Phase 계획 수립 |
| 2026-05-13 | Phase 1 시작 | 통합정보 시트 + 자동 동기화 코드 작성 중 |
