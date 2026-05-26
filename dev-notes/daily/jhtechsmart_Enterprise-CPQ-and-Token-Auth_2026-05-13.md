# jhtechsmart — Dev Note: Enterprise-CPQ-and-Token-Auth

> **📅 Date:** 2026-05-12 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** Enterprise-CPQ-and-Token-Auth
> **👤 Author:** SeonjeCho · **🔖 Tags:** cpq-ui, auth, token, ui-bugs, kst-timezone

---

## TL;DR

Enterprise CPQ 디자인 리뉴얼(좌우 2단 + sticky Quote Summary) + 시트 정합성 정비(견적번호 v1 접미, 담당자 시트 6컬럼화, 확정행 보호) + 13차 토큰 기반 인증/백엔드 권한 검증 도입(HMAC-SHA256 + 권한 필터) + 견적서 버전이력 UI 버그 4개 fix + KST timezone + 사이드바 ring + 날짜 가독성. 운영 적용 후 합쳐서 운영 안정성 본격 확보 단계.

---

## Today's Work

### ♻️ `refactor(ui)`: Enterprise CPQ UI 리뉴얼 — 좌우 2단 + sticky Quote Summary (12차)

**Status:** `completed`  
**Files changed:** `admin.html`, `logo-header.png`, `docs/layout-samples/`

#### Context

Stripe Invoicing / Salesforce CPQ / HubSpot Quotes 같은 해외 B2B SaaS의 견적 UI 패턴을 차용 — Deal banner + sticky Quote Summary + 카드형 정보 영역.

#### Implementation

헤더에 logo-header.png(280×63) + 태그라인 + 역할 라벨. 사이드바 카드형(그림자/hover) + pill 탭. v2-grid 1fr/340px sticky(1280px 미만 1단). Deal banner — 회사명 + 상태 badge + KPI 4종(견적번호/담당자/유효기간/합계금액 bannerTotal). Quote Summary 우측 — 그라데이션 헤더 + 장비/옵션 소계 + 노란 합계 박스(30px) + 액션 + 메타. 영업일지를 Quote Summary 아래로 이동.

#### Learnings

- B2B 견적 UI는 좌측 디테일(편집 영역) + 우측 sticky summary(액션 영역) 패턴이 표준
- Deal banner 같은 상단 KPI 4종은 사용자가 신청 클릭 후 0.5초 안에 모든 핵심 정보를 인지하게 함

---

### ♻️ `refactor(gas)`: 시트 정합성 정비 — 견적번호 v1, 담당자 시트 6컬럼화, 확정행 보호 (12차)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `admin.html`

#### Context

운영 중 발견된 시트 데이터 일관성 이슈 5가지를 정리 — 견적번호 식별성, 담당자 데이터 위치, 확정행 보호, 시트 마이그레이션.

#### Implementation

1) generateQuoteNo: YYMMDD-NNNN → YYMMDD-NNNN-v1 (v1 접미). getNextVersion v1→v2→v3, 레거시 -R\d+도 다음부터 -v로 자동. 2) handleConfirm — (접수번호+견적번호) 매칭 행이 이미 confirmed면 절대 갱신 안 함 + 신규 행 추가 (이력 손실 방지). 3) 담당자관리 6컬럼화 — 직책 컬럼 제거, 이름 컬럼에 통합. 4) initSheets()가 누락 헤더(20·21번 담당자/공정흐름도) 자동 보강.

#### Learnings

- 시트 헤더 마이그레이션은 빈 셀만 채우는 멱등 패턴이 안전 — 기존 데이터는 절대 덮어쓰지 말 것
- 확정 상태 행은 어떤 mutation도 절대 갱신하지 않게 명시적 차단 — 운영 이력 손실은 복구 불가

---

### ✨ `feat(ui)`: 버전 이력 UI 개선 + 행 클릭 → 우측 패널 동기 (12차)

**Status:** `completed`  
**Files changed:** `admin.html`

#### Implementation

