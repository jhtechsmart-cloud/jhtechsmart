# jhtechsmart — Dev Note: Project-Genesis

> **📅 Date:** 2026-05-09 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** Project-Genesis
> **👤 Author:** SeonjeCho · **🔖 Tags:** foundation, form-wizard, gas, pdf, deploy

---

## TL;DR

프로젝트 출범. 견적 신청 위저드(quote.html) + 관리자 페이지(admin.html) + Google Apps Script 백엔드 + Google Sheets 저장소를 0에서 구축. UI/UX 폼 + 5단계 위저드 + 평균매출 판정 + GAS 라우터(submit/confirm/list/saveQuote 등) + 담당자 배정 + GitHub Pages 배포 + OG 메타 + PDF 자동 저장(html2pdf.js)까지 1~11차 작업을 일괄 도입.

---

## Today's Work

### ✨ `feat(ui)`: 5단계 위저드 UI/UX 베이스라인 (1차)

**Status:** `completed`  
**Files changed:** `quote.html`

#### Context

신청 폼이 거친 표 간격 + 검증 누락 + 깜빡임으로 사용성 약함. B2B 고객 접점이라 첫인상 중요.

#### Implementation

mini-table 첫 컬럼 고정 너비 + nowrap, 셀 패딩 9→11/16, 짝수 행 zebra(#fafcff). 체크박스 flex-shrink:0 + 고정 16×16 — 긴 텍스트 줄바꿈 시 위치 고정. 매출 그리드(revGrid) 사업자등록일 따라 2/3컬럼 동적 전환. validateStep() — 단계별 필수 필드 미입력 시 다음 단계 차단(왼쪽 탭 클릭도 동일).

#### Learnings

- 다단계 폼은 next 버튼 + 탭 클릭 양쪽 모두 같은 검증 함수를 거치게 — 한쪽만 막으면 우회 가능
- 체크박스가 줄바꿈된 라벨과 같이 있을 때 flex-shrink:0 + 고정 크기 안 주면 위치 흔들림

---

### 📝 `docs(content)`: 사업 안내 콘텐츠 + 개인정보 동의서 (2~3차)

**Status:** `completed`  
**Files changed:** `quote.html`

#### Context

재현테크가 공식 견적 시스템으로 사용하려면 사업 안내 내용 + 개인정보 동의서가 법적 요건(개인정보 보호법 제15·17조)을 충족해야 함.

#### Implementation

0단계 사업 안내 — 재현테크 표기 통일, 자부담 행 확장(부가세 별도 안내 + 실질 1,680만원 강조), 신청 절차 7개 준비사항 + 의무사항 2개. 동의서 — 처리자/목적/항목/기간/제3자 제공/위탁/권리/거부권 8개 필수 기재. privacyAgree / contactAgree ID 유지로 기존 검사 호환.

#### Learnings

- 개인정보 보호법 적용 시 한 곳이라도 누락하면 동의 효력 없음 — 8개 모두 명시 필요
- 필수/선택 구분을 [필수] 빨간 태그로 시각화하면 사용자 인지 향상

---

### ✨ `feat(ui)`: 3·4·5단계 개편 — 공정 분석 + 장비 선택 + 제출 확인 (4차)

**Status:** `completed`  
**Files changed:** `quote.html`

#### Context

인쇄업 실제 문제점을 반영한 공정·문제 매트릭스가 필요. 장비 목록은 재현테크 취급 라인업 전체.

#### Implementation

purposeOptions — 공정(절단/인쇄/기타) × 목적(교체/신규) 매트릭스로 각 8~10개 '현재 문제 → 개선 목표' 형식. 4단계 — 프린터 11종 + 평판커팅기 4종, 카테고리 헤더 + 단일 선택. 5단계 — pre 텍스트 → 구조화 HTML 카드 + ✔/✘ 배지 + 태그 형태. buildSummary()(HTML) / buildPlainText()(.txt 다운로드용) 분리.

#### Learnings

- B2B 폼은 자유 텍스트보단 선택지 매트릭스가 신청자 부담 줄이고 데이터 분석 쉬움
- HTML 요약과 .txt 다운로드 형식이 다를 때 함수를 분리하면 한쪽 수정이 다른 쪽에 영향 X

---

### 🐛 `fix(logic)`: 평균매출 판정 부등호 수정 (5차)

**Status:** `completed`  
**Files changed:** `quote.html`

#### Context

소공인 스마트제조 지원사업 평균매출 조건은 '2억원 초과' 기업이 지원 대상. 코드는 반대(2억원 이하 OK)로 구현되어 있었음 — 신청자가 잘못된 안내를 받을 수 있음.

#### Implementation

calcRevenue()의 판정 로직 avg <= limit → avg > limit. 라벨도 '기준 충족 가능/초과' → '2억원 초과 — 지원 대상 가능 / 2억원 이하 — 지원 대상 제외'로 명확화.

#### Problems & Solutions

**Problem:** 부등호 방향이 반대였음

- **Root cause:** 지원 대상 조건을 코드 작성자가 잘못 해석 (이하면 영세기업이라 지원 대상이라 오해)
- **Solution:** 법령 원문 확인 — 평균매출 2억원 초과 기업이 신청 가능. 부등호 반전
- **Prevention:** 사업 요건은 항상 원문 인용 + 라벨에 기준 명시

#### Learnings

- 비즈니스 조건의 부등호 방향은 라벨에 임계값 직접 표기(2억원 이상/이하)로 회귀 방지

---

### ✨ `feat(gas)`: Google Apps Script 백엔드 라우터 + 시트 구축 (6차)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### Context

정적 사이트만으로는 신청 접수 + 견적 발급 워크플로 구축 불가. Google 인프라(Sheets + Apps Script)로 빌드 도구 없이 풀 스택 운영.

#### Implementation

SPREADSHEET_ID 시트의 2개 시트 자동 초기화 (신청관리 20컬럼, 견적서발급관리 12컬럼). doPost/doGet 라우터에 7개 action: submit/confirm/saveQuote/updateAssignee/list/get/listQuotes. JSONP(callback) 지원 — CORS 우회. generateId — REQ-YYYYMMDD-NNNNN, QT-YYYYMMDD-NNNNN.

#### Key Code

**`appscript/Code.gs`**

```javascript
function generateId(prefix) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return prefix + '-' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '-' + Date.now().toString().slice(-5);
}
```

_타임스탬프 기반 ID — Date.now() 끝 5자리로 같은 날 충돌 방지_

#### Learnings

- GAS doPost는 application/x-www-form-urlencoded만 preflight 회피 — JSON body는 CORS 거부
- GAS 응답 JSON을 클라이언트가 fetch하면 발신자 origin 제약이 강해 JSONP fallback이 필요한 경우 종종 있음

---

### ✨ `feat(ui)`: 관리자 페이지 (admin.html) 신규 개발 (6차)

**Status:** `completed`  
**Files changed:** `admin.html`

#### Context

신청·견적 워크플로를 화면에서 관리할 수 있는 portal 필요. 다중 사용자(관리자/일반 담당자) 권한 분기, 견적 편집, 가격 계산, 장비 변경, 버전 관리까지.

#### Implementation

localStorage 기반 jhtech_users + isAdmin 플래그. editMode 조건 = isAssignedToMe && (!isConfirmed || isRevising). syncFormState()로 추가옵션 행 add/remove 전 DOM 상태 저장 — 체크박스 해제 버그 방지. basePrice(입력) + totalDisplay(표시) 분리 — 이중 계산 버그 방지. getNextVersion — QT-xxx → -R2 → -R3 자동 증가.

#### Problems & Solutions

**Problem:** 추가옵션 추가/삭제 시 포함옵션 체크가 모두 해제됨

- **Root cause:** renderDetail()이 DOM 재생성하면서 inc-opt 체크박스 상태 사라짐
- **Solution:** syncFormState() — 추가옵션 변경 전 .inc-opt:checked 수집 → currentReq.includeOpts에 저장 → renderDetail 후 복원
- **Prevention:** DOM 재생성 트리거하는 함수 호출 전 항상 상태 캡처

**Problem:** 가격 이중 계산

- **Root cause:** supplyPrice 단일 input에 합계가 다시 덮어쓰여짐 (recalcPrice 결과가 입력값 자리에 들어감)
- **Solution:** basePrice(장비가 입력) / totalDisplay(합계 표시) 분리. supplyPrice는 hidden + recalcPrice 결과로만 갱신
- **Prevention:** 입력 필드와 계산 결과 표시는 항상 분리

#### Learnings

- DOM 재생성 트리거 전 상태 캡처 패턴은 frameworks 없이도 매우 효과적
- 가격 입력 / 가격 표시는 반드시 다른 DOM 요소로 분리 — 같은 요소면 무한 갱신 가능성

---

### ✨ `feat(ui)`: 담당자 배정 기능 (7차)

**Status:** `completed`  
**Files changed:** `admin.html`, `appscript/Code.gs`

#### Context

여러 담당자가 운영하는 환경에서 신청별 담당자 배정 + 본인 담당 신청만 편집 가능한 권한 분기 필요.

#### Implementation

신청 목록 드롭다운 → updateAssignee action 호출 → 신청관리 시트 컬럼 20 저장. 저장 후 버튼이 '수정'으로 전환 (재클릭 시 드롭다운 활성). 조회 우선순위: 시트(r.assignee) → localStorage → 빈값. editMode 조건에 isAssignedToMe 통합.

---

### 🔧 `chore(deploy)`: GitHub Pages 배포 (8차)

**Status:** `completed`  
**Files changed:** `.gitignore`

#### Context

정적 사이트 + 빌드 도구 없는 구조 — GitHub Pages가 가장 자연스러운 호스팅.

#### Implementation

Git 저장소 초기화 + jhtechsmart-cloud/jhtechsmart 원격 연결. 파일명 영문화(장비 견적 요청 프로그램.html → quote.html, 관리자.html → admin.html). .gitignore에 .claude/ + 견적서/법인도장.png. GitHub Pages 활성화 (main/root). 접속: jhtechsmart-cloud.github.io/jhtechsmart/quote.html · admin.html.

---

### ✨ `feat(content)`: OG 메타태그 (카카오톡 공유) (9차)

**Status:** `completed`  
**Files changed:** `quote.html`, `admin.html`, `logo.png`

#### Context

카카오톡으로 신청 링크 공유 시 미리보기에 로고와 설명 표시 필요.

#### Implementation

양쪽 HTML에 og:type/title/description/image/url/site_name 추가. logo.png는 800×800 정사각형(1200×630은 카카오톡에서 잘림).

#### Learnings

- 카카오톡 미리보기는 정사각형 이미지가 가장 안전 (잘림 없음)

---

### 📝 `docs(content)`: quote.html 콘텐츠 개편 (10차)

**Status:** `completed`  
**Files changed:** `quote.html`

#### Context

사업 안내 내용을 더 명확하게 — 신청원칙 별도 섹션 삭제, 자가진단 단순화, 제출 후 완료 화면 표시.

#### Implementation

신청원칙 섹션 제거, 최대구입비 4,800만원 + VAT 480만원 표기, 유의사항 단락 → ul 4개, 신청자격 행 추가(10인 미만 / 2억 이상), 자가진단 부가세 항목 제거. 제출 후 견적신청 완료 화면 (업체명/연락처/장비/접수일시 표시).

---

### ✨ `feat(pdf)`: PDF 자동 저장 (Google Drive) (11차)

**Status:** `completed`  
**Files changed:** `admin.html`, `appscript/Code.gs`

#### Context

견적 확정 시 PDF를 자동으로 Drive에 보관 — 회계·법무 증빙 + 고객 공유 링크 즉시 생성.

#### Implementation

html2pdf.js를 CDN에서 동적 로드(loadHtml2Pdf). saveQuoteToDrive(html, quoteNo, company) — html2pdf로 PDF Blob 생성 → FileReader로 base64 → GAS saveQuote action POST. GAS handleSaveQuote는 base64 디코딩 → .pdf 파일 저장 → ANYONE_WITH_LINK VIEW 공유. 저장 경로: 재현테크_견적서/YYYY-MM/.

#### Problems & Solutions

**Problem:** PDF 빈 파일로 저장

- **Root cause:** html2pdf.js가 비동기인데 await 없이 다음 단계 진행
- **Solution:** PDF Blob 생성 완료 후 FileReader.onload 콜백 안에서 base64 인코딩 + POST
- **Prevention:** 라이브러리 동적 로드 후 함수 호출 시 항상 promise/await 확인

#### Learnings

- html2pdf.js는 outputPdf().blob() 같은 promise 체인 활용 필요 — fire-and-forget으로 호출하면 빈 파일 생성

---

## Changes Summary

### Added

- quote.html 5단계 위저드 (자가진단 → 정보입력 → 공정분석 → 장비선택 → 제출)
- admin.html 관리자 페이지 (로그인 + 신청목록 + 견적 편집 + 가격 계산 + 장비 변경)
- appscript/Code.gs GAS 백엔드 (7개 action 라우터, 시트 자동 초기화)
- 담당자 배정 기능 + editMode 권한 분기
- GitHub Pages 배포 + OG 메타태그
- PDF 자동 저장 (html2pdf.js + Drive)
- 장비 라인업 데이터 (프린터 11종 + 평판커팅기 4종)

### Fixed

- 추가옵션 변경 시 포함옵션 체크박스 해제 — syncFormState() 도입
- 가격 이중 계산 — basePrice / totalDisplay 분리
- 견적서 출력 시 supplyPrice=0 — basePrice input 없는 view 모드 처리
- 담당자 외 사용자 출력 시 본인 이름 표시 — r.assignee 우선 조회
- 평균매출 판정 부등호 반대 — avg > limit
- PDF 빈 파일 — html2pdf 비동기 콜백 안에서 POST

---

## Next Steps

- [ ] Google Apps Script 추가 견적 분석 자동화
- [ ] 장비 상세 스펙 팝업 / 표시

---

## References & Links

- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)

---

## Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 이 프로젝트는 빌드 도구 없는 정적 HTML + GAS + Sheets. quote.html(신청), admin.html(관리자), appscript/Code.gs(백엔드) 3파일이 핵심. 추가옵션 add/remove 전 syncFormState() 호출 필수. basePrice(입력) / totalDisplay(표시) 분리. CORS는 application/x-www-form-urlencoded로 회피. ID 형식 REQ-/QT-YYYYMMDD-NNNNN.

**Reusable patterns introduced today:**

- `DOM 재생성 전 상태 캡처 (syncFormState)` — renderDetail() 같은 DOM 재생성 함수 호출 전에 .inc-opt:checked 등을 메모리에 저장 → re-render 후 복원. frameworks 없이도 작동 (see `/Users/seonjecho/Projects/jhtechsmart/admin.html`)
- `GAS doPost JSONP fallback` — callback 파라미터 있으면 JSONP 응답으로 CORS 우회. 정적 사이트에서 GAS 호출 시 유용 (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `html2pdf.js CDN 동적 로드` — loadHtml2Pdf() — 한 번 로드 후 캐시. 견적서 출력 시점에만 로드해 첫 화면 빠르게 (see `/Users/seonjecho/Projects/jhtechsmart/admin.html`)
