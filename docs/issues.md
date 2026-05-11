# 이슈 추적

> 작성일: 2026-05-11
> 분석 근거: `docs/code-analysis.md`
> 수정 원칙: 한 문제 해결 시 본 문서의 해당 섹션 하단에 ✅ "해결 내역"을 추가한다. 이후 작업자가 시간 흐름을 추적할 수 있도록 **삭제하지 말고 누적**한다.

---

## 우선순위 요약

| # | 문제 | 비즈니스 영향 | 수정 난이도 | 우선순위 | 상태 |
|---|---|---|---|---|---|
| 1 | GAS URL 이중 하드코딩 + 동기화 누락 | 신청 누락 가능 (데이터 손실) | 1줄 수정 | 🔴 즉시 | ✅ 해결 (2026-05-11) — 임시조치 + 근본조치(옵션 A: config.js 분리) 적용 |
| 2 | PDF 저장 경로/파일명 회귀 (작업내역 vs 실제 코드 불일치) | 회계·법무 증빙 누락 가능 | 정책 결정 + 1시간 | 🟡 정책 결정 후 | ⛔ 미착수 |
| 3 | 신청 제출 응답 미수신 (silent failure) | 신청자 신뢰 손상, 누락 신청 추적 불가 | 1~2시간 | 🟡 2주 내 | ⛔ 미착수 |
| 4 | 백엔드 권한 검증 부재 (누구나 GAS 직접 호출 가능) | 개인정보·계정 평문 노출 | 반나절 | 🔴 이번 주 | ⛔ 미착수 |
| 5 | 견적 버전 이력의 이중 저장소 (localStorage가 dead code) | 코드 가독성 저하, 미미 | 30분 | 🟢 여유 시 | ⛔ 미착수 |

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
