# jhtechsmart — Dev Note: Mail-Notion-Integration

> **📅 Date:** 2026-05-13 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** Mail-Notion-Integration
> **👤 Author:** SeonjeCho · **🔖 Tags:** gas, notion, openai, mailer, automation, bidirectional-sync

---

## TL;DR

재현테크 견적 시스템에 통합 마스터 시트(통합정보 42컬럼) + OpenAI gpt-4o-mini 5 PART 동영상 가이드 자동 생성 + 별도 GAS 계정의 Mailer Web App(jhtechsmart@gmail.com 발송) + Notion 양방향 sync(hash 기반 무한루프 차단 6필드) + admin.html 즉시 재발송 UI 도입. 5분 polling으로 운영자가 시트·노션·admin 어디서나 동일한 흐름으로 메일 발송. 차수 13차~22.4차, 총 19개 커밋, ~2150줄 추가.

---

## Today's Work

### ✨ `feat(gas)`: 통합정보 마스터 시트 도입 (Phase 1)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### Context

신청관리·견적서발급관리 시트가 따로 운영되어 외부 시스템(노션 등) 동기화 시 어떤 키로 매칭할지 복잡. 한 마스터 시트가 모든 정보 + 노션 page ID + push 시각 + hash 메타까지 가지면 매핑이 단순해진다.

#### Implementation

UNIFIED_HEADERS 42컬럼 (신청 21 + 견적 10 + 가이드/메일 6 + Notion sync 메타 2 + PDF URL 2 + 가이드_version 1) 정의. _getUnifiedSheet()가 시트 자동 생성 + 헤더 누락 보강. upsertUnified(reqId, requestData, quoteData)는 접수번호 기반 INSERT/UPDATE + 견적번호 -vN 추출로 버전 비교 + 빈 값 덮어쓰기 방지. handleSubmit/handleConfirm 끝에 훅 호출.

#### Key Code

**`appscript/Code.gs`**

```javascript
function _getUnifiedSheet() {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let sheet = ss.getSheetByName(UNIFIED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNIFIED_SHEET_NAME);
    sheet.appendRow(UNIFIED_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    const lastCol = sheet.getLastColumn();
    if (lastCol < UNIFIED_HEADERS.length) {
      const cur = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const merged = UNIFIED_HEADERS.map((h, i) => (i < cur.length && cur[i]) ? cur[i] : h);
      sheet.getRange(1, 1, 1, merged.length).setValues([merged]);
    }
  }
  return sheet;
}
```

_헤더 보강은 끝에 append만 안전 — 신규 컬럼은 항상 UNIFIED_HEADERS 배열 끝에 추가_

#### Problems & Solutions

**Problem:** PDF URL 2컬럼을 견적 그룹 끝(중간)에 삽입하니 운영 시트에서 Notion_PageID/최종푸시일시가 중복 추가됨

- **Root cause:** _getUnifiedSheet의 보강 로직이 cur[i] || UNIFIED_HEADERS[i] 방식이라 중간 삽입은 위치 어긋남
- **Solution:** PDF URL을 헤더 배열 끝으로 이동. 사용자가 운영 시트의 중복 컬럼 2개 수동 삭제
- **Prevention:** 신규 컬럼은 무조건 헤더 배열 끝에 push. 코멘트로 명시

#### Learnings

- GAS 시트 헤더 보강 로직은 끝에 append만 멱등 안전. 컬럼 순서 변경은 마이그레이션 함수 별도 필요.

---

### ✨ `feat(gas)`: 이메일 템플릿 로드 + GPT 5 PART 동영상 가이드 자동 생성 (Phase 2~3)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### Context

견적 확정 + 견적 PDF·장비사진 PDF가 모두 Drive에 저장된 시점에 회사별 메일 본문을 자동 생성해 발송 큐에 등록. 본문은 사용자가 Drive에 둔 jaehyun_tech_guide_fixed.html 템플릿의 5개 마커 영역만 GPT 응답으로 치환.

#### Implementation

loadEmailTemplate() Drive HTML fetch + 5분 캐시 + 5 마커 검증. parseGuideScript() split + capture group으로 ## PART N 헤더로 분리. mergeGuideTemplate() 마커 다음 가장 가까운 background-color div 내부 교체. callOpenAI() gpt-4o-mini + max_tokens 2500 + finish_reason 검증. _ensureGuideForUnified() version 비교 멱등.

#### Key Code

**`appscript/Code.gs`**

