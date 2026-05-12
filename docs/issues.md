# 이슈 추적

> 작성일: 2026-05-11
> 분석 근거: `docs/code-analysis.md`
> 수정 원칙: 한 문제 해결 시 본 문서의 해당 섹션 하단에 ✅ "해결 내역"을 추가한다. 이후 작업자가 시간 흐름을 추적할 수 있도록 **삭제하지 말고 누적**한다.

---

## 우선순위 요약

| # | 문제 | 비즈니스 영향 | 수정 난이도 | 우선순위 | 상태 |
|---|---|---|---|---|---|
| 1 | GAS URL 이중 하드코딩 + 동기화 누락 | 신청 누락 가능 (데이터 손실) | 1줄 수정 | 🔴 즉시 | ✅ 해결 (2026-05-11) — 임시조치 + 근본조치(옵션 A: config.js 분리) 적용 |
| 2 | PDF 저장 경로/파일명 회귀 (작업내역 vs 실제 코드 불일치) | 회계·법무 증빙 누락 가능 | 정책 결정 + 1시간 | 🟡 정책 결정 후 | ✅ 해결 (2026-05-12) — 파일명에 버전 포함, 옛 버전 보존 |
| 3 | 신청 제출 응답 미수신 (silent failure) | 신청자 신뢰 손상, 누락 신청 추적 불가 | 1~2시간 | 🟡 2주 내 | ⛔ 미착수 |
| 4 | 백엔드 권한 검증 부재 (누구나 GAS 직접 호출 가능) | 개인정보·계정 평문 노출 | 반나절 | 🔴 이번 주 | ⚠ 테스트 중 (2026-05-12, 13차) — 토큰 인증 + 권한 필터 도입. 운영 적용 대기 |
| 5 | 견적 버전 이력의 이중 저장소 (localStorage가 dead code) | 코드 가독성 저하, 미미 | 30분 | 🟢 여유 시 | ⛔ 미착수 |
| 6 | 버전 이력이 `renderDetail` 재호출 시 사라짐 (UI 버그) | 사용자 혼란, 이력 가시성 손실 | 1~5줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-11) — 옵션 B (단순 + race condition) 적용 |
| 7 | 폴링 후 currentReq가 사라져도 우측 패널이 옛 데이터 유지 | 데이터-화면 불일치, 사용자 혼란 | 6줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-11) — 삭제 케이스 우측 패널 리셋 |
| 8 | 신청관리 시트 헤더 누락 (담당자/공정흐름도 헤더 미존재) | 시트 가독성·신뢰성 저하 | 5줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-12) — initSheets 마이그레이션 보강 |
| 9 | 신청관리 시트 담당자 컬럼에 ID 저장 (이름이 와야 함) | 시트만 보면 누가 담당인지 모름 | 8줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-12) — assigneeName 전송 + GAS 측 이름 우선 저장 |
| 10 | 견적서발급관리 시트: 확정된 행을 후속 동작이 덮어쓸 가능성 | 이력 손실 위험 | 4줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-12) — confirmed 행은 절대 갱신 안 함 (handleConfirm 보호) |
| 11 | 견적번호에 버전 정보 없음 (R00/R01 라벨만 별도 산출) | 시트만 보면 어떤 버전인지 즉시 식별 불가 | 30줄 | 🟡 정책 변경 | ✅ 해결 (2026-05-12) — `YYMMDD-NNNN-v1` 형식, -v2/-v3 ... |
| 12 | 담당자관리: 직책 컬럼 분리 + 코드 하드코딩 시드 | 시트가 단일 진실 소스 아님 | 30줄 | 🟡 단순 수정 | ✅ 해결 (2026-05-12) — 6컬럼(직책은 이름에 통합), DEFAULT_USERS 제거 |

## 기능 개선 (사용자 요청)

