# jhtechsmart — Dev Note: Quote-Version-Fix-and-Async-Gate

> **📅 Date:** 2026-05-17 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** Quote-Version-Fix-and-Async-Gate
> **👤 Author:** — · **🔖 Tags:** gas, google-sheets, bug-fix, quote-versioning, async-ux, idempotency, admin, methodology

---

## TL;DR

견적 버전 이력 버그(P1~P4) 근본 수정 — 서버를 버전·중복의 단일 진실로 만들고, P2 회귀(draft 화면 복원)까지 보완. 더해 부수효과 비동기 9동작을 단일 게이트(runExclusive)로 보호하고, 재발 방지 규약을 CLAUDE.md·메모리에 박제.

---

## Today's Work

### 🐛 `fix(quote)`: 견적 버전 이력 버그 P1~P4 근본 수정

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `admin.html`

#### 📋 Context (왜)

재현테크_테스트(REQ-20260515-50347) 견적서발급관리 시트에 같은 0002-v1이 5행 누적되고 버전이력 클릭이 무반응. 사용자가 직접 한 게 아니라 업체가 admin에서 조작해 정확한 동작은 재현 불가 — 시트 데이터(상태값)와 코드 결함만으로 근본 원인을 역추적.

#### 🔨 Implementation (무엇을 어떻게)