```javascript
function callOpenAI(promptInput) {
  const payload = {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 2500,
    messages: [{role:'system',content:GUIDE_SYSTEM_PROMPT},{role:'user',content:JSON.stringify(promptInput)}]
  };
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:'post', contentType:'application/json',
    headers:{Authorization:'Bearer '+_guideProp('OPENAI_API_KEY')},
    payload:JSON.stringify(payload), muteHttpExceptions:true
  });
  const json = JSON.parse(response.getContentText());
  const choice = json.choices[0];
  if (choice.finish_reason !== 'stop') throw new Error('truncated: '+choice.finish_reason);
  return String(choice.message.content).trim();
}
```

_max_tokens 명시 + finish_reason 검증 — 미명시 시 PART 2~3에서 잘림_

**`appscript/Code.gs`**

```javascript
function parseGuideScript(rawMarkdown) {
  const empty = {part1:'',part2:'',part3:'',part4:'',part5:''};
  if (!rawMarkdown) return empty;
  const tokens = String(rawMarkdown).trim().split(/##\s*PART\s*(\d+)[^\n]*\n?/);
  const out = Object.assign({}, empty);
  for (let i = 1; i < tokens.length; i += 2) {
    const n = Number(tokens[i]);
    if (n >= 1 && n <= 5) out['part'+n] = String(tokens[i+1] || '').trim();
  }
  return out;
}
```

_JS는 \Z 미지원 — split + capture group이 가장 안전한 markdown 섹션 파서_

#### Problems & Solutions

**Problem:** OpenAI 응답이 PART 2 헤더에서 잘려 5 PART 파싱 실패

- **Root cause:** max_tokens 미명시 + finish_reason 검증 부재 → truncation 응답을 정상으로 통과시킴
- **Solution:** max_tokens=2500 명시 + finish_reason 'stop' 검증 throw
- **Prevention:** OpenAI 호출 wrapper 작성 시 항상 두 가지 같이 도입

**Problem:** parseGuideScript의 정규식이 마지막 PART를 못 잡음

- **Root cause:** JS 정규식에 \Z 미지원 — lookahead (?=...|\Z)가 작동 안 함
- **Solution:** lookahead 대신 split + capture group
- **Prevention:** JS에서 markdown 섹션 파싱은 split 기본 채택

#### Learnings

- OpenAI Chat Completions API는 max_tokens 미명시 시 짧게 잘리는 경우가 흔함
- JS 정규식은 \A/\Z 미지원 — multiline anchor 필요 시 split이 안전
- GPT 응답 형식 강제는 system 프롬프트 + 후처리 검증 두 단계 필요

---

### ✨ `feat(gas)`: 별도 Mailer Web App + 5분 polling 자동 발송 (Phase 4)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `appscript/mailer/Code.gs`

#### Context

MailApp.sendEmail은 스크립트 소유자 계정으로 발송. 메인 GAS smart@paxc.co.kr 계정에서 직접 호출 시 발신자도 smart로 됨. 발신자는 jhtechsmart@gmail.com이어야 해서 별도 GAS 프로젝트 분리 배포 필요.

#### Implementation

appscript/mailer/Code.gs 신규 — jhtechsmart@gmail.com 별도 배포. doPost가 토큰 검증 + Drive 첨부 blob + MailApp.sendEmail. 메인 GAS의 pollAndSendGuides가 LockService + 30건/회 + 5분 cooldown. setupTriggers()가 5분 trigger 멱등 자동 등록.

#### Key Code

**`appscript/Code.gs`**

```javascript
function setupTriggers() {
  const existing = ScriptApp.getProjectTriggers();
  let removed = 0;
  existing.forEach(t => {
    if (t.getHandlerFunction() === 'pollAndSendGuides') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  ScriptApp.newTrigger('pollAndSendGuides')
    .timeBased()
    .everyMinutes(MAIL_POLL_INTERVAL_MIN)
    .create();
  Logger.log('setupTriggers: '+removed+'개 삭제 + '+MAIL_POLL_INTERVAL_MIN+'분 trigger 생성');
}
```

_Trigger 자동화 — 멱등(기존 동일 함수 trigger 모두 삭제 후 새로 1개)_

#### Architecture Decisions (ADR)

**Decision:** 별도 Mailer Web App vs MailApp 직접 호출

- **Context:** 메인 GAS 계정과 메일 발신자 계정이 다른 운영 요구사항
- **Options considered:**
  - MailApp 직접 (발신자가 smart로 됨)
  - 별도 GAS Web App HTTP 분리
  - Workspace 도메인 위임