| # | 항목 | 상태 |
|---|---|---|
| F1 | 신청 클릭 시 버전 이력 즉시 표시 (`listRequests`에 versions 임베드) | ✅ 해결 (2026-05-11) |
| F2 | 로그인 시 자동 목록 로드 (수동 새로고침 불필요) | ✅ 해결 (2026-05-11) |
| F3 | 60초 폴링 + visibilitychange 자동 갱신 | ✅ 해결 (2026-05-11) |
| F4 | 마지막 갱신 시각 표시 ("X초 전 갱신") | ✅ 해결 (2026-05-11) |
| F5 | 버전 이력 표 "변경 정보" 버튼 + diff 모달 | ✅ 해결 (2026-05-11) |
| F6 | 버전 이력 1개부터 표시 (최초 v1도 견적완료 화면에 노출) | ✅ 해결 (2026-05-12) |
| F7 | 버전 이력 행 클릭 → 우측 패널이 그 버전 견적 상세로 갱신 (읽기 전용) | ✅ 해결 (2026-05-12) |
| F8 | 신청중 첫 클릭 시 포함옵션 전체 자동 체크 | ✅ 해결 (2026-05-12) |
| F9 | 추가옵션 마지막 행 높이 통일 (CSS `:last-child` 셀렉터 한정) | ✅ 해결 (2026-05-12) |
| F10 | Drive 저장 완료 초록 토스트 제거 (오해 유발 링크) | ✅ 해결 (2026-05-12) |
| F11 | 변경정보 모달의 추가옵션 행 — 이전/변경 후 두 열 단순 비교 (강조·삭선 제거) | ✅ 해결 (2026-05-12) |
| F12 | 견적금액 카드의 '저장' 버튼 제거 (임시저장/견적확정으로만 시트 기록) | ✅ 해결 (2026-05-12) |
| F13 | 세션 자동 로그인 유지 (새로고침 시 로그아웃 방지) — sessionStorage 기반 | ✅ 해결 (2026-05-12) |
| F14 | 버전 이력 행 클릭 시 상단 노란 배너 제거 → 단색 SVG 눈 아이콘 + 옅은 노란 배경으로 단순화 (최신 버전 강조도 제거) | ✅ 해결 (2026-05-12) |
| F15 | 상단 GAS URL 줄 제거 + 직인 설정을 관리자 모달의 신규 탭으로 이동 (모달 3탭 구성) | ✅ 해결 (2026-05-12) |
| F16 | 견적서 PDF의 견적번호 옆 둥근 버전 라벨 제거 (견적번호 자체에 `-v1` 포함) | ✅ 해결 (2026-05-12) |
| F17 | 장비사진 PDF에 이미지 누락 → XHR + responseType:'blob' 인라이닝. 로컬 file:// 테스트는 Chrome CORS로 불가 → 로컬 HTTP 서버 사용 안내 | ✅ 해결 (2026-05-12) |
| F18 | 전체 UI 리뉴얼 — Enterprise CPQ 디자인 (좌우 2단 + sticky 우측 Quote Summary). Salesforce/HubSpot/Pipedrive 패턴 참고 | ✅ 해결 (2026-05-12) |
| F19 | 헤더 — 로고(jhtech.co.kr `logo280.png`) + "디지털 프린팅의 중심" 태그라인 + "견적 관리" 역할 라벨 | ✅ 해결 (2026-05-12) |
| F20 | 사이드바 — 중앙/우측 카드와 통일감(세로 막대 헤더, pill 탭, 카드형 항목, 그림자/hover transform) | ✅ 해결 (2026-05-12) |
| F21 | 신청기업 정보 — 3열 grid + 인라인 담당자(아바타) + 문제공정/도입목적/quote-issue 박스 간격 조정 | ✅ 해결 (2026-05-12) |
| F22 | 선택 장비 — 4:3 hero 사진 + 카테고리 pill + 26px 모델명 + spec 테이블 + 카드 footer에 select/quote-no-pill | ✅ 해결 (2026-05-12) |
| F23 | Quote Summary (우측 sticky) — itemized 라인 + 장비/옵션 **소계 박스** 명확히 구분 + 노란 합계 박스 + 메타(발급/유효/담당) | ✅ 해결 (2026-05-12) |
| F24 | 영업일지 — 우측 sticky 패널로 이동, 노란 톤 → 차분한 톤(흰색+옅은 그레이) | ✅ 해결 (2026-05-12) |
| F25 | recalcPrice 강화 — 장비 소계 / 옵션 소계 / 옵션 개수 / 합계 / 상단 배너 합계 실시간 동기화 (기존엔 basePrice 변경 시 합계 미갱신 버그도 함께 수정) | ✅ 해결 (2026-05-12) |
| F26 | 첫 로그인 시 데이터 로딩 오버레이 — 중앙 카드 + 회전 링 스피너 + 진행 라벨 (silent 폴링/visibilitychange엔 미표시) | ✅ 해결 (2026-05-12) |
| F27 | **문제 4 해결** — 백엔드 권한 검증 부재. HMAC-SHA256 토큰 인증 + GAS 측 권한 필터 + 비밀번호 마스킹 도입 (B안 / 13차 작업) | ⚠ 테스트 환경 검증 중 (운영 미적용) |
| F28 | 시트 컬럼 담당자 데이터를 이름→ID로 전환. 한글 비교 이슈(NFC/NFD, 공백) 회피. `migrateAssigneeNameToId` 마이그레이션 함수 제공 | ⚠ 테스트 환경 검증 중 |
| F29 | 로그아웃 후 다른 사용자 로그인 시 이전 사용자 데이터 흔적 차단 (`_clearScreen`: 메모리 + DOM + sessionStorage 완전 정리) | ⚠ 테스트 환경 검증 중 |
| F30 | SPREADSHEET_ID를 GAS Script Properties로 분리 — 운영/테스트 GAS 자동 분기, 코드에 시트 ID 박지 않음 | ⚠ 테스트 환경 검증 중 |
| F31 | 토큰의 옛 사용자 정보 보정 — 백그라운드 fetch로 _memUsers 갱신 시 currentUser.name·phone + 헤더 자동 갱신 | ⚠ 테스트 환경 검증 중 |
| F32 | 로딩 속도 최적화 — handleLogin 응답 축소(rows만) + 백그라운드 fetch + equipConfig 캐시 + 단계별 로딩 메시지 | ⚠ 테스트 환경 검증 중 |

---

## 문제 1. GAS URL 이중 하드코딩 + 동기화 누락

### 1.1 현재 상태 (Problem)

두 파일이 **서로 다른 GAS 배포**를 가리킴.

| 파일 | 라인 | 상수명 | URL 끝부분 |
|---|---:|---|---|
| `quote.html` | 342 | `APPS_SCRIPT_URL` | `…AKfycbzcl9GZ…wxhl/exec` (옛 배포) |
| `admin.html` | 343 | `GAS_URL_DEFAULT` | `…AKfycbwuHdUnuGci…0j/exec` (최신 배포) |

git 이력 증거:
```
1aaad3b  config: GAS 배포 URL 업데이트  (admin.html | 2 +-)   ← 1개 파일만 수정
72a9df9  config: GAS 배포 URL 업데이트  (admin.html | 2 +-)   ← 1개 파일만 수정
729f01e  PDF 자동 저장 기능 추가 및 GAS URL 업데이트   ← quote.html이 마지막으로 갱신된 시점
```

→ 최근 두 차례 GAS 재배포 시 `admin.html`만 갱신되고 `quote.html`은 누락됨.

### 1.2 영향 (Impact)

- **시나리오 A**: 옛 배포가 살아있고 같은 SPREADSHEET_ID를 본다면, 옛 배포의 스키마로 데이터가 쓰여 컬럼 매핑이 어긋날 수 있음 → `listRequests()`의 `r[18]=상태`, `r[19]=담당자`, `r[20]=공정흐름도` 인덱스가 깨짐.
- **시나리오 B**: 옛 배포가 비활성/삭제됐다면 신청 자체가 시트에 들어오지 않음. `quote.html::requestQuote()`는 응답을 읽지 않으므로 신청자는 ✅ 완료 화면을 보지만 실제로는 ❌ 데이터 손실.
- **시나리오 C**: 두 배포가 다른 SPREADSHEET_ID를 본다면 신청은 옛 시트에 쌓이고 관리자는 새 시트만 봄.

### 1.3 수정 방안 (Plan)

**즉각 조치**: `quote.html` line 342의 `APPS_SCRIPT_URL`을 `admin.html`의 `GAS_URL_DEFAULT`와 동일하게 교체.

**근본 해결 (추후)**: GAS URL을 단일 진실 소스로 통합.
- 옵션 1: `config.js` 분리 → 두 HTML이 모두 `<script src="config.js">`로 로드, `window.JHTECH_GAS_URL` 사용
- 옵션 2: 배포 전 sed 일괄 치환 스크립트 추가

### 1.4 ✅ 해결 내역

#### 2026-05-11 — 임시조치 (URL 동기화)

**조치**
- `quote.html` line 342의 `APPS_SCRIPT_URL` 값을 `admin.html` line 343의 `GAS_URL_DEFAULT`와 동일하게 교체.

**변경 diff**
```diff
- const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzcl9GZ--OaM7DkcxYcteRbE843Jnq75KnfipLuD7ixBBRXnOxCuQuTZB96eWSwrxhl/exec';
+ const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwuHdUnuGci3QTkPg1G75WCmHM-N3teWyyWuY72_09NMza-QSH8zIsHhVuz8zimTk0j/exec';
```

