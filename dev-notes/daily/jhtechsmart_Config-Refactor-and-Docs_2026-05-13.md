# jhtechsmart — Dev Note: Config-Refactor-and-Docs

> **📅 Date:** 2026-05-11 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** Config-Refactor-and-Docs
> **👤 Author:** SeonjeCho · **🔖 Tags:** config, docs, single-source-of-truth

---

## TL;DR

GAS 배포 URL을 quote.html · admin.html 두 곳에 하드코딩하던 구조를 config.js 한 곳으로 분리 (단일 진실 소스). 그 사이 데이터 누락 사고로 신청 데이터가 옛 GAS로 흘러갔던 문제를 근본 차단. CLAUDE.md 작성 + docs/issues.md · docs/code-analysis.md 추가로 코드베이스 인텔리전스 정리.

---

## Today's Work

### ♻️ `refactor(config)`: GAS URL을 config.js로 분리 — 단일 진실 소스

**Status:** `completed`  
**Files changed:** `config.js`, `quote.html`, `admin.html`

#### Context

기존엔 quote.html과 admin.html 양쪽에 GAS 배포 URL을 하드코딩. 새 GAS 배포 시 한쪽만 업데이트하면 다른 쪽이 옛 GAS로 신청을 보내는 데이터 누락 사고 발생.

#### Implementation

config.js 신규 — window.JHTECH_GAS_URL 한 줄. 양쪽 HTML에 <script src=config.js> 추가하고 const APPS_SCRIPT_URL/GAS_URL_DEFAULT = window.JHTECH_GAS_URL || ''. admin.html은 추가로 localStorage gasUrl 오버라이드 지원 — getGasUrl()이 입력값 → localStorage → config.js 폴백 순서.

#### Problems & Solutions

**Problem:** GAS URL 한쪽만 업데이트해서 신청 데이터가 옛 GAS로 갔던 사고

- **Root cause:** quote.html과 admin.html 양쪽에 같은 URL을 별도로 박아둠 — 한쪽 수정 후 다른 쪽 업데이트 누락
- **Solution:** config.js 한 파일로 분리 + 양쪽이 window 전역 변수 참조
- **Prevention:** 환경 설정값은 항상 단일 진실 소스 패턴 — 새 환경 변수 추가 시 첫 단계로 분리 검토

#### Learnings

- 정적 사이트에서도 단일 진실 소스 패턴은 매우 효과적 — 별도 빌드 도구 없이 window 전역으로 충분
- 환경 설정 변경 시 잘못 적용되는 경우 대비해 폴백 우선순위(입력 > localStorage > config.js)를 두면 운영 유연성 확보

---

### 📝 `docs(docs)`: CLAUDE.md + 이슈 추적 + 코드 분석 문서 추가

**Status:** `completed`  
**Files changed:** `CLAUDE.md`, `docs/issues.md`, `docs/code-analysis.md`

#### Context

Claude Code 같은 AI assistant가 프로젝트를 읽고 작업할 때 컨텍스트 부족 — 아키텍처/규칙/주의사항을 한 곳에 정리 + 알려진 이슈 추적.

#### Implementation

CLAUDE.md — 프로젝트 개요, 파일 구조, 개발/배포 워크플로, 아키텍처 핵심 7가지(GAS 통신, config.js 단일 진실, 데이터 모델, 인증/사용자, PDF 파이프라인, 견적서 동기화 규칙, 신청 검증 로직), 보안 자산, 커밋 컨벤션. docs/issues.md — 12개 알려진 문제 + F1~F32 기능 개선 누적 트래커. docs/code-analysis.md — 코드 구조 + 호출 흐름 매핑.

#### Learnings

- AI assistant에 프로젝트 컨텍스트를 주는 CLAUDE.md는 1차 도입 즉시 가치 — 자주 잊는 규칙(syncFormState 호출 순서 등)을 명시하면 회귀 방지
- 이슈를 docs/issues.md에 우선순위 표로 누적하면 진행 상태와 우선순위가 한눈에 보임 — 삭제 X, ✅ 해결 내역 추가만

---

### 🔧 `chore(config)`: .gitignore에 .omc/와 tmp.md 추가

**Status:** `completed`  
**Files changed:** `.gitignore`

#### Context

임시 메모/세션 파일이 git에 잘못 들어가는 일 방지.

#### Implementation

.omc/ (oh-my-claudecode 세션 디렉토리), tmp.md 추가.

---

## Changes Summary

### Added

- config.js (window.JHTECH_GAS_URL 단일 진실 소스)
- CLAUDE.md (프로젝트 컨텍스트 + 아키텍처 + 주의사항)
- docs/issues.md (12개 이슈 + 기능 개선 트래커)
- docs/code-analysis.md (코드 구조 매핑)

### Changed

- quote.html/admin.html이 config.js의 window 전역 변수 참조
- .gitignore에 .omc/ + tmp.md

---

## Next Steps

- [ ] 12차 — Enterprise CPQ UI 리뉴얼 + 시트 정합성 정비

---

## Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 이 시점부터 GAS URL 변경은 config.js 한 곳만 수정. HTML에 다시 하드코딩하면 데이터 누락 사고 재발 위험. CLAUDE.md 참조 — 아키텍처 규칙 7가지(특히 syncFormState 호출 순서, basePrice/totalDisplay 분리, r.assignee 우선 조회).

**Reusable patterns introduced today:**

- `정적 사이트 단일 진실 소스 (config.js + window 전역)` — 빌드 도구 없는 정적 HTML에서 환경 변수를 config.js로 분리 + window.XXX로 노출. 양쪽 HTML이 같은 값을 참조하게 강제. (see `/Users/seonjecho/Projects/jhtechsmart/config.js`)
- `환경 변수 폴백 우선순위 (입력 > localStorage > config)` — 운영 유연성 — 임시 오버라이드는 localStorage에, 영구 변경은 config 수정. 호환성 + 디버깅용 (see `/Users/seonjecho/Projects/jhtechsmart/admin.html`)