- **Chosen:** 별도 Mailer Web App 배포
- **Rationale:** bpksmart2026에서 검증된 패턴. 토큰 인증으로 호출 보호. 운영 부담 적음.
- **Consequences:** MAILER_TOKEN 양쪽 동일 유지 필요. 25MB 첨부 한도. 디버깅 시 양쪽 로그 확인.

#### Learnings

- GAS Web App 배포의 '실행 권한: 나'는 그 계정 권한으로 동작 — MailApp 발신자 제어에 결정적
- Time-driven trigger를 코드로 멱등 등록하면 GAS UI 수동 설정 불필요

---

### ✨ `feat(gas)`: Notion DB 단방향 push + 양방향 sync (Phase 5~6)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### Context

운영자가 노션을 메인 환경으로 쓰면서 사업이 시작되기 전 사전 등록 페이지를 만들어 두는 시나리오 + 노션 이메일 수정이 시트에 자동 반영되어 다음 polling에 자동 재발송 시나리오. 양방향은 무한루프 위험이라 hash 기반 차단 필수.

#### Implementation

NOTION_PROP_MAP 40개. pushToNotion 1순위 Notion_PageID → 2순위 OR(접수번호, 사업자번호) → 3순위 새 페이지. ensureNotionSchema 누락 속성 자동 추가 + 타입 mismatch 경고. 양방향은 BIDIRECTIONAL_FIELDS 6개만. syncFromNotion이 last_edited_time fetch + SHA-256 hash 비교 last-write-wins. push 끝에 hash 저장으로 핑퐁 차단. _safePushToNotion이 SpreadsheetApp.flush() 선행.

#### Key Code

**`appscript/Code.gs`**

```javascript
function _applyNotionPageToSheet(page) {
  const reqId = _extractReqIdFromPage(page);
  const notionValues = _extractBidirectionalFromNotion(page);
  const notionHash = _calcBidirectionalHash(notionValues);
  const lastHash = _getStoredHash(reqId);
  if (lastHash === notionHash) return {skipped:'hash equal'};
  const row = _readUnifiedRow(reqId);
  const sheetValues = {};
  BIDIRECTIONAL_FIELDS.forEach(k => { sheetValues[k] = row[k]; });
  const sheetHash = _calcBidirectionalHash(sheetValues);
  if (lastHash === sheetHash) {
    _updateUnifiedFields(reqId, notionValues);
    _setStoredHash(reqId, notionHash);
    return {applied:true};
  }
  _setStoredHash(reqId, sheetHash);
  _safePushToNotion(reqId);
  return {skipped:'conflict resolved to sheet'};
}
```

_양방향 sync의 핵심 — 3중 hash 비교 + last-write-wins_

#### Architecture Decisions (ADR)

**Decision:** Notion sync 범위 — 단방향 전체 vs 양방향 일부

- **Context:** 운영자가 노션에서 이메일 오타 수정 + 견적 금액·날짜 등 마스터 데이터는 시트가 master
- **Options considered:**
  - 단방향 유지
  - 전체 양방향
  - 핵심 6필드만 양방향
- **Chosen:** 핵심 6필드만 양방향 (이메일/연락처/상태/담당자/발송요청/발송상태)
- **Rationale:** 운영자 시나리오와 마스터 데이터 보호 둘 다 만족. 34필드는 단방향 유지로 시트가 master.
- **Consequences:** hash 무한루프 차단 로직 필요. 동시 수정 시 시트 우선. 신청관리 시트와 통합정보 시트 두 곳 동시 update 필요.

#### Problems & Solutions

**Problem:** 견적 발급 이후 노션 PATCH가 모두 실패

- **Root cause:** _safePushToNotion이 setValues 직후 호출 → batch write flush 안 된 옛 값 read + handleSaveQuote/_ensureGuideForUnified 끝 push 훅 누락
- **Solution:** _safePushToNotion에 SpreadsheetApp.flush() 선행 + 누락 push 훅 2곳 추가 + [NOTION PUSH FAILED] 로그
- **Prevention:** GAS에서 setValues 직후 즉시 read는 flush() 명시. push 호출은 모든 시트 update 후 일관 배치.

**Problem:** Notion 매출 컬럼 타입 변경 후 PATCH 전체 validation_error

- **Root cause:** NOTION_PROP_MAP rich_text인데 노션은 number — 한 필드 mismatch면 전체 reject
- **Solution:** 매출 매핑 number로 정렬 + ensureNotionSchema에 타입 mismatch 경고
- **Prevention:** 노션 속성 변경 시 ensureNotionSchema ▶ 실행으로 mismatch 검출