**검증 방법 (배포 전 권장)**
1. 로컬에서 `quote.html`을 브라우저로 열고 5단계까지 진행 후 신청 제출.
2. Google Sheets `신청관리` 시트에 새 행이 추가됐는지 확인.
3. 새 행의 21번째 컬럼(공정흐름도)에 입력값이 정상 매핑되는지 확인 (옛 GAS는 이 컬럼이 없을 수 있음).
4. 같은 신청건이 `admin.html`의 신청 목록에도 즉시 표시되는지 확인.

**검증 결과**: (배포 후 사용자가 확인 — 결과 기재 필요)

**제한 사항**
- 이번 조치는 **현상 동기화**만 했음. GAS URL이 두 파일에 하드코딩된 구조 자체는 그대로이므로 다음 GAS 재배포 시 동일한 누락이 재발할 위험이 남아있음.
- 근본 조치(아래)는 사용자 결정 대기 중.

#### 근본 조치 후보 (미적용)

- **옵션 A — `config.js` 분리** ✅ 채택
  - `quote.html`, `admin.html` 모두 `<script src="config.js"></script>` 로드
  - `config.js`에 `window.JHTECH_GAS_URL = '...'` 단일 정의
  - 두 HTML은 `const APPS_SCRIPT_URL = window.JHTECH_GAS_URL;` 형태로 참조
  - 장점: 직관적, 빌드 도구 불필요
  - 단점: GitHub Pages에 `config.js` 누락 시 즉시 장애 (캐시 문제 주의)
- **옵션 B — 배포 전 sed 일괄 치환 스크립트** (미채택)
  - `Makefile` 또는 `scripts/update-gas-url.sh` 추가
  - `make set-gas-url URL=...` 한 명령으로 두 파일 동시 갱신
  - 장점: 런타임 의존성 없음
  - 단점: 명령을 잊으면 똑같이 누락 가능

#### 2026-05-11 — 근본조치 (config.js 분리)

**조치**

1. **`config.js` 신규 생성** (프로젝트 루트):
   ```javascript
   window.JHTECH_GAS_URL = 'https://script.google.com/macros/s/AKfycbwuHdUnuGci.../exec';
   ```

2. **`quote.html`** (line 341-343):
   ```diff
   + <script src="config.js"></script>
     <script>
   - const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwuHdUnuGci.../exec';
   + const APPS_SCRIPT_URL = window.JHTECH_GAS_URL || '';
   ```

3. **`admin.html`** (line 259, line 344):
   ```diff
   + <script src="config.js"></script>
     <script>
     ...
   - const GAS_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbwuHdUnuGci.../exec';
   + const GAS_URL_DEFAULT = window.JHTECH_GAS_URL || '';
   ```

**향후 GAS 재배포 운영 절차**

새 GAS 배포 URL을 받으면 **`config.js` 한 파일만** 수정하고 git push 한다:
```bash
# config.js 의 JHTECH_GAS_URL 값을 새 URL로 교체
git add config.js
git commit -m "config: GAS 배포 URL 업데이트"
git push
```
→ `quote.html` / `admin.html`은 더 이상 GAS URL 갱신 시 건드리지 않는다.

**검증 방법 (배포 전 권장)**

1. 로컬에서 `quote.html`을 브라우저로 열고 개발자 도구 콘솔에서 `window.JHTECH_GAS_URL`이 출력되는지 확인 — `undefined`면 `config.js` 로드 실패.
2. `admin.html`도 동일하게 콘솔에서 확인.
3. 정상 로드 시 `quote.html` 신청 제출 → Sheets `신청관리`에 행 추가 확인.
4. `admin.html` 로그인 → `?action=list` 호출 정상 확인 (개발자 도구 Network 탭).

**검증 결과**: (배포 후 사용자가 확인 — 결과 기재 필요)

**알려진 한계 (운영 시 주의)**

- **캐시 문제**: GitHub Pages는 정적 자산을 캐싱한다. `config.js`만 갱신하고 push해도 사용자 브라우저가 옛 `config.js`를 사용할 수 있음.
  - 단기 해결책: 강력 새로고침 안내 (Ctrl+Shift+R / Cmd+Shift+R).
  - 장기 해결책 (필요 시): HTML에서 `<script src="config.js?v=20260511"></script>` 형태로 버전 쿼리스트링 부여하고 GAS 갱신 때마다 함께 변경.
- **`config.js` 누락 시 동작**: 두 HTML 모두 `window.JHTECH_GAS_URL || ''` 폴백을 두었으므로, `config.js` 로드 실패 시 `APPS_SCRIPT_URL`이 빈 문자열이 되어:
  - `quote.html`: `requestQuote()` 진입부의 `if(!APPS_SCRIPT_URL)` 가드가 작동해 사용자에게 alert 표시.
  - `admin.html`: localStorage `gasUrl` 또는 설정 화면 입력값을 폴백으로 사용 가능 (기존 동작 유지).
- **두 페이지가 같은 디렉터리에 배포되어야 함**: GitHub Pages 기준 `quote.html`, `admin.html`, `config.js`가 같은 경로에 있어야 상대 경로 `src="config.js"`가 동작함. 현재 모두 루트에 배포되므로 문제 없음.

---

## 문제 6. 버전 이력이 `renderDetail` 재호출 시 사라짐 (UI 버그)

### 6.1 현재 상태 (Problem)

견적완료 신청을 클릭하면 우측 패널에 **버전 이력 표**가 일시적으로 표시되지만, 이후 사용자가 어떤 액션(담당자 수정/저장, 옵션 추가/삭제, 견적 확정/수정 모드 진입 등)을 취하면 **이력 표가 사라진다**.

**근본 원인**: `renderDetail()`이 우측 패널을 통째로 재생성하면서 `<div id="versionHistorySection"></div>`를 빈 채로 새로 만들지만, **재생성 후 `renderVersionHistory()`를 다시 호출하지 않는다**.

**관련 코드:**
- `admin.html::selectReq()` (line 661-670): 신청 클릭 → `_reqVersions = []` → `renderDetail()` (빈 div 생성) → `loadVersionsForReq(id)` 비동기 시작
- `admin.html::loadVersionsForReq()` (line 672-682): GAS 응답 도착 시 `_reqVersions = res.rows` → `renderVersionHistory()` 호출 → 표 그림 (✅ 표시)
- `admin.html::renderDetail()` (line 749): 패널 템플릿 안에 `<div id="versionHistorySection"></div>` 빈 채로 포함 — **`renderVersionHistory()` 호출 없음**

**`renderDetail()`이 재호출되는 7곳** (호출 즉시 이력 사라짐):