1개 버전부터 표시. 행 클릭 시 우측 패널이 그 버전 견적 상세로 갱신(읽기 전용 + 액션바: 이 버전 출력 / 최신으로 돌아가기). 노란 상단 배너 제거 → 단색 SVG 눈 아이콘 + 옅은 노란 배경(#fef9c3). 최신 버전 행 클릭 시엔 강조 X. 변경정보 모달의 추가옵션은 이전/변경 후 두 셀로 단순 비교.

#### Learnings

- 단색 SVG 아이콘이 색상 emoji보다 브라우저별 일관성 + currentColor 상속으로 다양한 배경에서 자동 대응

---

### ✨ `feat(auth)`: 세션 자동 로그인 — sessionStorage (12차)

**Status:** `completed`  
**Files changed:** `admin.html`

#### Context

새로고침 시 매번 로그인 요구되어 운영자 불편 + 공용 PC 보안 고려 필요.

#### Implementation

sessionStorage('jhtech_session_user')에 ID만 저장. 탭 종료 시 자동 정리 — 공용 PC에서도 비교적 안전. 비밀번호 저장 X. initApp 끝에 tryRestoreSession (담당자 시트 로드 후 사용자 객체 복원).

#### Learnings

- sessionStorage는 탭별 격리 + 탭 닫으면 자동 삭제 — 공용 PC 자동 로그아웃에 자연스러움

---

### ✨ `feat(auth)`: 토큰 기반 인증 + 백엔드 권한 검증 (13차)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `admin.html`, `docs/auth-system.md`

#### Context

v12 이하는 GAS가 모든 신청 데이터를 무조건 반환하고 클라이언트가 if(!isAdmin) filter로 화면에만 숨김. F12 콘솔에서 다른 업체 사업자번호/연락처/이메일 모두 조회 가능 + 비밀번호도 모든 사용자에게 다운로드. 백엔드 권한 검증 부재가 docs/issues.md 문제 4 (🔴 즉시).

#### Implementation

HMAC-SHA256 자가서명 토큰 (8h 만료) + verifyToken 라우터 적용. _filteredRequestRows(user) — 비관리자는 본인 담당 신청만 응답. _checkRequestPermission — mutation에 권한 체크. _readUserConfigMasked — 비밀번호 마스킹. 신청관리·견적서발급관리 담당자 컬럼을 한글 이름 → u.id 영문으로 전환(한글 비교 NFC/NFD 차이 회피). migrateAssigneeNameToId 1회 마이그레이션. SPREADSHEET_ID를 Script Properties로 분리(운영/테스트 GAS 자동 분기). 클라이언트는 sessionStorage 토큰 자동 첨부 + AUTH_REQUIRED 자동 로그인 화면 복귀.

#### Architecture Decisions (ADR)

**Decision:** 권한 모델 — 클라이언트 필터 vs 백엔드 권한 검증

- **Context:** 운영 중 다른 업체 데이터가 F12로 노출되는 보안 결함 발견
- **Options considered:**
  - 클라이언트 필터 유지 (현상 — 보안 결함)
  - 백엔드 권한 검증 + 응답 자체를 필터 (B안)
  - Google Identity Provider 통합 (A안 — 복잡)
- **Chosen:** B안 — 백엔드 권한 검증 + 응답 필터 + HMAC 자가서명 토큰
- **Rationale:** Google IdP 통합은 도메인 위임 + OAuth 복잡. 자체 토큰은 GAS만으로 가능하고 운영 부담 적음. 운영 단일 PC 환경 전제로 8h 만료면 충분.
- **Consequences:** 토큰 즉시 무효화 불가(8h 유효). Refresh Token 미사용. 운영 안정화 후 bcrypt/audit log/rate limiting 후속 개선 필요.

#### Problems & Solutions

**Problem:** 신청관리 담당자 컬럼의 한글 이름 비교가 일부 깨짐

- **Root cause:** NFC/NFD 자모 분리 차이 + trailing whitespace로 String === 비교 실패
- **Solution:** 담당자 컬럼을 u.id(영문)로 전환. migrateAssigneeNameToId 1회 실행으로 기존 데이터 변환
- **Prevention:** 한글 비교가 필요한 경우 normalize('NFC') + trim, 또는 영문 ID 매칭

#### Learnings

- GAS만으로 HMAC 자가서명 토큰 인증 구현 가능 — Utilities.computeHmacSha256Signature 활용
- 한글 문자열 비교는 NFC/NFD 정규화 차이 때문에 깨질 수 있음 — ID 매칭이 안전

---

### 🐛 `fix(ui)`: 견적서 버전이력 UI 버그 4가지 (14차)

**Status:** `completed`  
**Files changed:** `admin.html`

#### Implementation

1) 수정확정 후 좌측 업체 재클릭해야 버전이력 반영되던 문제 — refreshVersionsAfterPdf(reqId)가 800ms 지연으로 loadVersionsForReq 호출. 2) 버전이력 클릭 시 우측 Quote Summary가 최신 값 유지되던 문제 — renderDetail 끝 recalcPrice()에 if(!viewingPastVersion) 가드. 3) 추가옵션 input 시각적 구별 안 됨 — .ex-tbl input:not(:disabled) 보더+배경+placeholder. 4) 신청중 상태 좌우 박스 윗라인 14px 어긋남 — #versionHistorySection:empty{display:none}로 빈 flex item 카운트 제외.

#### Learnings

- Flexbox gap은 빈 자식도 카운트해 spacing 적용 — 빈 컨테이너는 :empty{display:none}으로 제외
- 비동기 작업 후 UI 갱신은 setTimeout으로 GAS write 반영 시간 확보 (~800ms)가 실무적

---

### 🐛 `fix(gas)`: GAS 응답 날짜 KST 포매팅 통일 (15차)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### Context

운영 시트에는 KST로 저장되는데 화면에서는 ISO UTC(2026-05-13T02:51:00.000Z) 형식으로 보이던 문제 — Google Sheets가 셀을 자동으로 Date 객체로 인식하면 JSON 직렬화 시 UTC ISO 됨.