#### Learnings

- GAS의 SpreadsheetApp.setValues는 batch write — 직후 read는 flush() 필수
- Notion API PATCH는 한 필드라도 invalid면 전체 reject — 부분 성공 없음
- 양방향 sync 무한루프 차단은 push 끝 hash 저장 + sync 비교 두 지점 모두 필요

---

### ✨ `feat(ui)`: admin.html 즉시 발송 + 이메일·연락처 인라인 수정 (Phase 7)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `admin.html`

#### Context

5분 polling은 지연이 있어 진짜 즉시 처리 시나리오에 안 맞음. admin 운영자가 PC에서 수 초 안에 메일주소 수정+재발송 가능하게.

#### Implementation

handleUpdateRequest — 이메일/연락처만 허용 + 본인 담당 또는 관리자 + 신청관리 + 통합정보 + 노션 동시 update. handleResendGuide — sendGuideForRow 직접 호출 + 분당 1회 throttle. admin.html Quote Summary 카드 안 '발송 정보' 섹션 추가 — view↔edit 토글 + '지금 메일 발송' primary 버튼. 권한 isAssignedToMe && !viewingPastVersion.

#### Key Code

**`appscript/Code.gs`**

```javascript
function handleResendGuide(data, user) {
  if (!data.id) return jsonResponse({status:'error', message:'id 누락'});
  const perm = _checkRequestPermission(data.id, user);
  if (!perm.ok) return perm.error;
  const props = PropertiesService.getScriptProperties();
  const key = 'resend_throttle_'+data.id;
  const lastTry = Number(props.getProperty(key) || 0);
  if (lastTry && Date.now() - lastTry < 60000) {
    const wait = Math.ceil((60000 - (Date.now()-lastTry))/1000);
    return jsonResponse({status:'error', code:'THROTTLED', message:'분당 1회 — '+wait+'초 후'});
  }
  props.setProperty(key, String(Date.now()));
  const row = _readUnifiedRow(data.id);
  if (!row['가이드_HTML_URL']) return jsonResponse({status:'error', message:'가이드 본문 없음'});
  sendGuideForRow(row);
  return jsonResponse({status:'ok'});
}
```

_PropertiesService 활용한 per-key 분당 1회 throttle 패턴_

#### Learnings

- admin UI 액션은 토큰 인증 + 본인 담당 권한 + 분당 throttle 3중 보호 기본
- 이메일 인라인 편집: view↔edit 토글 + 정규식 검증 + 시트 응답 후 currentReq+allRequests 동기화 + renderDetail

---

### 🐛 `fix(polish)`: 운영 안정성 fix들 — KST timezone / 사이드바 ring / 날짜 가독성 / SVG 아이콘 / 발송완료 재발송

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `admin.html`

#### Context

Phase 1~7 진행 중 만난 운영 이슈들을 인라인 fix. 작지만 운영 체감에 큰 영향.

#### Implementation

1) GAS 응답 날짜 필드 KST 포매팅(_fmtKstDateTime/_fmtKstDate) — UTC ISO 직렬화 문제 해결. 2) 사이드바 active ring 짤림 — padding 4px 2px 추가. 3) 날짜 표시 가독성 — bold 날짜 + opacity 강약, color는 부모 상속. 4) 연필 이모지 → SVG 단색 아이콘 4곳 통일 (stroke=currentColor). 5) pollAndSendGuides의 발송완료 skip 제거 — 운영자 재체크 시 5분 cooldown만 지나면 재발송.

#### Learnings

- Google Sheets 셀이 Date 객체로 인식되면 JSON 직렬화 시 UTC ISO 됨 — KST 포매팅 통일
- box-shadow ring이 overflow:auto 경계에서 잘림 — ring 두께보다 큰 padding이 안전
- SVG icon stroke=currentColor는 부모 색 상속해 배경 무관 자동 대응

---

## Changes Summary

### Added

- 통합정보 시트 (UNIFIED_HEADERS 42컬럼)
- 이메일 템플릿 + Drive 저장 + GPT 5 PART 자동 생성
- 별도 Mailer Web App (jhtechsmart@gmail.com 발신)
- Time-driven 5분 polling + LockService
- Notion DB 단방향 push + 사전 등록 페이지 자동 병합 (사업자번호 OR)
- Notion 양방향 sync 6필드 + SHA-256 hash 무한루프 차단
- admin.html 즉시 발송 + 이메일/연락처 인라인 수정
- 분당 1회 throttle + 5분 cooldown
- 인감 PNG repo 포함
- 개발노트 + 이식 가이드 (docs/devlog-2026-05-13.md, docs/portability-guide.md)