| 라인 | 트리거 |
|---|---|
| 328 | `editAssignee()` / `saveAssignee()` 후 (담당자 수정/저장) |
| 941 | `addExtraOpt()` (추가옵션 추가) |
| 945 | `removeExtra()` (추가옵션 삭제) |
| 1028 | `confirmQuote()` (견적 확정) |
| 1230 | `startRevise()` (수정 시작) |
| 1235 | `cancelRevise()` (수정 취소) |
| 1255 | `confirmRevise()` (수정 확정) |

### 6.2 영향 (Impact)

- **이력 가시성 손실**: 재발행된 견적의 R00, R02 같은 과거 버전 정보가 화면에서 사라져 담당자가 "이 견적은 1개 버전만 있나?"로 오해할 수 있음.
- **재발행 작업 흐름에 직접 영향**: 담당자가 수정 모드에 진입하는 순간(`startRevise`) 이력이 사라지므로, "이전 버전 금액과 비교"가 불가능해진다.
- **부수 위험 (race condition)**: 빠른 연속 클릭 시 다른 신청의 이력이 잘못 표시될 수 있음 (응답 순서 역전).

### 6.3 수정 방안 (Plan)

**옵션 A — 단순 (1줄)**

`renderDetail()`의 마지막 줄에 `renderVersionHistory()` 호출 추가:
```javascript
function renderDetail(){
  // ... 기존 코드 ...
  renderVersionHistory();   // ← 추가
}
```
`_reqVersions`는 `selectReq` 외에는 비워지지 않으므로, renderDetail 재호출 시 자동으로 다시 그려짐.

**옵션 B — Race condition까지 방어 (5줄)**

옵션 A + `loadVersionsForReq`에 응답 도착 시점 검증 추가:
```javascript
async function loadVersionsForReq(reqId){
  const url = getGasUrl();
  if(!url) return;
  try{
    const res = await fetch(`${url}?action=getVersions&id=${encodeURIComponent(reqId)}`).then(r=>r.json());
    if(currentReq?.id !== reqId) return;   // ← 응답 늦게 도착했고 다른 신청으로 이동했으면 무시
    if(res && Array.isArray(res.rows) && res.rows.length > 0){
      _reqVersions = res.rows;
      renderVersionHistory();
    }
  }catch(e){ console.warn('loadVersionsForReq:', e); }
}
```

### 6.4 ✅ 해결 내역

#### 2026-05-11 — 옵션 B 적용 (단순 수정 + race condition 방어)

**조치 1: `renderDetail()` 마지막에 `renderVersionHistory()` 호출 추가** (admin.html line 920-921)

```diff
   recalcPrice();
+  renderVersionHistory();
 }
```

`_reqVersions`는 `selectReq` 외에는 비워지지 않으므로, renderDetail 재호출 시(담당자 수정/저장, 옵션 추가/삭제, 견적 확정/수정 모드 진입 등 7곳) 자동으로 버전 이력이 다시 그려진다.

**조치 2: `loadVersionsForReq()`에 응답 시점 검증 추가** (admin.html line 677)

```diff
 async function loadVersionsForReq(reqId){
   const url = getGasUrl();
   if(!url) return;
   try{
     const res = await fetch(`${url}?action=getVersions&id=${encodeURIComponent(reqId)}`).then(r=>r.json());
+    if(currentReq?.id !== reqId) return; // 응답 늦게 도착 + 다른 신청으로 이동했으면 무시
     if(res && Array.isArray(res.rows) && res.rows.length > 0){
       _reqVersions = res.rows;
       renderVersionHistory();
     }
   }catch(e){ console.warn('loadVersionsForReq:', e); }
 }
```

빠른 연속 클릭 시 늦게 도착한 응답이 현재 보고 있는 신청과 무관한 데이터를 덮어쓰는 race condition을 차단한다.

**검증 방법 (배포 전 권장)**

1. 견적완료 상태 + 2개 이상 버전을 가진 신청을 클릭 → 버전 이력 표 표시 확인.
2. 같은 신청에서 담당자 "수정" 클릭 → 이력이 사라지지 않는지 확인.
3. "수정 모드" 진입(`startRevise`) 후에도 이력이 유지되는지 확인.
4. 빠르게 두 신청을 연속 클릭 → 다른 신청의 이력이 잘못 표시되지 않는지 확인.

**검증 결과**: (배포 후 사용자 확인)

**관련 파일**: `admin.html` (2줄 추가)

---

## 기능 개선 F1~F5. 자동 동기화 + 즉시 표시 + 변경 정보 (2026-05-11)

### 배경

사용자 요구사항 5가지:
1. 로그인 시 목록 자동 로드 (사용자 간섭 최소화)
2. 사용자가 필요할 때만 수동 새로고침 (기존 버튼 유지)
3. 화면 이탈 후 복귀 시 자동 갱신
4. 시트 응답 들어오면 바로 화면 갱신 (실시간성)
5. 견적완료 항목 클릭 시 버전 정보와 다른 모든 정보를 **즉시** 확인 (수정 시도 동일)

추가 요구: 버전 이력 각 행에 "변경 정보" 버튼 → 어떤 내용/시간/금액이 변경됐는지 모달로 확인.

### F1. 견적 버전 즉시 표시 — 옵션 B (listRequests에 versions 임베드)

**문제 (이전)**: `selectReq` → `renderDetail`(즉시) → `loadVersionsForReq`(별도 GAS 호출, 300~1500ms 지연) → `renderVersionHistory`. 우측 패널은 즉시 떠도 버전 이력은 늦게 나타남.

**조치**:
- **`appscript/Code.gs::listRequests()`** — 각 신청 행에 `versions[]` 배열 임베드. 더불어 quoteMap을 "마지막 행 덮어쓰기"가 아닌 **명시적 quoteNo 정렬 기반 최신 버전** 선정으로 안정화. `issuedAt`/`validUntil`은 `yyyy-MM-dd HH:mm` / `yyyy-MM-dd` 형식으로 사전 포매팅 (기존 `2026-05-09T05:45:00.000Z` ISO 표기 문제도 해소).
- **`admin.html::selectReq()`** — `_reqVersions = currentReq.versions || []` 로 즉시 세팅. `loadVersionsForReq(id)` 호출 제거 (함수 정의는 안전망으로 보존).

**효과**: 클릭 → 버전 이력 + 우측 패널 한꺼번에 0ms 지연으로 표시. 견적 수정 시(`startRevise`)에도 동일하게 즉시 표시.

### F2. 로그인 시 자동 로드

**조치**: `doLogin()` 성공 분기 끝에 `loadRequests()` + `startAutoRefresh()` 호출. 사용자가 더 이상 "데이터 불러오기" 버튼을 누를 필요 없음.

### F3. 60초 폴링 + visibilitychange 자동 갱신