#### Implementation

_fmtKstDateTime / _fmtKstDate helper 도입. _filteredRequestRows의 submittedAt + foundDate, getVersions의 issuedAt + validUntil, listQuotes의 issuedAt + validUntil 3곳 모두 적용. helper는 Date 객체든 문자열이든 안전 처리, 이미 KST 형식이면 그대로 통과.

#### Learnings

- Sheets 셀이 Date 객체로 인식되는 자동 변환은 JSON 직렬화 시 UTC ISO 됨 — 명시적 Utilities.formatDate KST 포매팅 통일 필요

---

### 💅 `style(ui)`: 사이드바 ring + 날짜 가독성 (15차)

**Status:** `completed`  
**Files changed:** `admin.html`

#### Implementation

사이드바 active 항목의 box-shadow ring(0 0 0 3px)이 .req-list(padding:0, overflow-y:auto) 위쪽 경계에서 잘리던 문제 — padding:4px 2px로 ring 두께보다 큰 안전 여백. 날짜 표시 가독성 — 2026-05-12 11:51 → 2026.05.12 · 11:51 (bold 날짜 + opacity 강약, color는 부모 상속해 deal banner 흰색 / 사이드바 회색 자동 대응). fmtDateTime helper 4곳 통일.

#### Learnings

- box-shadow ring이 overflow:auto 컨테이너 경계에서 잘리므로 ring 두께보다 큰 padding이 안전 여백
- SVG/텍스트 색은 currentColor + opacity로 부모 색 상속 + 강약 처리하면 다중 배경 자동 대응

---

## Changes Summary

### Added

- Enterprise CPQ 디자인 (Deal banner + sticky Quote Summary + Stripe/Salesforce 패턴)
- logo-header.png + 도메인 헤더
- 초기 로딩 오버레이 (회전 링 스피너)
- 세션 자동 로그인 (sessionStorage 8h)
- HMAC-SHA256 토큰 인증 + 백엔드 권한 검증
- _filteredRequestRows + _checkRequestPermission + _readUserConfigMasked
- migrateAssigneeNameToId (이름 → ID 1회 변환)
- SPREADSHEET_ID를 Script Properties로 분리
- docs/auth-system.md (인증 시스템 개발 노트)
- refreshVersionsAfterPdf (버전이력 즉시 갱신)
- _fmtKstDateTime / _fmtKstDate helper
- fmtDateTime UI helper (날짜 bold + 점 + 옅은 시간)

### Changed

- 견적번호 형식 YYMMDD-NNNN → YYMMDD-NNNN-v1 (-v 접미)
- 담당자관리 시트 6컬럼화 (직책 컬럼 제거)
- 신청관리 / 견적서발급관리 담당자 컬럼 한글 → u.id
- .ex-tbl input 디자인 (보더+배경+placeholder)
- v2-grid 좌우 2단 + sticky Quote Summary

### Fixed

- 확정 상태 행이 후속 mutation에 의해 갱신되던 위험
- 수정확정 후 버전이력이 좌측 재클릭해야 반영되던 문제
- 버전이력 클릭 시 우측 Quote Summary가 최신 값 유지
- 신청중 상태 좌우 박스 윗라인 14px 어긋남
- GAS 응답 날짜가 UTC ISO로 표시되던 문제
- 사이드바 active ring이 컨테이너 경계에서 잘림

---

## Next Steps

- [ ] Phase 1~7 — 통합정보 시트 + 메일 본문 + GPT 가이드 + Mailer + Notion 양방향 + admin 즉시 발송

---

## Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 이 시점부터 모든 GAS mutation은 토큰 인증 + 권한 체크 필수. _filteredRequestRows / _checkRequestPermission 패턴 따라야 함. 견적번호 -vN 접미 + getNextVersion -v 형식 기본. _fmtKstDateTime / _fmtKstDate / fmtDateTime helper 활용. _ensureGuideForUnified 같은 후속 함수가 들어올 위치는 Phase 1~7 (다음 일자).

**Reusable patterns introduced today:**

- `HMAC-SHA256 자가서명 토큰 (GAS only)` — Utilities.computeHmacSha256Signature + Script Properties SECRET으로 자체 인증 시스템. Refresh Token 없는 단일 토큰, 8h 만료 (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `백엔드 권한 필터 (_filteredRequestRows)` — 응답 자체를 권한별 필터 — 클라이언트 필터링과 본질적 차이. F12 콘솔로도 다른 사용자 데이터 못 봄 (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `_fmtKstDateTime / _fmtKstDate (시트 ↔ JSON 응답)` — Sheets 셀이 Date로 인식되어도 KST 문자열로 통일. 이미 yyyy-MM-dd 형식이면 그대로 통과 (재포매팅 잘못 해석 방지) (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `Enterprise CPQ — Deal banner + sticky summary 레이아웃` — v2-grid 1fr/340px sticky. 좌측 디테일(편집) + 우측 sticky summary(액션·메타) (see `/Users/seonjecho/Projects/jhtechsmart/admin.html`)