### Changed

- GAS 응답 날짜 KST 포매팅 통일
- 날짜 표시 형식 bold + opacity 강약
- 연필 이모지 → SVG 단색 아이콘 4곳 통일
- polling trigger 10분 → 5분
- Notion 매출 컬럼 타입 number로 정렬
- 발송완료 상태에서 재체크 시 재발송 가능

### Fixed

- OpenAI 응답 truncation — max_tokens 2500 + finish_reason 검증
- parseGuideScript 마지막 PART 못 잡음 — split + capture group
- 노션 PATCH 실패 — SpreadsheetApp.flush() + push 훅 누락 2곳 보강
- 헤더 중간 삽입 시 중복 컬럼 — PDF URL을 헤더 끝으로 이동
- 사이드바 active ring 짤림 — padding 4px 2px
- 버전이력 클릭 시 Quote Summary 갱신 안됨 — recalcPrice viewingPastVersion 가드
- 신청중 상태 좌우 박스 어긋남 — #versionHistorySection:empty{display:none}

### Removed

- pollAndSendGuides의 '발송상태 발송완료 skip' 조건 (운영자 재체크 시나리오 막음)

---

## Next Steps

- [ ] GPT 프롬프트(GUIDE_SYSTEM_PROMPT) 응답 품질 개선 — 회사 규모·업종별 어조 차별화
- [ ] 운영 안정화 관찰 1~2주 — 이메일 한도, Notion API rate, GPT 비용 모니터링
- [ ] 필요 시 polling 3분 단축 또는 admin 발송 이력 패널 추가

---

## References & Links

- [bpksmart2026 reference 프로젝트](file:///Users/seonjecho/Projects/bpksmart2026)
- [Notion API Reference](https://developers.notion.com/reference/property-object)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)

---

## Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 이 프로젝트는 GAS + Google Sheets + Notion + OpenAI 통합 시스템. UNIFIED_HEADERS 신규 컬럼은 무조건 배열 끝에 추가(중간 삽입 금지). Notion sync 코드는 push 끝에서 hash 저장 필수(무한루프 차단). MailApp 발신자가 메인 계정과 다르면 별도 Mailer Web App 분리 배포. SpreadsheetApp.flush()는 setValues 직후 즉시 read하기 전 호출. OpenAI API는 max_tokens + finish_reason 검증 필수. 운영 코드 적용 전 본인 검증(node 구문 + grep 일관성) 통과 후 사용자에게 안내, 절대 경로 pbcopy 명령 제시.

**Reusable patterns introduced today:**

- `통합 마스터 시트 (UNIFIED_HEADERS + upsertUnified)` — 여러 입력 소스를 한 시트로 합쳐 외부 시스템과 1:1 매칭. 헤더 끝 append만, 빈 값 덮어쓰기 방지, 버전 비교 멱등. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `별도 Mailer Web App (계정 분리 발송)` — MailApp 발신자 ≠ 메인 GAS 계정일 때 별도 GAS 프로젝트 분리 배포. 토큰 인증 + 25MB 첨부 자동 skip + urlencoded(data=JSON) 호출. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/mailer/Code.gs`)
- `Time-driven trigger 자동화 (setupTriggers)` — 기존 동일 함수 trigger 모두 삭제 + 새 간격 1개 생성. 멱등. 간격 변경 시 상수 수정 + 1회 실행. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `OpenAI 5 PART 응답 + split capture group 파싱` — 한 번 GPT 호출로 5섹션 마크다운 받아 split(/##\s*PART\s*(\d+)/) capture group으로 안전 분리. JS \Z 미지원 회피. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `Notion 멱등 upsert + 다중 매칭 키` — 1순위 Notion_PageID 캐시 → 2순위 OR(접수번호, 사업자번호) query → 3순위 새 페이지. 사전 등록 페이지 자동 병합. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `양방향 sync + SHA-256 hash 무한루프 차단` — BIDIRECTIONAL_FIELDS만 양방향. push 끝 hash 저장 → sync 시 노션/시트/저장 hash 3중 비교 last-write-wins. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
- `PropertiesService per-key throttle` — admin 즉시 발송 같은 액션에 적용. resend_throttle_<reqId> 키로 마지막 시도 timestamp 저장 + 60초 차단. (see `/Users/seonjecho/Projects/jhtechsmart/appscript/Code.gs`)