**조치**: 신규 함수 `startAutoRefresh()` / `stopAutoRefresh()` 추가.
- `setInterval` 60초 — 탭이 visible 상태일 때만 `loadRequests({silent:true})` 호출
- `visibilitychange` 리스너 — 탭 복귀 시 마지막 갱신 후 5초 이상 경과한 경우에만 추가 갱신 (throttle)
- `logout()` 시 `clearInterval` + `removeEventListener`로 정리

**편집 보호**: `loadRequests`가 `allRequests`를 갱신해도 `currentReq` 참조는 유지. 사용자가 편집 중인 견적이 도중에 덮어써지지 않음. 단, **현재 보고 있는 신청의 `versions` 배열만은 새 데이터로 동기화** — 다른 담당자가 새 버전을 추가하면 이력 표에 즉시 반영됨.

### F4. 마지막 갱신 시각 표시

**조치**:
- 헤더에 `<span id="lastRefreshLabel">` 신규 추가 (로그인 사용자명 옆)
- `_lastRefreshAt` 변수 + `updateLastRefreshDisplay()` 함수
- 10초마다 표시 갱신: "방금 갱신" / "X초 전 갱신" / "X분 전 갱신" / "X시간 전 갱신"

### F5. 버전 이력 "변경 정보" 버튼 + diff 모달

**조치**:
- 버전 이력 표에 "변경 정보" 컬럼 추가 (각 행 오른쪽 끝)
- 첫 버전(R00)은 비교 대상 없으므로 비활성 "최초" 라벨
- 신규 함수: `showVersionDiff()`, `closeVersionDiff()`, `computeVersionDiff()`, `renderDiffHtml()`
- 모달 HTML을 `</body>` 직전에 신규 삽입

**Diff 계산 항목**:
- 단일 값: 장비 / 공급가액 / 부가세 / 합계금액 / 유효기간 / 담당자 / 상태
- 배열: 포함옵션 (추가/삭제 색상 구분)
- 객체 배열: 추가옵션 (추가/삭제/금액변경 + 차액 표시)

**시각적 구분**:
- 추가: 초록 (`#059669`) "+"
- 삭제: 빨강 (`#dc2626`) "−" + 취소선
- 금액 증감: `(+1,500,000원)` 빨강 / `(-500,000원)` 초록

### 변경된 파일

| 파일 | 변경 |
|---|---|
| `appscript/Code.gs` | `listRequests()` 36줄 변경 (사용자가 GAS 콘솔에서 적용 + "기존 배포 편집 → 새 버전" 배포) |
| `admin.html` | 약 245줄 추가/수정 (state vars, 자동갱신, diff 모달, 버전 표 컬럼 등) |

### 검증 체크리스트

1. ✅ 시크릿 모드에서 GAS `?action=list` 응답에 `versions` 배열 + `yyyy-MM-dd HH:mm` 날짜 형식 확인 완료
2. (사용자 검증) 로그인 시 별도 버튼 없이 목록 자동 표시
3. (사용자 검증) 견적완료 신청 클릭 → 버전 이력이 우측 패널과 동시에 표시 (지연 없음)
4. (사용자 검증) 헤더에 "X초 전 갱신" 표시
5. (사용자 검증) 다른 탭 갔다가 돌아오면 자동 갱신
6. (사용자 검증) 시트에 신청 추가 → 60초 내 화면에 자동 반영
7. (사용자 검증) 견적 수정 모드 진입 후에도 버전 이력 즉시 표시
8. (사용자 검증) "변경 정보" 버튼 클릭 → 모달에 변경 항목 정상 표시 (R00은 "최초" 비활성, R01~ 클릭 시 모달)

### 부수 효과

- **문제 5와 연관**: `loadVersionsForReq()`가 이제 어디서도 호출되지 않음 → 더 명확한 dead code. 차후 정리 시 이 함수도 함께 제거 가능.
- **문제 6 보강**: 이전에 적용한 "renderDetail 끝에 renderVersionHistory 호출" 수정과 결합되어, 어떤 동작 후에도 버전 이력이 항상 정확하게 표시됨.

---

## 문제 7. 폴링 후 currentReq 사라져도 우측 패널이 옛 데이터 유지 (UI 동기화 버그)

### 7.1 현재 상태 (Problem)

폴링(또는 visibilitychange)으로 `loadRequests()`가 호출돼 `allRequests`가 갱신될 때, **현재 보고 있는 신청(`currentReq`)이 새 데이터에 더 이상 존재하지 않으면**(예: 다른 사용자가 시트에서 삭제) 좌측 사이드바는 빈 목록으로 그려지지만 **우측 `mainArea`는 옛 HTML 그대로 유지**됨.

**근본 원인**: `loadRequests` 갱신 분기에서 `currentReq`가 새 데이터에 있는지 확인하지만, **없을 때의 처리 분기가 비어있음**.

```javascript
if(currentReq){
  const fresh = allRequests.find(r => r.id === currentReq.id);
  if(fresh) currentReq.versions = fresh.versions || [];
  // ⚠️ fresh === undefined인 경우 처리 없음
}
```

### 7.2 영향 (Impact)

- **좌측-우측 불일치**: 사이드바엔 아무것도 없는데 우측엔 신청 정보가 그대로 떠있어 사용자 혼란 유발.
- **삭제된 신청에 대한 액션 가능성**: 사용자가 우측 패널의 "확정" 등 버튼을 누르면 이미 시트에 없는 ID로 GAS 호출 → 에러 또는 ghost 동작.
- **재현 시나리오**: 시트에서 데이터 일괄 삭제, 다른 관리자가 한 신청만 삭제, 신청 자체가 어떤 사유로 사라진 경우 등.

### 7.3 ✅ 해결 내역

#### 2026-05-11 — 삭제 케이스 우측 패널 리셋 (최소 수정)

**조치**: `loadRequests` 갱신 분기에 else 처리 추가 (admin.html line ~656).

```diff
   if(currentReq){
     const fresh = allRequests.find(r => r.id === currentReq.id);
-    if(fresh) currentReq.versions = fresh.versions || [];
+    if(fresh){
+      currentReq.versions = fresh.versions || [];
+    } else {
+      // 시트에서 삭제됨 → 우측 패널을 placeholder로 리셋
+      currentReq = null;
+      _reqVersions = [];
+      const mainEl = document.getElementById('mainArea');
+      if(mainEl) mainEl.innerHTML = '<div class="placeholder">...</div>';
+    }
   }
```

**검증 방법**:
1. 신청 한 건 클릭하여 우측에 표시
2. 시트에서 해당 신청 행 삭제
3. 60초 폴링 또는 탭 복귀 발생 시점에 좌측 + 우측이 동시에 비워짐 확인

**검증 결과**: (사용자 확인 — 결과 기재 필요)

