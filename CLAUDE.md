# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

(주)재현테크의 **2026 소공인 스마트제조 지원사업** 견적 신청 및 관리 시스템. 정적 HTML 프런트엔드 + Google Apps Script(GAS) 백엔드 + Google Sheets/Drive 저장소 조합으로 동작한다. 빌드/번들/테스트 도구가 전혀 없는 단일 폴더 정적 사이트다.

- 배포: GitHub Pages (`https://jhtechsmart-cloud.github.io/jhtechsmart/`)
- 백엔드: Google Apps Script Web App (`Code.gs`)
- 스토리지: Google Sheets `1HoFkaRY0xOGEriXAjrQ7tyH9LOZ5UkPamyRzxc_W3Ts` + Google Drive `재현테크_견적서/YYYY-MM/`

## 파일 구조 (큰 그림)

세 개의 핵심 파일이 시스템 전체를 구성한다 — 빌드 산출물이 아닌 **편집 대상 원본**들이다.

| 파일 | 역할 | 라인수 |
|---|---|---|
| `quote.html` | 일반 신청자용 5단계 신청 위저드 (자가진단 → 정보입력 → 공정분석 → 장비선택 → 제출) | ~592 |
| `admin.html` | 담당자/관리자 포털: 로그인, 신청목록, 견적서 편집·확정·PDF 출력 | ~1742 |
| `Code.gs` | GAS 백엔드: doPost/doGet 라우터, 시트 읽기/쓰기, PDF Drive 저장 | ~415 |

`작업내역.md`는 11차에 걸친 변경 이력 + 버그수정 이력을 모은 일종의 changelog로, 새 작업 전에 반드시 참고할 것.

## 개발/배포 워크플로

빌드 단계 없음 — 파일을 편집하고 git push 하면 GitHub Pages가 자동 반영된다.

```bash
# 로컬 미리보기 (브라우저로 직접 열기)
open quote.html
open admin.html

# GAS 배포 (수동) — Apps Script 에디터에서 "배포 > 새 배포" 또는 "배포 관리"
#   배포 시 새 URL이 발급되면 quote.html 과 admin.html 두 곳 모두 갱신 필요
```

테스트 프레임워크/린터 없음. UI 변경 후에는 브라우저로 직접 동작 확인.

## 아키텍처 핵심 사항

### 1. 프런트엔드 ↔ GAS 통신

- `quote.html`은 신청 제출(`action=submit`)만 호출 → 단순 POST + URLSearchParams
- `admin.html`은 list/get/getVersions 조회용 fetch + confirm/saveQuote/updateAssignee/saveEquipConfig/saveUserConfig POST 호출
- GAS 응답은 기본 JSON. `?callback=xxx` 파라미터가 있으면 JSONP로 응답 (현재 코드는 거의 사용하지 않지만 GAS 측에 남아있음)
- **CORS 회피 수단**: 모든 POST는 `Content-Type: application/x-www-form-urlencoded`로 전송 → preflight 발생하지 않음. JSON body 사용 금지

### 2. GAS URL 단일 진실 소스 — `config.js`

GAS 배포 URL은 **`config.js` 한 파일에서만 관리**한다. 두 HTML이 모두 `<script src="config.js"></script>`로 로드한 후 `window.JHTECH_GAS_URL`을 참조한다.

- `config.js`의 `window.JHTECH_GAS_URL = '...'` ← **새 GAS 배포 시 여기만 수정**
- `quote.html` `const APPS_SCRIPT_URL = window.JHTECH_GAS_URL || '';` (line ~343)
- `admin.html` `const GAS_URL_DEFAULT = window.JHTECH_GAS_URL || '';` (line ~344)

⚠️ HTML의 두 상수에 옛 방식으로 URL을 다시 하드코딩하지 말 것 — `config.js` 분리 이전에 이미 동기화 누락으로 데이터 손실 위험이 있었음 (`docs/issues.md` 문제 1 참조).

`admin.html`은 추가로 localStorage `gasUrl` 키와 설정 화면 입력으로 사용자 오버라이드를 지원한다 (`getGasUrl()`). 폴백 우선순위: 입력값 → localStorage → `config.js`.

### 3. 데이터 모델 (Google Sheets = DB)

`Code.gs::initSheets()`가 정의하는 3개 시트:

- **신청관리** (21컬럼): 접수번호 / 접수일시 / 업체명 / ... / 상태 / 담당자 / 공정흐름도. `handleSubmit()`이 행 추가, `handleConfirm()`이 19번째 컬럼(상태) 갱신, `handleUpdateAssignee()`가 20번째 컬럼(담당자) 갱신
- **견적서발급관리** (13컬럼): 견적번호 / 접수번호 / ... / 담당자. 재발행 시 `(접수번호, 견적번호)` 일치 행을 갱신, 없으면 신규 추가
- **공급업체관리** (6컬럼): 장비ID / 장비명 / 카테고리 / 기본공급가액 / 포함옵션(파이프 구분) / 추가옵션(JSON). `getEquipConfig()` / `handleSaveEquipConfig()`로 read/write

