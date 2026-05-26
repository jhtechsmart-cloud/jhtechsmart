# jhtechsmart — Dev Note: 메일-첨부3개-템플릿수정-clasp설정

> **📅 Date:** 2026-05-18 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** 메일-첨부3개-템플릿수정-clasp설정
> **👤 Author:** — · **🔖 Tags:** gas, mailer, email, clasp, drive, template

---

## TL;DR

메일 발송 시 사업신청 메뉴얼 PDF 3번째 첨부 추가 + 이메일 템플릿 수정 워크플로우 확립 + clasp 설정으로 GAS 직접 배포 환경 구축

---

## Today's Work

### ✨ `feat(appscript/Code.gs)`: 메일 첨부파일 3개 추가 (사업신청 메뉴얼.pdf)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`, `manual.pdf`

#### 📋 Context (왜)

기존 메일에 견적서 PDF + 장비사진 PDF 2개만 첨부되던 것을 사업신청 메뉴얼.pdf를 추가해 3개로 늘려야 했음

#### 🔨 Implementation (무엇을 어떻게)

sendGuideForRow()의 attachments 배열에 Drive URL로 사업신청 메뉴얼.pdf 추가. 최종적으로 Google Drive URL 방식 사용 (https://drive.google.com/file/d/1IkDhoJW3joslgTmpsw8rIwlzsRv0vtrN/view)

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
attachments.push({url: 'https://drive.google.com/file/d/1IkDhoJW3joslgTmpsw8rIwlzsRv0vtrN/view', name: '사업신청 메뉴얼.pdf'});
```

_sendGuideForRow() 내 3번째 첨부파일 추가_

#### 📐 Architecture Decisions (ADR)

**Decision:** 첨부파일 URL 방식: GitHub Pages vs Google Drive

- **Context:** 처음엔 GitHub Pages URL로 시도했으나 메일에 첨부 안 됨
- **Options considered:**
    - GitHub Pages URL
    - Drive Script Property (fileId)
    - Drive 공개 URL 직접 하드코딩
- **Chosen:** Drive 공개 URL 직접 하드코딩
- **Rationale:** Mailer Web App의 _resolveAttachments()가 Drive URL에서 파일 ID를 추출해 DriveApp으로 처리하는 구조. 외부 URL(GitHub Pages 등)은 파일 ID 추출 실패로 조용히 skip됨. Drive URL만 신뢰할 수 있음.
- **Consequences:** 파일 교체 시 코드 수정 필요. 하지만 사업신청 메뉴얼은 거의 변경 없으므로 허용 가능한 트레이드오프

#### 🐛 Problems & Solutions

**Problem:** GitHub Pages URL로 첨부 시 메일에 2개만 첨부됨

- **Root cause:** Mailer Web App _resolveAttachments()가 URL에서 Drive 파일 ID(/d/{id}/ 패턴)를 추출하는 구조. GitHub Pages URL엔 파일 ID 없으므로 조용히 skip
- **Solution:** Google Drive에 파일 업로드 후 Drive URL 사용. Mailer 코드 수정 없이 기존 패턴 그대로 동작
- **Prevention:** 새 첨부파일 추가 시 반드시 Google Drive URL 형태(drive.google.com/file/d/{id}/view) 사용할 것

#### 💡 Learnings

- Mailer Web App은 Drive URL만 처리 가능 — 외부 URL 추가 시 _resolveAttachments 수정 필요
- Logger.log로 attachments 배열 디버깅이 Code.gs vs Mailer 책임 분리에 결정적 도움
- 첨부파일 name 필드는 실제 파일명과 무관 — 수신자에게 보이는 이름만 결정

---

### 📝 `docs(appscript/Code.gs)`: 이메일 본문 템플릿 수정 워크플로우 확립

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

이메일 본문인 jaehyun_tech_guide_fixed.html(Drive 저장)을 수정했으나 발송 메일에 반영이 안 되는 문제 발생

#### 🔨 Implementation (무엇을 어떻게)

템플릿 캐시(5분) 클리어 + forceRegenGuide() 함수로 강제 재생성. 캐시 클리어와 재생성을 같은 실행 컨텍스트에서 수행하는 것이 핵심.

#### 💻 Key Code

**`Apps Script 콘솔`**

```javascript
function forceRegenGuide() {
  const reqId = 'REQ-접수번호';
  CacheService.getScriptCache().remove('jhtech_guide_template_v1');
  _updateUnifiedField(reqId, '가이드_version', 0);
  const row = _readUnifiedRow(reqId);
  row['가이드_version'] = 0;
  const result = _ensureGuideForUnified(row);
  Logger.log('재생성 결과: ' + JSON.stringify(result));
}
```

_템플릿 수정 후 기존 가이드 강제 재생성 함수_

#### 📐 Architecture Decisions (ADR)

**Decision:** 가이드 재생성 트리거 방식

- **Context:** 가이드_version 0 리셋만으로는 재생성 안 됨
- **Options considered:**
    - 가이드_version 0 리셋 후 수동 재발급
    - forceRegenGuide() 직접 실행
- **Chosen:** forceRegenGuide() 직접 실행
- **Rationale:** _ensureGuideForUnified는 PDF 업로드 시에만 자동 호출됨. 캐시 클리어와 재생성을 한 실행 컨텍스트에서 묶어야 타이밍 이슈 방지
- **Consequences:** 앞으로 새 견적은 자동으로 새 템플릿 적용. 기존 생성된 가이드만 수동 재생성 필요

#### 🐛 Problems & Solutions

**Problem:** 템플릿 수정 후 캐시 클리어해도 이메일 내용 미반영

- **Root cause:** 타이밍 문제: 재발급 확정 시 구 캐시로 가이드 생성 → 이후 캐시 클리어 → 이미 가이드_version이 최신값이라 재생성 skip
- **Solution:** 캐시 클리어 + 가이드_version 0 리셋 + _ensureGuideForUnified 호출을 forceRegenGuide()로 한 번에 실행
- **Prevention:** 템플릿 수정 직후 forceRegenGuide()를 즉시 실행하거나, 새 견적부터는 자동 반영되므로 기존 건만 수동 처리

#### 💡 Learnings

- _ensureGuideForUnified는 PDF 업로드(handleSaveQuote) 시에만 자동 호출 — 단순 재발송은 재생성 없음
- 가이드 HTML은 Drive에 pre-generated로 저장된 정적 파일 — 템플릿 변경이 즉시 반영되지 않음
- background-color:#f9f5ed div 안쪽은 GPT가 덮어쓰는 영역 — 템플릿 수정 시 이 div 바깥만 수정해야 함

---

### 🔧 `chore(.clasp.json)`: clasp 설정으로 GAS 직접 배포 환경 구축

**Status:** `completed`  
**Files changed:** `.clasp.json`, `.claspignore`, `appscript/appsscript.json`

#### 📋 Context (왜)

매번 Code.gs 내용을 Apps Script 에디터에 수동으로 붙여넣는 불편함 해소

#### 🔨 Implementation (무엇을 어떻게)

clasp(smart@paxc.co.kr 이미 로그인) + scriptId 등록 + fileExtension:gs 설정 + mailer 폴더 .claspignore 처리

#### 📐 Architecture Decisions (ADR)

**Decision:** clasp fileExtension 설정

- **Context:** clasp pull 시 Code.js 생성되어 Code.gs와 충돌
- **Options considered:**
    - Code.gs → Code.js 리네임
    - fileExtension:gs 설정
- **Chosen:** fileExtension:gs 설정
- **Rationale:** 기존 .gs 파일명 유지, git 이력 보존
- **Consequences:** clasp push/pull 시 .gs 파일 기준으로 동작

#### 🐛 Problems & Solutions

**Problem:** clasp pull 후 Code.js 생성되어 Code.gs와 이중 존재

- **Root cause:** clasp 기본 fileExtension이 js
- **Solution:** .clasp.json에 fileExtension:gs 추가 후 Code.js 삭제
- **Prevention:** .clasp.json 초기 설정 시 fileExtension 명시 필수

**Problem:** .claspignore로 mailer/ 폴더 제외 안 됨

- **Root cause:** 패턴 문법 문제 — appscript/mailer/** 단독으론 미작동
- **Solution:** **/mailer/**, mailer/**, mailer/ 3줄 병기
- **Prevention:** clasp ignore 패턴은 복수 형태로 명시

#### 💡 Learnings

- clasp push 후 GAS에서 배포 관리 → 새 버전 업데이트 단계가 반드시 필요
- mailer는 별도 GAS 프로젝트(jhtechsmart@gmail.com) — 같은 clasp로 관리 불가

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: Mailer 첨부 구조 역추적

```
사업신청 메뉴얼을 attachments.push({url: 'github-pages-url'})로 읽어오는게 아니고 견적서 파일처럼 row['견적PDF_URL']로 읽어오게 하는게 더 나은 방법일까?
```

**교훈:** 아키텍처 의문을 제기하는 방식으로 근본 원인(Mailer Drive URL 전용 구조)을 찾아내는 데 기여

### ✅ 잘 통한 프롬프트: 로그로 책임 분리 디버깅

```
코드는 이렇게 되어 있고 배포도 했는데 아직도 그 상태야
```

**교훈:** Logger.log로 Code.gs 출력을 먼저 확인해 Code.gs vs Mailer Web App 책임 분리 — 문제 범위를 절반으로 좁히는 효율적 방법

---

## 📋 Changes Summary

### Added

- 메일 발송 시 사업신청 메뉴얼.pdf 3번째 첨부
- manual.pdf 파일 GitHub Pages 정적 서빙
- clasp 설정 (.clasp.json, .claspignore, appsscript.json)

### Changed

- 첨부파일 URL: GitHub Pages → Google Drive URL로 변경

---

## ⏭️ Next Steps

- [ ] 동일 기능을 다른 프로젝트에 이식 (프롬프트 작성 완료)
- [ ] 사업신청 메뉴얼.pdf 업데이트 시 Drive 파일 교체 후 Code.gs URL 수정 필요

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 메일 첨부 추가 시 반드시 Google Drive URL(drive.google.com/file/d/{id}/view) 사용. GitHub Pages 등 외부 URL은 Mailer _resolveAttachments에서 silent skip됨. 이메일 템플릿(jaehyun_tech_guide_fixed.html) 수정 후 기존 가이드 반영은 forceRegenGuide()로 캐시 클리어+재생성을 한 번에 실행해야 함. Code.gs 변경은 clasp push → GAS 배포 관리 → 새 버전 순서.

**Reusable patterns introduced today:**

- `forceRegenGuide` — 이메일 템플릿 수정 후 기존 업체 가이드 강제 재생성. 캐시 클리어 + 가이드_version 리셋 + _ensureGuideForUnified 직접 호출을 한 실행 컨텍스트에서 처리
    - 파일: `Apps Script 콘솔 (임시 함수)`