**알려진 한계 (이번 수정에서 다루지 않음)**:
- 사용자가 currentReq를 편집 중인 상태에서 다른 관리자가 그 신청을 삭제하면 편집 내용이 경고 없이 사라짐. 편집 중 보호 토스트는 별도 결정 후 적용.
- 삭제는 아니고 `status`/`assignee` 등 다른 필드만 변경된 경우는 여전히 우측 패널에 stale data가 표시됨. 사용자가 다시 클릭하면 갱신됨. 자동 동기화는 별도 결정 사안.

---

## 2026-05-12 일괄 수정 (문제 2, 8~12 + 기능개선 F6~F9)

### 변경 요약

사용자 검증 중 발견한 시트·웹페이지 이슈를 한 회차에 일괄 정리. 신청 데이터 흐름, 견적 버전 식별, 담당자 단일 소스 정책, PDF 보존 정책을 정비.

### 8. 신청관리 시트 헤더 누락 — 마이그레이션 로직 추가

**문제**: `initSheets()`가 헤더를 채우는 조건이 `s1.getLastRow() === 0`이라 기존 데이터가 있는 시트에는 20·21번 컬럼(`담당자`, `공정흐름도`) 헤더가 채워지지 않음. 사용자가 시트를 보면 `상태` 컬럼 옆에 헤더 없는 빈 칸 두 개가 보임.

**조치**: `appscript/Code.gs::initSheets()` 신청관리 분기에 마이그레이션 로직 추가. 기존 시트라도 헤더 행을 점검해 빠진 헤더만 채움. `견적서발급관리` 시트가 이미 동일 패턴(13번 컬럼)으로 처리되던 것을 21컬럼 전체로 일반화.

```diff
- if (s1.getLastRow() === 0) {
-   s1.appendRow([…21개…]);
-   s1.getRange(1, 1, 1, 21).setFontWeight('bold').setBackground('#f3f7fb');
- }
+ if (s1.getLastRow() === 0) {
+   s1.appendRow(s1Headers);
+   s1.getRange(1,1,1,s1Headers.length).setFontWeight('bold')…
+ } else {
+   const curHeaders = s1.getRange(1,1,1,s1Headers.length).getValues()[0];
+   s1Headers.forEach((h, idx) => {
+     if (!curHeaders[idx]) s1.getRange(1, idx+1).setValue(h).setFontWeight('bold')…
+   });
+ }
```

**검증**: GAS 콘솔에서 `initSheets()` 1회 실행 → 신청관리 시트의 J/U 컬럼 옆 빈 헤더에 `담당자`, `공정흐름도`가 채워짐.

### 9. 신청관리 담당자 컬럼: ID → 이름

**문제**: `handleUpdateAssignee()`가 `data.assignee`(userId) 그대로 시트 컬럼 20에 기록 → 시트만 보면 `admin`, `park` 같은 ID여서 누가 담당인지 알 수 없음.

**조치**:
- `admin.html::saveAssignee()` — GAS에 `assigneeName`도 함께 전송 (`getUsers()`에서 이름 조회).
- `appscript/Code.gs::handleUpdateAssignee()` — `data.assigneeName || data.assignee` 우선순위로 저장.

기존에 ID로 저장된 행은 해당 신청에서 담당자 "수정 → 저장"을 한 번 누르면 이름으로 갱신됨. 대량 일괄 변환은 별도 작업 필요.

### 10. 견적서발급관리 시트 — 확정된 행 보호

**문제**: 사용자 보고 — "견적서를 수정하면 견적서 발급관리 시트에 수정되기 전 행을 읽어서 데이터를 수정하는 버그". 정상 플로우(수정모드→수정확정)에서는 새 견적번호로 새 행이 추가되지만, 의도치 않은 경로(예: input value 누락, quoteNo 미발급 상태에서 재진입 등)로 같은 quoteNo가 다시 들어올 경우 기존 확정 행을 덮어쓸 위험 존재.

**조치**: `handleConfirm()`에 보호 로직 추가. (접수번호, 견적번호) 매칭된 행이 이미 `status='confirmed'`이면 절대 갱신하지 않고 새 행을 추가. draft/new 상태의 행은 기존대로 갱신.

```js
const existingStatus = String(rows2[i][11]||'').toLowerCase();
if (existingStatus === 'confirmed') break; // 확정행 보존, 신규 추가로 폴백
```

### 11. 견적번호 형식 — `YYMMDD-NNNN-v1` 로 통일

**문제 (이전)**: 견적번호 = `YYMMDD-NNNN` (예: `260512-0001`). 버전 라벨은 `getVersionLabel`로 별도 산출(R00/R01). 시트만 보면 어떤 버전인지 즉시 식별 불가.

**조치**:
- `admin.html::generateQuoteNo()` — 산출물에 `-v1` 접미사 부착.
- `admin.html::getNextVersion()` — `-v1` → `-v2` → `-v3` 증분. 레거시 `-R\d+`도 다음 버전부터 `-v` 형식으로 자동 전환.
- `admin.html::getVersionLabel()` — `v1`, `v2` ... 표시. 레거시 `-R01` 데이터는 `v2`로 매핑하여 표시 호환.

**기존 데이터 호환**: 옛 `260512-0001` 형식 데이터는 라벨이 `v1`로 표시됨. 신규 발급분만 `-v1` 접미사 부착. 한 신청 안에서 옛/새 형식이 섞이면 라벨도 v1, v2... 로 일관 표시됨.

### 12. 담당자관리 시트 — 6컬럼화 + 단일 진실 소스

**문제**: 시트 7번째 컬럼 `직책`이 별도로 존재 + 코드의 `DEFAULT_USERS`가 항상 첫 폴백으로 사용되어, 시트가 단일 진실 소스가 되지 못함. 사용자가 시트에서 직책 컬럼을 이미 수동 삭제해 옛 코드와 컬럼 인덱스 불일치 발생.

**조치**:
- **시트 스키마**: `담당자ID | 이름(직책 포함) | 전화번호 | 이메일 | 비밀번호 | 관리자여부` (7→6컬럼). `initSheets()` 시드도 `'박현석 부장'` 한 셀로 변경.
- **`getUserConfig` / `handleSaveUserConfig`** — 6컬럼 인덱스로 시프트.
- **`admin.html`**:
  - `DEFAULT_USERS` 하드코딩 배열 **삭제**. `getUsers()` 폴백은 빈 배열.
  - `u.title` 참조 **8군데 모두 제거** (`u.name + ' ' + u.title` → `u.name`).
  - 신규 담당자 등록 폼: 이름란에 "이름 + 직책"을 함께 입력하도록 안내 추가 (`addUser`는 `title:''` 필드 제거).
  - 담당자 목록 표/select option/로그인 표시/견적서 출력/신청 목록 등 모든 표시 위치 일관됨.