handleConfirm 재설계: status!=='confirmed'면 발급이력 시트에 미기록(P2), (접수번호,견적번호) 매칭 break-on-first 제거 + 이미 confirmed면 서버가 같은 base 최대버전+1로 자동 증가(P3), 응답에 finalQuoteNo 반환. admin.html syncToSheet가 응답 quoteNo를 권위값으로 채택(P1). P4(클릭 무반응)는 quoteNo 중복의 귀결이라 P1·P3 수정으로 자동 해소. 헬퍼 _quoteBase/_buildQuoteRow 추가.

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
if (matchIdx >= 0 && matchConfirmed) {
  const base = _quoteBase(data.quoteNo);
  let maxVer = 0;
  for (let i = 1; i < rows2.length; i++) {
    if (rows2[i][1] === data.id && _quoteBase(rows2[i][0]) === base) {
      maxVer = Math.max(maxVer, _extractVersionFromQuoteNo(rows2[i][0]) || 1);
    }
  }
  finalQuoteNo = base + '-v' + (maxVer + 1);
}
```

_P3 — 같은 번호 재확정 시 서버가 버전 자동 +1 (클라이언트 실수와 무관하게 보장)_

#### 📐 Architecture Decisions (ADR)

**Decision:** 버전·중복 방어를 서버 단일 진실로

- **Context:** 정확한 사용자 동작이 재현 불가(업체 admin 조작). 클라이언트 트리거를 다 막을 수 없음.
- **Options considered:**
    - 클라이언트 quoteNo 로직만 수정
    - 서버 자동 버전+1 + 클라 응답 채택
    - 에러 거부
- **Chosen:** 서버 자동 버전+1 + 클라 응답 채택
- **Rationale:** 트리거가 무엇이든(중복 클릭·이탈·업체 조작) 서버가 단일 진실이면 깨지지 않음. P2/P3는 경로 무관하게 방어.
- **Consequences:** 클라가 응답 quoteNo를 채택해야 하므로 syncToSheet에 동기화 코드 추가. 이미 쌓인 오염 행은 코드로 안 사라져 별도 정리 함수 필요.

#### 🐛 Problems & Solutions

**Problem:** 정적 코드 분석이 모순 — '수정확정 눌렀다'면 -v2가 시트에 있어야 하는데 전부 v1

- **Root cause:** 사용자 인지와 실제 경로 불일치 + draft 3행이 발급이력에 섞임. 실제 동작은 업체가 admin에서 한 것이라 미상.
- **Solution:** 추측 중단, 시트 raw 5행(상태 컬럼)을 받아 데이터로 인과 확정. status=draft/confirmed 분포가 결정적 단서.
- **Prevention:** 재현 불가 버그는 코드 추측보다 실제 데이터(시트 원본)를 먼저 확보. 근본 수정은 트리거 무관하게 설계.

#### 💡 Learnings

- 재현 불가 버그에서 코드 정적분석이 모순에 부딪히면 즉시 멈추고 실제 데이터 확보
- 트리거를 못 막으면 서버를 단일 진실로 만들어 경로 무관 방어

---

### 🐛 `fix(api)`: _filteredRequestRows 통합정보 소스 전환 (P2 회귀 수정)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

P2로 draft를 견적서발급관리에서 빼자, admin 목록 복원이 거기서만 읽어 임시저장 옵션·가격이 화면에 빈 값으로 표시되는 회귀 발생.

#### 🔨 Implementation (무엇을 어떻게)

_filteredRequestRows가 현재 견적 상태(옵션·가격·견적번호·유효기간)는 통합정보 시트에서 읽고, versions(버전이력)만 견적서발급관리에서 읽도록 분리. 통합정보 없는 옛 데이터는 견적서발급관리 최신으로 폴백.

#### 📐 Architecture Decisions (ADR)

**Decision:** 역할 분리: 통합정보=현재 상태, 견적서발급관리=확정 이력

- **Context:** P2 도입으로 draft 복원 소스가 끊김
- **Options considered:**
    - P2 완화(draft도 발급이력 기록)
    - 통합정보를 현재상태 소스로 전환
    - 양쪽 폴백
- **Chosen:** 통합정보를 현재상태 소스 + 견적서발급관리 폴백
- **Rationale:** Phase 1 설계 의도(통합정보=신청+견적 단일 소스)와 일치. 발급이력은 confirmed만이라는 의미 명확화.
- **Consequences:** admin 목록 전체의 견적 데이터 소스가 바뀌어 회귀 위험 → A·B·C 회귀 재검증 필요

#### 💡 Learnings

- 수정이 다른 경로의 데이터 소스를 끊지 않는지 — incomplete fix는 같은 변경의 일부로 함께 고친다

---

### 🔧 `chore(data)`: fixQuoteVersionHistory 일회성 데이터 정리

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

코드 수정으로 이미 쌓인 오염 5행은 사라지지 않음. 사용자가 '소급 정리(보존)' 선택.

#### 🔨 Implementation (무엇을 어떻게)

reqId의 draft 행 삭제 + 남은 confirmed 행을 발급일시 오름차순으로 base-v1,-v2 소급 재부여 + 통합정보 정합 + 노션 재push. 멱등 설계(여러 번 실행 안전). GAS 에디터 수동 실행.

#### 💡 Learnings

- 데이터 마이그레이션 함수는 멱등하게 — 재실행해도 동일 결과

---

### ✨ `feat(admin-ux)`: 신청중 탭 그룹 아코디언 + 추가옵션 음수 단가

**Status:** `completed`  
**Files changed:** `admin.html`

#### 📋 Context (왜)

임시저장(draft)이 '신청중' 탭에 안 보여 누락 위험. 신청 많아지면 길어짐. 별도로 옵션 제거 차감 견적을 위해 추가옵션 단가 음수 입력 필요한데 차단돼 있었음.

#### 🔨 Implementation (무엇을 어떻게)

'신청중' 탭=new+draft, '작업 중·임시저장'/'미착수 신청' 두 그룹 접이식(_collapsedGroups, toggleReqGroup). fmtExtraPrice가 맨 앞 - 1개 허용, 표시/카운트/분해 필터 >0을 !==0으로(음수 포함, 빈값·0 제외 유지). 합계·PDF·시트·toLocaleString은 이미 음수 정상이라 미변경.

#### 📐 Architecture Decisions (ADR)

**Decision:** 하위 탭 대신 그룹 아코디언

- **Context:** new vs draft 구분 + 많아지면 길어짐
- **Options considered:**
    - 서브탭
    - 그룹 소제목 구분
    - 정렬/배지만
- **Chosen:** 그룹 소제목 + 접이식 아코디언
- **Rationale:** 클릭 단계 안 늘고 누락 방지, 좁은 사이드바에 적합
- **Consequences:** _collapsedGroups 전역 상태 추가

#### 💡 Learnings

- 음수 허용은 입력 차단(정규식)만이 아니라 표시/카운트 필터의 >0 가정까지 함께 풀어야 end-to-end 동작

---

### ✨ `feat(admin)`: runExclusive — 부수효과 비동기 보호 게이트

**Status:** `completed`  
**Files changed:** `admin.html`

#### 📋 Context (왜)

버튼 클릭 후 첫 await까지 무방비 + beforeunload 가드 0건. 사용자가 작업 중 화면 이탈/중복클릭/탭닫기 하면 견적확정·메일발송이 미완으로 끝남. 사용자가 '그때그때 수정이 힘들다'며 구조적 예방 요청.

#### 🔨 Implementation (무엇을 어떻게)

runExclusive(label, fn): 클릭 즉시 #pdfOverlay(z-index 10000) 전체화면 차단 + beforeunload 경고 + _busy 재진입 차단, finally 항상 해제. 검증/confirm은 게이트 밖, await 작업만 안, 결과 alert는 밖. printQuote를 async화해 saveQuoteToDrive를 await/return → PDF·Drive 완료까지 게이트 유지. 8지점 적용(saveDraft/confirmQuote/confirmRevise/resendGuideNow/saveAssignee/saveMailField/printQuote→saveQuoteToDrive). deleteUser/saveEquipMgmt는 localStorage 우선 구조라 현행 유지.

#### 💻 Key Code

**`admin.html`**

```javascript
async function runExclusive(label, fn){
  if(_busy) return undefined;
  _busy = true;
  showPdfOverlay(8, label || '처리 중…');
  window.addEventListener('beforeunload', _beforeUnloadGuard);
  try { return await fn(); }
  finally {
    window.removeEventListener('beforeunload', _beforeUnloadGuard);
    hidePdfOverlay();
    _busy = false;
  }
}
```

_단일 게이트 — 즉시 차단·이탈경고·재진입차단, finally 항상 해제_

#### 📐 Architecture Decisions (ADR)

**Decision:** 모달 차단 + durable 지향 병행

- **Context:** 사용자 개입으로 비동기 작업이 깨지는 문제의 구조적 예방
- **Options considered:**
    - 모달만
    - 전부 서버 durable
    - 게이트(증상) + durable(근본) 병행
- **Chosen:** 게이트 + durable 지향
- **Rationale:** 검색 확인: SPA는 beforeunload 안 먹어 자체 차단 필요, 근본은 클라 이탈해도 서버가 완결(durable). PDF는 클라 html2pdf 의존이라 게이트로 보호.
- **Consequences:** printQuote async화로 호출 체인 await 필요. 규약을 CLAUDE.md/메모리에 박제해 이식

#### 💡 Learnings

- 버튼 클릭~첫 await 사이가 무방비 — 게이트는 동기적으로 즉시 켜야 함
- fire-and-forget(printQuote→saveQuoteToDrive)은 게이트가 완료까지 못 잡음 → 체인 전체 async/await화

---

### 📝 `docs(methodology)`: 재발 방지 규약 박제 (CLAUDE.md + 메모리)

**Status:** `completed`  
**Files changed:** `CLAUDE.md`

#### 📋 Context (왜)

사용자가 다른 프로젝트에도 적용할 사전 예방 방법론을 요청.

#### 🔨 Implementation (무엇을 어떻게)

CLAUDE.md '### 8. 비동기 부수효과 게이트 규약' 추가(작성 규칙·적용 목록·예외·pre-mortem 5문항·durable 지향). 이식 가능 일반 원칙을 feedback 메모리(feedback_async_mutation_gate.md)에 저장 → 전 프로젝트 자동 적용.

#### 💡 Learnings

- 반복되는 결함 클래스는 코드 수정에 그치지 말고 규약+체크리스트로 박제해 재발 차단

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 구조 시각화 요구 (다이어그램)

```
전체이 구조가 머리에 잘 안그려져. 함수만 보고 이렇게 동작합니다 라고 이야기하니까. 지금 문제가 있는 과정을 html로 다이어그램 형식으로 어떤 순서로 어디에서 문제가 발생했는지 그려줘.
```

**교훈:** 복잡한 인과는 함수 나열이 아니라 동작→함수→결과 흐름 다이어그램으로 설명하면 사용자가 판단·결정할 수 있다. 분석 산출물은 .devnote-scratch 등 git 제외 위치에.

### ✅ 잘 통한 프롬프트: 다이어그램 반복 피드백 (가시성)

```
음.. 이렇게 말고.. 한눈에 들어오도록.. 왼쪽에서 오른쪽으로 흐름이 보이되 더이상 오른족에 여백이 없으면 다이어그램방향이 왼쪽->오른쪽->아래->왼쪽->아래쪽->오른쪽.. 이런 방향으로 화면에 다 보이도록
```

**교훈:** 자동 레이아웃 라이브러리(Mermaid)는 serpentine/한눈 요구를 못 맞춤 → CSS grid로 직접 뱀형 레이아웃. '가시성'은 폰트 축소(useMaxWidth) 같은 렌더 옵션이 원인일 수 있으니 먼저 의심.

### ✅ 잘 통한 프롬프트: 재현 불가 — 근본 우선

```
내가 수정한게 아니고 업체에서 직접한거라 내가 내용은 잘 몰라
```

**교훈:** 동작 재현이 불가하면 동작 규명에 매달리지 말고, 코드로 사각지대를 닫고 트리거 무관 방어로 전환. 사용자에게 캐묻기 중단 시점 판단.

### ✅ 잘 통한 프롬프트: 구조적 예방 방법론 요청 (장문)

```
코드를 작성하고 정상적으로 동작하게 만드는건 당연히 해야하는것이지만, 사용자의 동작을 어느정도는 예측하고 코드가 동작하는 시간동안은 사용자 개입이 없게하거나 다른 작업으로 내부 코드작업이 영향을 받으면 아무런 소용이 없는 코드가 되버리는 거야.
```

**교훈:** 사용자가 장문으로 문제의 본질을 설명할 때는 단발 수정이 아니라 규약·체크리스트·메모리 박제로 답한다. pre-mortem 5문항을 프로세스에 삽입.

---

## 📚 References & 외부 학습

- **[Window: beforeunload event - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)** `async` · `navigation`
    - 조건부 등록(작업 중에만), async 콜백 불가, SPA 내부이동엔 안 먹음
- **[AWS Durable Execution - Idempotency and retries](https://docs.aws.amazon.com/durable-execution/patterns/best-practices/idempotency/)** `durable` · `idempotency`
    - 근본 해법은 서버가 완결+멱등. 모달은 증상 완화

---

## 📋 Changes Summary

### Added

- runExclusive 비동기 보호 게이트(8지점)
- fixQuoteVersionHistory 일회성 정리 함수
- 신청중 탭 그룹 아코디언
- 추가옵션 음수 단가
- CLAUDE.md 비동기 게이트 규약 + pre-mortem 체크리스트

### Changed

- handleConfirm 버전·중복 방어를 서버 단일 진실로
- _filteredRequestRows 현재 견적 상태를 통합정보 소스로
- syncToSheet 응답 quoteNo 채택
- printQuote async화

### Fixed

- 견적 버전 이력 P1(버전 고정)·P2(draft 오염)·P3(중복 누적)·P4(클릭 무반응)
- P2 회귀(draft 화면 복원 끊김)

### Removed

- handleConfirm break-on-first-match
- 표시 필터의 >0 음수 배제 가정

---

## ⏭️ Next Steps

- [ ] 노션 페이지 아이콘(상태별) — 설계 완료·메모리 보존, 사용자 결정 대기
- [ ] deleteUser/saveEquipMgmt 게이트 적용 여부(일관성 vs 변경 최소) 추후 판단
- [ ] GUIDE_SYSTEM_PROMPT 품질 개선 TODO(별도)
- [ ] 무거운 후속(메일)을 서버 trigger durable 구조로 점진 이전

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 부수효과 비동기(시트/Drive/메일/네트워크 mutation)는 반드시 admin.html runExclusive 게이트를 통과시킨다 — 검증/confirm은 게이트 밖, await 작업만 안, 결과 alert는 밖. 새 mutation 추가 시 pre-mortem 5문항(중복클릭·즉시이동·탭닫기·뒤로가기·네트워크끊김) 점검. 통합정보=현재 견적 상태 단일 진실, 견적서발급관리=확정 이력만(draft 미기록). Code.gs 변경은 클립보드(pbcopy)로 사용자가 GAS 에디터 붙여넣기+새 버전 배포.

**Reusable patterns introduced today:**

- `runExclusive 게이트` — 부수효과 비동기를 단일 게이트로 즉시차단+beforeunload+재진입차단, finally 항상 해제
    - 파일: `admin.html`
- `서버 단일 진실 버전 관리` — 같은 키 재확정 시 서버가 max버전+1 자동 부여 후 응답 반환, 클라가 채택 (트리거 무관 멱등)
    - 파일: `appscript/Code.gs handleConfirm`
- `멱등 데이터 정리 함수` — 오염 행 삭제+소급 재부여, 여러 번 실행해도 동일 결과
    - 파일: `appscript/Code.gs fixQuoteVersionHistory`
