# jhtechsmart — Dev Note: 메일-가이드-플레이스홀더-버그-수정

> **📅 Date:** 2026-05-23 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** 메일-가이드-플레이스홀더-버그-수정
> **👤 Author:** — · **🔖 Tags:** GAS, email, bug-fix, guide-mail, placeholder, idempotency

---

## TL;DR

'지금 메일발송' 버튼이 구 가이드 HTML(플레이스홀더 미치환)을 그대로 발송하는 버그 2-pass 수정. 26차: _mergeQuotePlaceholders 도입, 27차: handleResendGuide 강제 재생성으로 근본 해결.

---

## Today's Work

### 🐛 `fix(appscript/Code.gs)`: 메일 발송 경로별 플레이스홀더 치환 보장 (26차 + 27차)

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

'지금 메일발송' 클릭 시 예전 템플릿({{HW_합계}} 등 플레이스홀더 자체가 없는 구 가이드 HTML)이 그대로 발송됨. _mergeQuotePlaceholders가 로컬에는 있었지만 미배포 + 멱등 체크로 구 파일 재생성도 안 됨.

#### 🔨 Implementation (무엇을 어떻게)

26차: _mergeQuotePlaceholders 신규 작성, _ensureGuideForUnified(생성)와 sendGuideForRow(발송) 양쪽 적용. 배포 후 실테스트에서 여전히 구 메일 수신. 27차: 근본 원인 = 구 가이드 파일 자체에 플레이스홀더 없음(도입 전 생성). handleResendGuide에서 가이드_version=0 리셋 → _ensureGuideForUnified 강제 재호출 → 최신 템플릿+GPT+금액 치환 HTML Drive 저장 → 새 URL로 발송.

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
function _mergeQuotePlaceholders(html, row) {
  const hwTotal = Number(String(row['합계'] || '0').replace(/,/g, '')) || 0;
  if (!hwTotal) return html;
  const bizTotal = Math.round(hwTotal / 0.8);
  const govGrant = Math.round(bizTotal * 0.6);
  // {{HW_합계}}, {{사업비_합계}}, {{정부지원금}} 등 10개 치환
}
```

_신규: 견적금액 기반 플레이스홀더 치환_

**`appscript/Code.gs`**

```javascript
// handleResendGuide 강제 재생성
_updateUnifiedField(data.id, '가이드_version', 0);
row['가이드_version'] = 0;
_ensureGuideForUnified(row);
row = _readUnifiedRow(data.id);
sendGuideForRow(row);
```

_즉시발송: 멱등 체크 우회 → GPT 재생성 → 발송_

#### 📐 Architecture Decisions (ADR)

**Decision:** sendGuideForRow에도 _mergeQuotePlaceholders 안전망 적용


**Decision:** handleResendGuide에서 GPT 재호출 감수


**Decision:** 자동 발송(pollAndSendGuides) 경로 변경 없음


#### 🐛 Problems & Solutions

**Problem:** 

- **Root cause:** 구 가이드 파일 자체에 {{HW_합계}} 없음(도입 전 생성) + 멱등 체크로 재생성 안 됨

#### 💡 Learnings

- idempotency 함정: 버전 기반 멱등은 데이터 동일성만 보호, 파일이 최신 템플릿 기반인지는 보장 못 함
- at-generation vs at-send: 즉시발송처럼 신선도 중요 경로는 발송 시 재생성이 정답
- 실사용 테스트 필수: 코드 레벨 수정이 맞아 보여도 실제 저장 데이터 상태를 이길 수 없음

---

### ✨ `feat(appscript/Code.gs)`: 통합정보·견적서발급관리 장비명칭 컬럼 추가

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

메일 본문 {{HW_명칭}} 플레이스홀더에 장비 한국어 명칭 제공 필요

#### 🔨 Implementation (무엇을 어떻게)

UNIFIED_HEADERS에 장비명칭 추가. _getEquipDetail(modelName)로 모델명→한국어 카테고리 변환. upsertUnified·handleConfirm·_buildQuoteRow 반영. backfillEquipDetail 백필 유틸 제공.

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 증상+경로 기반 버그 신고

```
지금 견적서를 발급하면 견적금액들이 들어가 있는 메일 본문을 보내도록 되어 있는데, 견적서 발급 후 다시 메일을 보내려고 '지금 메일발송'버튼을 누르면 예전 템플릿으로 메일본문이 발송되어 있어. 확인해봐
```

**교훈:** 예상 동작 + 실제 동작 + 재현 경로를 한 문장에 담고 '확인해봐'로 원인 파악 위임 — 근본 원인 추적이 필요한 버그에 효과적

### ✅ 잘 통한 프롬프트: 미배포 로컬 변경 공유로 불일치 진단

```
잠깐만.. 난 플레이스홀더가 있는 본문메일을 보내라고 최종 수정했었는데???
```

**교훈:** 로컬에 수정이 있는데 GAS와 동작이 다를 때 이렇게 알려주면 uncommitted vs deployed 불일치를 같이 진단 가능

### ✅ 잘 통한 프롬프트: 배포 후 실수신 테스트 결과 피드백

```
배포하고, 이미 견적이 발급된 업체 선택 -> 메일 수정 -> '지금 메일발송'버튼 클릭 -> 메일 수신 -> 플레이스홀더 자체가 없는 예전 메일이 들어왔음
```

**교훈:** '플레이스홀더 자체가 없는'이라는 정밀 관찰이 root cause 전환(치환 실패→파일 자체가 구버전)을 가능하게 함. 화살표(->)로 재현 경로 단계화도 효과적

---

## 📋 Changes Summary

### Added

- _mergeQuotePlaceholders(html, row): 견적금액 기반 10개 플레이스홀더 치환
- _getEquipDetail(name): 모델명→한국어 장비명칭 변환
- backfillEquipDetail / backfillUnifiedEquipDetail: 일회성 백필 유틸
- 통합정보·견적서발급관리 '장비명칭' 컬럼

### Changed

- _ensureGuideForUnified: 가이드 생성 시 _mergeQuotePlaceholders 적용
- sendGuideForRow: Drive fetch 직후 _mergeQuotePlaceholders 적용(안전망)
- handleResendGuide: 가이드_version=0 리셋 → 강제 재생성 → 새 URL로 발송
- 견적서발급관리 13→14컬럼(장비명칭)

### Fixed

- '지금 메일발송' 버튼이 구 가이드 HTML(옛 템플릿)을 그대로 발송하는 버그

---

## ⏭️ Next Steps

- [ ] 운영 GAS 에디터에서 기존 발급 업체들 regenerateGuide(reqId) 실행 — 폴링 발송 경로도 최신 HTML로 갱신
- [ ] pollAndSendGuides 자동 발송 경로 신규 발급 테스트 — 플레이스홀더 치환 확인
- [ ] 메일 템플릿 {{HW_명칭}} 자리에 장비명칭 실제 표시 확인

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> handleResendGuide는 항상 가이드_version=0 리셋 후 _ensureGuideForUnified 재호출로 재생성한다 — 저장된 구 파일을 직접 쓰지 않는다. sendGuideForRow의 _mergeQuotePlaceholders는 안전망이며 근본 해결은 재생성이다. 새 mutation 기능 추가 시 runExclusive 게이트 + pre-mortem 5문항 필수.

**Reusable patterns introduced today:**

- `idempotency-version-reset` — 버전 기반 멱등 체크를 우회해 강제 재생성: 가이드_version=0 리셋 → _ensureGuideForUnified 재호출
    - 파일: `appscript/Code.gs (handleResendGuide)`
- `dual-placeholder-merge` — 플레이스홀더 치환을 생성 시(Drive 저장)와 발송 시(fetch 후) 양쪽 적용 — 구·신 파일 모두 커버
    - 파일: `appscript/Code.gs (_ensureGuideForUnified + sendGuideForRow)`