**시트가 항상 단일 진실 소스**: `initApp()`에서 GAS `getUserConfig`로 시트 데이터를 로드 → `_memUsers` 캐시. 코드는 시트 외 다른 어떤 소스에서도 담당자 정보를 읽지 않음. localStorage `jhtech_users`는 GAS 연결 실패 시 폴백 캐시일 뿐.

### 문제 2 — PDF 파일명 버전 분리

**문제**: `saveQuoteToDrive()`가 `견적서_업체명.pdf`로 저장 → `handleSaveQuote()`가 동일명 파일을 휴지통 이동 → 버전업 시 v1 PDF가 사라짐.

**조치**:
- `admin.html::saveQuoteToDrive()` — `quoteNo`에서 `getVersionLabel`로 버전 라벨(v1/v2) 추출 후 파일명에 부착:
  - `견적서_<업체명>_v1.pdf`, `장비사진_<업체명>_v1.pdf`
- 휴지통 이동 로직은 GAS에 그대로 두되, **다른 버전 파일은 영향 없음**(파일명이 다르므로 매칭 안 됨). 동일 버전 재저장 시에만 옛 파일 휴지통 이동.

**결과**: 한 업체의 v1, v2, v3 견적서 PDF가 Drive `재현테크_견적서/`에 모두 보존됨.

### F6. 버전 이력 1개부터 표시

**문제 (이전)**: `renderVersionHistory()`가 `if(_reqVersions.length <= 1) return` 으로 1개 버전은 표시하지 않음. 사용자: "최초버전부터 견적완료 화면에 표시해야 함."

**조치**: 조건을 `< 1`로 변경(0개일 때만 숨김). v1 한 개만 있어도 이력 표 + "최초" 라벨이 표시됨.

### F7. 버전 이력 행 클릭 → 우측 패널 그 버전 상세

**조치**:
- 신규 상태 `_viewingVersionQuoteNo` — null이면 currentReq 그대로, 값 있으면 그 버전 데이터를 오버레이.
- 신규 함수 `viewVersion(quoteNo)`, `returnToCurrentVersion()`.
- `renderDetail()` 상단에서 `_viewingVersionQuoteNo` 있으면 `r`을 버전 데이터로 덮어쓰고, `editMode=false` 강제(읽기 전용).
- 우측 상단 노란색 안내 배너 + 액션바를 "이 버전 출력 / 최신 버전으로 돌아가기" 단일 세트로 교체.
- `renderVersionHistory()` 표 행에 `onclick="viewVersion(...)"` 추가, 내부 출력/변경정보 버튼은 `event.stopPropagation()`. 보는 중 행은 노란색 하이라이트.
- `selectReq()`에서 `_viewingVersionQuoteNo = null` 초기화 (다른 신청 클릭 시 상태 재설정).

### F8. 신청중 첫 클릭 시 포함옵션 자동 체크

**문제**: 새로 들어온 신청을 클릭하면 포함옵션이 모두 해제된 채로 표시 → 사용자가 일일이 다시 체크해야 함. 장비를 변경하면 자동 체크되는데 첫 진입에서는 안 되는 비대칭.

**조치**: `selectReq()`에서 `status='new'`이면서 `includeOpts`가 비어있을 때 장비 기본 includeOpts를 자동으로 채워 넣음 (`currentReq.includeOpts = [...eqOpts.includeOpts]`). 사용자가 체크 해제한 상태로 임시저장한 경우는 includeOpts가 비어있지 않으므로 영향 없음.

### F9. 추가옵션 마지막 행 높이 통일

**문제**: `#extraPriceBreakdown` 내부 마지막 옵션 행이 `.price-row:last-child` CSS 셀렉터에 매칭되어 합계 행 스타일(font-size:16px, font-weight:800, color:blue2)이 잘못 상속됨.

**조치**: CSS 셀렉터를 `.price-summary > .price-row:last-child`로 직접 자손 한정. extraPriceBreakdown 내부 행은 자손이 아니므로 영향 없음. 합계 행은 `.price-summary`의 직접 자손이라 그대로 적용됨.

### 변경된 파일 (이번 회차)

| 파일 | 변경 분량 |
|---|---|
| `appscript/Code.gs` | 시트 스키마 마이그레이션, getUserConfig/handleSaveUserConfig 6컬럼화, handleUpdateAssignee 이름 저장, handleConfirm 확정행 보호, handleSaveQuote 주석 갱신 — 약 30줄 |
| `admin.html` | DEFAULT_USERS 제거, u.title 8군데 제거, saveAssignee 이름 전송, generateQuoteNo/getNextVersion/getVersionLabel 형식 변경, CSS price-row 셀렉터 한정, renderVersionHistory 항상 표시 + 행 클릭, renderDetail 과거버전 오버레이, viewVersion/returnToCurrentVersion, selectReq 포함옵션 자동체크, saveQuoteToDrive 파일명 버전 포함 — 약 100줄 |
| `docs/issues.md` | 이 섹션 |

### GAS 배포 절차 (사용자 작업)

1. `pbcopy < /Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs` 실행 → 클립보드 복사
2. Apps Script 에디터(스프레드시트 메뉴 → 확장 프로그램 → Apps Script) 열기
3. `Code.gs` 전체 선택 후 붙여넣기 (덮어쓰기) → 저장(Ctrl+S)
4. **시트 마이그레이션 1회 실행**: 함수 선택 드롭다운에서 `initSheets` 고르고 ▶ 실행 → 첫 실행 시 권한 승인 대화상자 → 허용. 신청관리 시트의 비어있던 헤더가 채워짐 확인.
5. **새 버전 배포**: 우상단 "배포" → "배포 관리" → 기존 배포 우측 연필 아이콘(편집) → "버전" 드롭다운에서 "새 버전" → 설명 입력(예: "2026-05-12 시트 스키마/PDF 보존") → 배포. URL은 변경되지 않음.

### 검증 체크리스트 (사용자 직접 확인)

브라우저로 `admin.html`을 열고 Cmd+Shift+R 강제 새로고침 후:

1. 로그인 시 헤더에 이름이 "박현석 부장" 한 셀로 표시 (이름+직책 통합)
2. 새 신청 클릭 → 포함옵션이 모두 체크된 상태로 표시
3. 신청에 담당자 지정 후 시트 `신청관리` 컬럼 20에 이름(예: "박현석 부장")이 기록 — ID가 아님
4. 견적금액 입력 → 견적확정 → 시트 `견적서발급관리`에 행 추가, 견적번호가 `260512-0001-v1` 형태
5. Drive `재현테크_견적서/`에 `견적서_업체명_v1.pdf`, `장비사진_업체명_v1.pdf` 두 파일
6. 견적완료 화면 진입 → 버전 이력 표에 v1 한 행이 표시("최초" 라벨, 변경정보 비활성)
7. "견적 수정" → 값 변경 → "수정 확정 (버전업)" → 견적번호가 `260512-0001-v2`로 갱신
8. 시트 `견적서발급관리`에 v1, v2 두 행이 별개로 존재 (v1 행 데이터는 그대로)
9. Drive에 `..._v1.pdf`, `..._v2.pdf` 두 파일 모두 보존
10. 버전 이력 표에서 v1 행 클릭 → 우측 패널이 v1 데이터로 갱신, 노란색 "v1 버전 보는 중" 배너 표시, "최신 버전으로 돌아가기" 버튼으로 복귀 가능
11. 추가옵션 여러 개 추가 → 마지막 옵션 행의 높이가 다른 옵션 행과 동일 (이전: 합계 행 스타일 잘못 상속)

---

## 2026-05-12 추가 보정 (검증 후 보고된 5건)

### 1. Drive 토스트 제거 (`showDriveToast` 함수/호출 삭제)

**문제**: 견적확정 후 우하단 초록색 "✅ ... → 드라이브 열기" 토스트의 링크가 마지막 업로드된 파일(=장비사진 PDF) URL만 가리킴 → 사용자가 견적서를 기대하고 클릭해도 장비사진만 보임 + 두 파일을 분리해서 안내하기엔 형식이 부적합.

**조치**: `showDriveToast` 함수 정의 및 3개 호출(Drive 저장 시작/완료/실패) 제거. 진행 상황은 기존 `pdfOverlay` 진행바로만 표시, 실패 시 `alert()`로 안내. DOM의 `<div id="driveToast">`는 비활성 상태로 남겨둠(추후 활용 가능, 시각 영향 없음).

### 2. 장비사진 PDF에 이미지 누락 → base64 인라이닝

**문제**: `장비사진_업체명_v1.pdf`가 생성되지만 이미지가 렌더링되지 않음. 원인 — `장비사진/프린터 XTRA OR16.png` 등 **공백·한글 포함 상대 경로**가 iframe `srcdoc` 컨텍스트에서 base href를 거치며 안정적으로 해석되지 못함(브라우저별 srcdoc-base href 정책 차이).

**조치**: `saveQuoteToDrive()`에 신규 함수 `inlineImages(html)` 추가. 정규식으로 `src="..."` 매칭 후 같은 경로를 `fetch → blob → FileReader.readAsDataURL`로 변환해 `data:image/...;base64,...` URI로 치환한 다음 iframe에 넘김. `data:` URI는 base 의존성이 없어 한글 경로 문제와 무관하게 항상 렌더됨. 견적서 PDF에도 동일 처리(향후 견적서 본문에 외부 이미지를 추가해도 자동 적용).

### 3. 버전 1개 또는 최신 버전 클릭 시 노란 배너·돌아가기 버튼 미표시

**문제**: 버전이 1개뿐이거나 최신 버전 행을 클릭해도 "📜 v1 버전 보는 중" 배너 + 액션바의 "이 버전 견적서 출력 / 최신 버전으로 돌아가기"가 떠서 불필요한 UI 노이즈가 생김.

**조치**: `renderDetail()` 상단의 `viewingPastVersion` 판정을 강화 — `_viewingVersionQuoteNo`가 설정되어 있어도 다음 조건 모두 만족할 때만 `true`로 인정:
1. `_reqVersions.length >= 2` (버전이 2개 이상)
2. 선택된 quoteNo가 **최신 버전이 아님**

조건 미만족 시 `_viewingVersionQuoteNo = null`로 초기화하여 다음 렌더부터 일반 모드로 진입. 액션바·배너·셋업 상단 라벨 모두 viewingPastVersion 분기를 그대로 사용하므로 한 곳 수정으로 일괄 적용됨.

### 4. 견적금액 카드 '저장' 버튼 제거

**문제**: 견적금액 카드 우하단의 "💾 저장" 버튼은 `savePrice()`를 호출해 `syncToSheet`를 즉시 실행 → 견적서발급관리 시트에 행이 만들어지는 부수효과 발생. 사용자 의도는 화면 입력만 갱신하고 시트 기록은 임시저장/견적확정 버튼으로만 하는 것.

**조치**: 견적금액 카드 마크업에서 `<button id="savePriceBtn" onclick="savePrice(...)">💾 저장</button>` 블록 통째로 삭제. `savePrice()` 함수 정의는 호출처 없는 dead code로 남겨두었으나(롤백 용이성), 다음 정리 회차에 제거 예정.

### 5. 변경정보 모달의 추가옵션 — 좌우 단순 비교

**문제 (이전)**: 추가옵션 변경 정보가 한 셀에 "+ 화이트 잉크 키트 (1,500,000원)", "− 바니시 잉크 키트 (취소선)", "↻ 현장 출장 설치비: 200,000 → 300,000 (+100,000)" 형태로 가공되어, 다른 행의 "이전 / 변경 후" 좌우 비교 패턴과 일관성이 깨짐.

**조치**: `renderDiffHtml()`의 extOpts 분기를 단순 리스트 두 열로 재작성. `prev.extraOpts` 전체를 "이전" 셀에, `cur.extraOpts` 전체를 "변경 후" 셀에 그대로 나열(이름 + 금액). 강조색·취소선·차액 표시 모두 제거. 빈 배열인 경우 "없음" 라벨.

### 변경된 파일 (이번 보정)

| 파일 | 변경 |
|---|---|
| `admin.html` | inlineImages 신규, saveQuoteToDrive 토스트 제거 + 이미지 인라이닝, renderDetail viewingPastVersion 조건 강화, 견적금액 저장 버튼 제거, renderDiffHtml extOpts 단순화 — 약 60줄 |
| `docs/issues.md` | 이 섹션 |

### 추가 검증 (재배포 후)

브라우저 강제 새로고침(Cmd+Shift+R) 후:
1. 새 신청 → 견적확정 → 우하단에 초록색 토스트 안 뜸 (진행 오버레이만 표시 후 사라짐)
2. Drive 폴더에 `장비사진_업체명_v1.pdf` 열어보면 **장비 사진이 정상 표시됨**
3. 버전이 1개일 때 그 행을 클릭해도 노란 배너/돌아가기 버튼이 안 뜸
4. 버전이 2개일 때 v2(최신) 행 클릭 → 배너 안 뜸. v1 행 클릭 → 배너 + 돌아가기 버튼 정상 표시
5. 견적금액 카드에 "💾 저장" 버튼이 안 보임 (임시저장/견적확정만 유효)
6. 변경 정보 모달에서 추가옵션 행이 "이전 | 변경 후" 두 셀로 나란히 표시 (취소선/차액 강조 없음)
