# jhtechsmart — Dev Note: 이메일-본문-SECTION04-사업비구성-자동치환

> **📅 Date:** 2026-05-22 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** 이메일-본문-SECTION04-사업비구성-자동치환
> **👤 Author:** — · **🔖 Tags:** GAS, GuideMail, clasp, 메일발송, NotionSync, git

---

## TL;DR

메일 자동발송 시 사업신청 메뉴얼 PDF 첨부 비활성화 + 미커밋 변경분(실행로그 시트, 동기화 큐 트리거 등) 일괄 커밋·푸시. GAS 배포 흐름(clasp push vs git push) 정리.

---

## Today's Work

### 🐛 `fix(GuideMail.gs)`: 메일 첨부 사업신청 메뉴얼 비활성화

**Status:** `completed`  
**Files changed:** `apps_script/GuideMail.gs`

#### 📋 Context (왜)

견적서 발급 후 자동 발송되는 메일에 첨부파일이 3개였는데, 메뉴얼은 나중에 재작성 예정이라 일시 제외 요청

#### 🔨 Implementation (무엇을 어떻게)

sendGuideForRow 내 메뉴얼 첨부 try 블록 전체를 주석 처리. TODO 태그로 복원 포인트 표시.

#### 📐 Architecture Decisions (ADR)

**Decision:** 삭제 대신 주석 처리 — 나중에 재작성 예정이므로 로직 보존


---

### ✨ `feat(Code.gs, NotionSync.gs)`: 실행로그 시트 + 동기화 큐 트리거 + 유틸 함수 추가 커밋

**Status:** `completed`  
**Files changed:** `apps_script/Code.gs`, `apps_script/NotionSync.gs`

#### 📋 Context (왜)

이전 세션에서 작업된 변경분이 로컬에만 있고 GitHub에 미커밋 상태였음. 내용 확인 후 일괄 커밋 요청.

#### 🔨 Implementation (무엇을 어떻게)

Code.gs: autoInitSheets 에러 로그 추가, getLatestQuotePdf totalCompanyFiles 버그 수정. NotionSync.gs: _sheetLog, upsertUnified guide 컬럼 보존, rebuildContentHash/setupSyncQueueTrigger/runSyncQueue/pushUnifiedByBizno 추가.

#### 📐 Architecture Decisions (ADR)

**Decision:** GuideMail.gs와 별도 커밋으로 분리 — 변경 목적이 다름


---

### 📝 `docs(workflow)`: GAS 배포 흐름 정리 (clasp push vs git push)

**Status:** `completed`  
**Files changed:** _(미지정)_

#### 📋 Context (왜)

GitHub push 후 GAS 에디터에 변경이 반영되지 않아 혼선 발생

#### 🔨 Implementation (무엇을 어떻게)

GAS 실제 동작은 구글 드라이브 코드 기준. git push는 백업. 실배포는 clasp push → GAS 배포 관리 순서.

#### 📐 Architecture Decisions (ADR)

**Decision:** clasp push를 배포 프로세스에 명시적으로 포함해야 함


#### 🐛 Problems & Solutions

**Problem:** 


#### 💡 Learnings

- GAS 프로젝트는 git push(백업) + clasp push(실배포) 두 단계 모두 필요

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 변경 전 위치 확인 요청 패턴

```
어디를 수정할지 나한테 먼저 말하고 내가 오케이하면 수정해
```

**교훈:** 수정 전 위치·방법을 먼저 보고하고 승인 후 실행 — 리뷰 없이 바로 변경하면 안 되는 맥락에서 유효

### ✅ 잘 통한 프롬프트: 삭제 대신 주석 처리 지시

```
블럭 전체를 주석처리해줘. 나중에 다시 작성을 해야 하니까
```

**교훈:** 재작성 예정 코드는 삭제보다 주석 처리 + TODO 태그가 안전. 복원 포인트 명시.

---

## 📋 Changes Summary

### Added

- NotionSync.gs: _sheetLog 함수
- NotionSync.gs: rebuildContentHash 유틸
- NotionSync.gs: setupSyncQueueTrigger / runSyncQueue
- NotionSync.gs: pushUnifiedByBizno 유틸

### Changed

- NotionSync.gs: upsertUnified — guide 컬럼 보존 로직
- NotionSync.gs: 에러 로그 Logger.log → _sheetLog 전환
- Code.gs: autoInitSheets 실패 시 에러 내용 출력

### Fixed

- Code.gs: getLatestQuotePdf totalCompanyFiles 반환값 버그
- GuideMail.gs: 메일 첨부 메뉴얼 PDF 비활성화 (3개 → 2개)

---

## ⏭️ Next Steps

- [ ] clasp push 실행 → GAS에 실제 반영
- [ ] GAS 에디터에서 배포 관리 → 새 버전 배포
- [ ] 사업신청 메뉴얼 첨부 로직 재작성 (GuideMail.gs ~775번째 줄 TODO 블록)

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> GAS 프로젝트는 git push(GitHub 백업)와 clasp push(GAS 실배포)가 분리됨. 코드 수정 후 반드시 clasp push까지 안내해야 배포 완료. 메뉴얼 첨부 블록은 GuideMail.gs ~775번째 줄 주석 상태 — 재작성 시 해당 위치 확인.

**Reusable patterns introduced today:**

- `GAS 실행로그 시트 기록 패턴` — _sheetLog(tag, msg) — 실행로그 시트에 타임스탬프+태그+메시지 자동 기록. 2000행 초과 시 오래된 행 자동 삭제.
    - 파일: `apps_script/NotionSync.gs`