ID 형식은 `generateId(prefix)` 산출 — `REQ-YYYYMMDD-NNNNN` (신청), `QT-YYYYMMDD-NNNNN` (견적). 같은 견적의 재발행은 `-R2`, `-R3` 접미사를 붙임 (`getNextVersion()` in `admin.html`).

### 4. 인증/사용자 관리

서버측 인증 없음 — `admin.html`이 localStorage `jhtech_users`로 계정을 관리하고 GAS의 `saveUserConfig`로 백업한다. 기본 시드 계정: `admin` (관리자), `park` (박현석), `lee` (이담당). `isAdmin` 플래그로 관리자/일반 분기.

견적서 편집 권한: `editMode = isAssignedToMe && (!isConfirmed || isRevising)`. 즉 담당자로 지정된 사용자만, 그리고 미확정이거나 재발행 모드일 때만 편집 가능.

### 5. PDF 생성 파이프라인 (admin.html)

확정 시 PDF가 Drive에 자동 저장된다. 흐름:

1. `confirmQuote()` → `syncToSheet('confirmed')` → `saveQuoteToDrive()`
2. `saveQuoteToDrive()`가 숨김 iframe을 만들고 그 안에 html2pdf.js를 CDN 동적 로드 (`prepareHtml` → `generatePdf`)
3. iframe 내부에서 견적서 HTML을 PDF Blob으로 변환 → FileReader로 base64 인코딩
4. GAS `action=saveQuote`에 `{pdf:base64, filename, company}` POST
5. `Code.gs::handleSaveQuote()`가 `Utilities.base64Decode` → DriveApp으로 `재현테크_견적서/YYYY-MM/업체명_YYYYMMDD.pdf` 저장 + `ANYONE_WITH_LINK` VIEW 권한 부여

iframe을 쓰는 이유는 메인 문서의 CSS와 격리해서 PDF 레이아웃이 의도대로 출력되게 하기 위함.

### 6. 견적서 편집의 상태 동기화 규칙 (자주 깨지는 부분)

추가옵션 행을 add/remove하기 전에는 **반드시 `syncFormState()`를 먼저 호출**하고 그 다음 `renderDetail()`을 호출해야 한다. 안 그러면 포함옵션 체크박스 상태가 DOM 재생성 과정에서 모두 풀려버린다.

또한 가격 계산은 **`basePrice`(장비 기본가 입력)와 `totalDisplay`(합계 표시)를 분리**해서 사용한다. 한 필드에 통합하면 `recalcPrice()` 결과가 입력값을 덮어 이중 계산이 발생한다 (작업내역.md 11차 버그 이력 참조).

견적서 출력 시 담당자 이름/연락처는 **`r.assignee` 우선 → `currentUser` 폴백** 순서로 조회한다. 무조건 `currentUser`를 쓰면 다른 담당자가 출력해도 항상 본인 이름이 찍히는 버그가 재발한다.

### 7. 신청 위저드 (quote.html) 검증 로직

`validateStep(n)`이 단계 전환·왼쪽 탭 클릭 양쪽에서 호출된다. 다음 단계로 가는 next 버튼뿐 아니라 step-tab 클릭에도 동일하게 적용되므로, 새 필수 항목을 추가할 때는 양쪽 경로가 동일하게 차단되는지 확인할 것.

평균매출 판정: 소공인 스마트제조 지원사업 기준상 **2억원 이상이 지원 대상**. `calcRevenue()`의 `ok = avg >= limit` 부등호 방향에 주의 (작업내역.md 5차 작업 참조 — 과거에 반대로 구현되어 수정한 적 있음).

## 보안 자산

- `견적서/법인도장.png` — `.gitignore`로 제외. 로컬에만 보관. admin.html 견적서 출력 시 이 이미지를 참조하므로 새 환경에서는 수동 배치 필요.
- 로그인 비밀번호는 localStorage에 평문 저장 — **신뢰된 단일 PC 환경**을 전제로 한 설계임을 인지할 것. 공용 PC 배포 시 별도 대책 필요.
- `SPREADSHEET_ID`는 코드에 노출되어 있지만 시트 자체는 GAS의 권한으로만 접근되므로 노출 위험은 제한적.

## 문서 작성 / 커밋 컨벤션

작업 후 `작업내역.md`에 차수별로 변경사항을 기록한다. 형식: `## N차 작업 — 제목`, 작업일·주요 파일 명시, 표/체크리스트로 변경 항목 정리. 버그 수정은 마지막 "버그 수정 이력" 표에 한 줄 추가.

커밋 메시지는 한국어 conventional 스타일을 따른다 (`feat:`, `fix:`, `config:`, `fix/feat:` 등). 최근 이력 참고: `eaad860 feat: 파일명 간소화, Drive 덮어쓰기, 버전이력 GAS 연동`.
