# jhtechsmart — Dev Note: GPT-Guide-Prompt-Overhaul

> **📅 Date:** 2026-05-14 · **🗂️ Project:** jhtechsmart · **🏷️ Main Task:** GPT-Guide-Prompt-Overhaul
> **👤 Author:** — · **🔖 Tags:** gpt-prompt, openai, guide-script, appscript, admin-ui, design-refresh, 24차

---

## TL;DR

GPT 동영상 가이드 프롬프트 전면 재설계 — 1인칭 사장님 톤, 영문 모델명 → 한국어 카테고리, 환각·클리셰·반말 차단, 시트 영향 없는 testGuidePrompt() 튜닝 환경 + few-shot 도입. 아침에는 admin 로그인 화면 Manufacturing Hub 디자인을 커밋·배포.

---

## Today's Work

### ✨ `feat(admin)`: admin 로그인 화면 Manufacturing Hub 디자인 전면 개편 (커밋 1eacbca)

**Status:** `completed`  
**Files changed:** `admin.html`

#### 📋 Context (왜)

기존 380px 단일 흰 카드만 있던 빈약한 로그인 화면을 재현테크 브랜드와 시스템 워크플로(신청→견적→PDF)를 함께 보여주는 라이트 톤 풀스크린으로 교체. 디자인 탐색용 샘플 3종(Bold Split / Glass Hero / Manufacturing Hub) 중 사용자가 Manufacturing Hub를 선택.

#### 🔨 Implementation (무엇을 어떻게)

좌측에 1→2→3 단계 시각화, 우측에 파란 헤더 + 아이콘 인풋 + 오렌지 CTA. 모든 새 CSS는 #loginWrap 하위 스코프로 admin 본체 .card/.field/.btn 클래스와 충돌 회피. 기존 #idInput/#pwInput/#loginBtn ID 및 Enter 키 핸들러 유지로 doLogin 회귀 없음. v2-header에 #appHeader id 부여 후 _enterApp/_clearScreen에서 토글. 우측 상단 '신청 페이지' 링크는 quote.html을 새 탭으로 — 어두운 헤더에서도 잘 보이게 파란 알약 버튼 스타일.

#### 📐 Architecture Decisions (ADR)

**Decision:** 디자인 샘플 중 Manufacturing Hub 채택

- **Context:** Bold Split / Glass Hero / Manufacturing Hub 세 안 비교
- **Chosen:** Manufacturing Hub
- **Rationale:** 재현테크의 제조 도메인(공장 워크플로우)과 가장 잘 맞고, 좌측 단계 시각화가 시스템의 정체성을 한 화면에 전달
- **Consequences:** Bold Split / Glass Hero 샘플은 디자인 탐색용으로 코드에 보존 (다음 디자인 회의 때 재참조 가능)

#### 💡 Learnings

- 기존 클래스(.card, .field, .btn)와 충돌 없이 새 디자인을 얹으려면 신규 영역에 wrapper id(#loginWrap)를 두고 모든 새 CSS를 그 하위로 스코프하는 게 안전

---

### ✨ `feat(appscript/guide)`: GPT 동영상 가이드 프롬프트 전면 재설계 (1인칭 사장님 톤)

**Status:** `in-progress`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

Phase 3에서 구축한 GPT 동영상 가이드 자동 생성이 운영에서 응답 품질 저하로 사용 불가 수준. 문제: (1) 영업 담당자 3인칭 톤이 어색함, (2) 영문 모델명(XTRA OR16, JU1810+) 노출, (3) PART 3과 PART 4 내용 중복, (4) input에 없는 정보 환각(임의로 '10년째'), (5) '한 단계 더 나아갈 수 있게', '도약', '발전' 같은 AI 클리셰 만연, (6) '~요'로 끝나는 친근체가 정부 제출 영상 톤과 안 맞음.

#### 🔨 Implementation (무엇을 어떻게)

system prompt를 바닥부터 재작성. (a) 화자를 '재현테크 영업 담당자' → '신청서를 낸 소공인 사장님 본인'으로 전환. (b) PART별 input 매핑을 명시 — PART 1: 자기소개+필수문구, PART 2: industry에서 코드/안내문구 제거, PART 3: 문제+장비 호명만(효과 표현 금지), PART 4: 카메라 액션 + 도입 효과 메인. (c) 영문 모델명 카테고리 매핑 7종(인쇄공정 자동화 설비 / 소형·중형 소재 커팅 설비 / 정밀 가공 설비 / 자동 사출 성형 설비 / 포장 공정 자동화 설비 / 정밀 측정 검사 설비). (d) 어조 규칙: 모든 종결을 '-다'체로, '~요' 일체 금지, '안녕하세요'→'안녕하십니까'. (e) 환각 금지 조항 추가 — 회사 연차·창업 연도·매출·직원 수 등 input에 없는 사실 금지. (f) 클리셰 금지어 18종으로 확장(성장/발전/도약/나아감 류 우회 변형 포함). (g) input.issues 파이프 기호(|) 자연어로 풀어 쓰기 강제.

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
'- PART 3 (핵심 — 현 문제 + 도입 장비 "호명"까지만 다룬다. 도입 후 효과/변화/기대는 절대 다루지 말고 PART 4에 양보할 것): … 호명은 다음 규칙을 모두 지킬 것: (a) input.equipment의 영문 모델명을 어떠한 형태로도 노출하지 말 것. (b) 반드시 한국어 카테고리 명을 1회 이상 명시적으로 등장시킬 것. 카테고리 매핑 — 프린터/인쇄기 계열: "인쇄공정 자동화 설비", 소형 커팅기: "소형 소재 정밀 커팅 설비", 중형 커팅기: "중형 소재 커팅 설비", CNC/가공기 계열: "정밀 가공 설비", 사출기: "자동 사출 성형 설비", 포장기: "포장 공정 자동화 설비", 측정/검사기: "정밀 측정 검사 설비". (c) "신규 장비", "이 장비", "본 설비" 같이 카테고리 없이 두루뭉술 호명 금지. (d) 콤마 결합이면 각 장비를 모두 카테고리 명으로 등장시킬 것 (생략 금지). (e) PART 3 마지막에 "~ 큰 도움이 될 것입니다" 같은 효과·기대 표현 일체 금지.'
```

_PART 3 호명 규칙 — 영문 모델명 차단 + 한국어 카테고리 강제 + 효과 표현 PART 4로 양보_

**`appscript/Code.gs`**

```javascript
'【어조 규칙 — 정부 제출용 격식체】',
'- 모든 종결은 "-다"체 격식 종결만 사용: ~입니다 / ~합니다 / ~했습니다 / ~겠습니다 등. "-요"로 끝나는 모든 종결(~해요, ~예요, ~네요, ~죠, ~군요 등) 절대 사용 금지.',
'- 다음 단어/표현은 절대 사용 금지: "혁신적", "최첨단", "극대화", "도약", "도약하", "성장의 발판", "성장", "발전", "한 단계 발전", "한 단계 더", "한 단계 더 나아", "더 나아가", "나아갈", "나아갑니다", "나아가겠습니다", "스마트화", "디지털 전환", "패러다임", "비전", "미래를 향해", "효율성을 높여". 성장·발전·도약·나아감 류의 추상적 미래 비유는 위 단어 외 변형도 일체 금지.',
'- input JSON에 명시되지 않은 구체 사실(회사 연차·창업 연도·직원 수·매출 액수·거래처 수·위치·수상 이력 등)은 절대 만들어내지 말 것.'
```

_어조 규칙 — '-다'체 강제, 클리셰 금지 우회 변형까지 차단_

#### 📐 Architecture Decisions (ADR)

**Decision:** 화자 시점 변경: 영업 담당자 → 사장님 본인

- **Context:** 기존 시스템 프롬프트가 '당신은 (주)재현테크의 영업 담당자입니다'로 시작 → 출력이 외부 관찰자 시점이라 진정성 없음
- **Chosen:** '당신은 (주)재현테크가 신청서를 작성한 소공인 사장님 본인이 되어, 카메라 앞에서 직접 말하는 1인칭 동영상 스크립트를 작성합니다'
- **Rationale:** 정부 제출 영상의 화자는 사장님 본인이므로, 모델이 사장님 페르소나에 빙의해야 자기 일에 대한 자부심·구체 디테일이 자연스럽게 나옴
- **Consequences:** 후속 PART별 input 매핑 가이드도 모두 1인칭 화자 기준으로 재서술 필요 (저희는~, 제가 직접~)

**Decision:** 영문 모델명 차단 → 한국어 카테고리 매핑 7종

- **Context:** 장비 시트의 model name이 'XTRA OR16', 'JU1810+', 'PACK-LINE 2200' 등 영문 — 영상에서 사장님이 영문 모델명을 그대로 호명하면 부자연스럽고 광고처럼 들림
- **Chosen:** 프롬프트 레벨에서 영문 노출을 금지하고, 7종 카테고리 한국어 명을 강제. 콤마 결합 장비도 각각 매핑.
- **Rationale:** 장비 카테고리 자체가 7개로 한정적이므로 매핑 테이블이 작고 유지보수 가능. 신규 카테고리 등장 시 프롬프트만 업데이트.
- **Consequences:** 신규 장비 카테고리 추가 시 GUIDE_SYSTEM_PROMPT 매핑 + testGuidePrompt() 검증 함수의 CATEGORIES 배열 양쪽을 동기화해야 함

**Decision:** 어조: '~요' 친근체 → '-다' 격식체 강제

- **Context:** 초기 출력이 '~합니다요', '~네요' 같은 친근체 — 정부 담당자에게 제출하는 영상 톤과 안 맞음
- **Chosen:** system prompt에 '-요' 종결 패턴 12종(~해요, ~예요, ~네요, ~죠, ~군요 등) 일체 금지 명시 + 인사말 '안녕하세요' → '안녕하십니까'
- **Rationale:** 정부 제출 + 보조금 신청 컨텍스트에서는 격식체가 표준. 그러면서도 발표문처럼 딱딱하지 않게 자부심·진심이 묻어나는 어조 유지
- **Consequences:** 검증 함수에 '-요' 종결 정규식 추가 — 명사 안의 '요'(주요, 필요)는 false positive 회피하려 종결 기호(.!?) 또는 줄끝/공백 끝 패턴만 매칭

**Decision:** 환각 차단 조항 명시 (input에 없는 사실 금지)

- **Context:** 테스트 케이스(해랑/이한솔)에서 input에 없는 '10년째', '5년째' 같은 회사 연차를 임의로 만들어냄 — 거짓 정보가 정부 제출용에 들어가면 큰 문제
- **Chosen:** system prompt에 '회사 연차·창업 연도·직원 수·매출 액수·거래처 수·위치·수상 이력 등은 절대 만들어내지 말 것. input.company / ceo / industry / equipment / problemProcess / issues / adoptionType / equipRequest에 있는 정보 + 자연 파생 묘사만 사용' 추가
- **Rationale:** GPT는 빈자리를 그럴듯한 사실로 채우는 경향 — 명시적으로 '만들어내지 말 것'을 강조해야 차단됨
- **Consequences:** 사용자가 신청 단계에서 회사 정보를 충분히 입력하도록 quote.html의 issues/problemProcess 필드 가이드를 강화하면 출력 품질이 더 올라감

#### 🐛 Problems & Solutions

**Problem:** PART 3과 PART 4의 효과·기대 내용이 중복되어 영상 흐름이 단조로움 (해랑 케이스에서 '소량 주문 대응 가능'이 두 PART에 모두 등장)

- **Root cause:** 기존 프롬프트가 PART별 역할 분담을 명시하지 않아, 모델이 효과 표현을 PART 3 끝에서 미리 빼버림 → PART 4에서 같은 말 반복
- **Solution:** PART 3에 '도입 후 효과/변화/기대는 절대 다루지 말고 PART 4에 양보할 것' + 효과 표현 7종 차단 + 마지막 문장은 '~ 카테고리 명입니다.'로 끝나야 함을 명시. PART 4는 '도입 후 변화·효과를 메인으로 다루는 PART'로 위치 재정의 + 'PART 3과 똑같은 표현으로 반복하지 말고 시간 단위·생산 단위·일상 변화의 각도로 다르게 묘사' 강제.
- **Prevention:** 검증 함수에서 PART 3 끝 200자에서 효과 표현 키워드 7종(큰 도움이 될, 문제를 해결해, 효율을 높여 등) 자동 검출

**Problem:** Code.gs를 GAS 에디터에 붙여넣어야 할 때 자동 검증이 안 된 채 사용자에게 떠넘기는 실수 반복 (사용자 경고)

- **Root cause:** 코드 변경 후 본인이 직접 testGuidePrompt() 등으로 검증하기 전에 '복사해서 붙여넣어 주세요'를 먼저 던짐
- **Solution:** 사용자가 명시적으로 다시 알려줌 — 이번 세션부터 Code.gs 변경 시 (1) 검증 시나리오 먼저 제시, (2) 사용자 검증 OK 받은 뒤 적용 안내, 순서 강제
- **Prevention:** 메모리에 [[feedback_self_verify_before_apply]] 이미 있음 — 새 세션 시작 시 우선 적용

#### 💡 Learnings

- GPT 프롬프트에서 금지어를 명시할 때는 우회 변형까지 함께 차단해야 효과 있음. '도약' 하나만 막으면 '도약하', '도약할'이 빠져나옴 — 어근·활용형을 모두 나열
- 정부 제출 컨텍스트의 톤은 '격식'과 '진정성'이 동시에 필요. 발표문처럼 딱딱해도 안 되고 친근해도 안 됨 → 어조 가이드를 한 줄이 아니라 여러 측면(종결/존칭/1인칭/금지표현)으로 분리해 명시
- PART별 역할 분담이 흐릿하면 GPT가 알아서 분배함 → 결과는 중복. PART 3은 '~ 호명까지만', PART 4는 '효과 메인' 식으로 명시적 역할 위임이 필요

---

### ✨ `feat(appscript/guide)`: 프롬프트 튜닝 환경: testGuidePrompt() 함수 + 9종 자동 검증 리포트

**Status:** `completed`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

프롬프트를 운영에 바로 반영하면 시트/Drive에 영향이 있어 실험이 어려움. 사용자 요청: '프롬프트만 테스트할 수 있는 함수 하나 만들어줘. 거기서 수정해서 응답받고 확인하고 다시 수정하면서 계속 만들 수 있도록.'

#### 🔨 Implementation (무엇을 어떻게)

Code.gs에 testGuidePrompt() 함수 신설. (1) SAMPLE_CASES 4종 사전 정의(정밀가공/식품가공/사출성형/해랑 인쇄) → ACTIVE_CASE 한 줄로 케이스 전환. (2) TEST_SYSTEM_PROMPT는 기본 GUIDE_SYSTEM_PROMPT를 가리키되 주석으로 직접 수정 안내. (3) TUNING 객체로 model/temperature/top_p/frequency_penalty/presence_penalty/max_tokens/useFewshot 노출. (4) 응답 후 자동 검증 9종 — PART별 글자수, 클리셰 금지어, 부정수급 필수 문구, 영문 모델명 노출, 업종 코드/안내문구 노출, 파이프 기호 노출, PART 4 카메라 액션, PART 3 카테고리 명/두루뭉술 호명/효과 누출, 평수·치수·전압 수치, '-요' 종결 12종 패턴, 가격 노출. Logger.log로 각 항목 ✓/✗ + 위반 샘플 출력.

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
// 6-2) PART 3 한국어 카테고리 명 등장 여부 + 두루뭉술 호명 검출
try {
  const part3 = (parseGuideScript(content).part3 || '');
  const CATEGORIES = ['인쇄공정 자동화 설비','소형 소재 정밀 커팅 설비','중형 소재 커팅 설비','정밀 가공 설비','자동 사출 성형 설비','포장 공정 자동화 설비','정밀 측정 검사 설비'];
  const matchedCat = CATEGORIES.filter(function(c){ return part3.indexOf(c) >= 0; });
  Logger.log('▶ PART 3 한국어 카테고리: ' + (matchedCat.length ? '✓ ' + matchedCat.join(', ') : '⚠ 카테고리 명 등장 안 함'));

  const VAGUE = ['신규 장비','이 장비','본 설비','이번 장비','새 장비','해당 장비','이번에 도입하는 장비'];
  const vagueHits = VAGUE.filter(function(v){ return part3.indexOf(v) >= 0; });
  Logger.log('▶ PART 3 두루뭉술 호명: ' + (vagueHits.length ? '✗ ' + vagueHits.join(', ') : '✓ 없음'));

  // PART 3 끝 효과·기대 표현 검출 (PART 4와 중복 방지)
  const part3Tail = part3.slice(-200);
  const EFFECT_TAIL = ['큰 도움이 될','문제를 해결해','효율을 높여','생산성을 높여','대응할 수 있게 됩니','만족도가 향상','경쟁력이 강화'];
  const tailHits = EFFECT_TAIL.filter(function(p){ return part3Tail.indexOf(p) >= 0; });
  Logger.log('▶ PART 3 효과 누출 (PART 4로 가야 할 표현이 PART 3에): ' + (tailHits.length ? '✗ ' + tailHits.join(', ') : '✓ 없음'));
} catch (e) {}
```

_검증 #6-2: PART 3 카테고리 명 등장 + 두루뭉술 호명 + 효과 누출 동시 검출_

#### 📐 Architecture Decisions (ADR)

**Decision:** 테스트 함수를 별도 파일이 아닌 Code.gs 내부에 두기

- **Context:** GAS는 멀티 파일이지만, 사장님 사용 흐름상 단일 파일 유지가 익숙
- **Chosen:** Code.gs 안에 ═══ 시각적 구분선과 함께 테스트 섹션 배치
- **Rationale:** 시트/Drive에 영향 없는 read-only 함수임을 코드 위 주석으로 명시 → 안전성 확보. GAS 에디터 함수 드롭다운에서 testGuidePrompt 바로 선택 가능
- **Consequences:** Code.gs 라인 수가 415 → ~620으로 증가 (약 200줄). 다음 리팩터링 때 guide-test.gs로 분리 검토

#### 💡 Learnings

- 프롬프트 튜닝의 핵심은 '빠른 피드백 루프' — 응답 받기 + 검증 리포트 보기를 한 번의 GAS 함수 실행으로 끝낼 수 있어야 반복 횟수가 늘어남
- 검증 항목은 '실패 시 어떻게 고칠지'까지 메시지에 포함해야 유용 (예: '⚠ 카테고리 명 등장 안 함 — 매핑된 한국어 설비 명 누락')

---

### ✨ `feat(appscript/guide)`: Few-shot 예시 도입 + gpt-4o-mini → gpt-4o 모델 업그레이드

**Status:** `in-progress`  
**Files changed:** `appscript/Code.gs`

#### 📋 Context (왜)

system prompt를 강화해도 모델이 일부 지시를 놓침 (특히 환각·카테고리 명 등장·PART 분리). 두 가지 동시 조치: (1) few-shot 예시 1쌍을 user/assistant 페어로 주입, (2) gpt-4o-mini → gpt-4o로 업그레이드.

#### 🔨 Implementation (무엇을 어떻게)

GUIDE_FEWSHOT_INPUT (성진정밀가공 / 김성진 / DOOSAN VC630 / CNC 가공)와 GUIDE_FEWSHOT_OUTPUT (5 PART 모범 응답)을 상수로 정의. _guideFewshotMessages() 함수가 [user, assistant] 메시지 쌍을 반환. callOpenAI()와 testGuidePrompt() 둘 다 system → fewshot → user 순으로 메시지 배열 구성. 해랑(인쇄)과 겹치지 않게 CNC 케이스로 선정해 over-fitting 방지. fewshot 출력은 환각 없음 / 카테고리 명 1회 등장 / PART 3 끝 효과 누출 없음 / PART 4 다른 각도 효과의 모든 규칙을 만족하도록 작성.

#### 💻 Key Code

**`appscript/Code.gs`**

```javascript
function _guideFewshotMessages() {
  return [
    {role: 'user', content: JSON.stringify(GUIDE_FEWSHOT_INPUT, null, 2)},
    {role: 'assistant', content: GUIDE_FEWSHOT_OUTPUT}
  ];
}

// callOpenAI 내부:
messages: [{role: 'system', content: GUIDE_SYSTEM_PROMPT}]
  .concat(_guideFewshotMessages())
  .concat([{role: 'user', content: JSON.stringify(promptInput, null, 2)}])
```

_few-shot 메시지 페어 구성 — system → user/assistant 페어 → 실제 user 순_

#### 📐 Architecture Decisions (ADR)

**Decision:** fewshot 케이스를 운영 케이스(인쇄)와 다른 도메인(CNC)으로 선정

- **Context:** fewshot이 운영 케이스와 너무 비슷하면 모델이 과적합되어 모든 출력이 fewshot 어휘를 베낌
- **Chosen:** 성진정밀가공(CNC 금속 가공) 케이스로 선정
- **Rationale:** 도메인이 달라야 모델이 '구조와 톤'만 학습하고 어휘는 케이스별로 새로 생성
- **Consequences:** fewshot 출력 자체가 모든 검증 규칙을 만족하는 모범 답안이어야 함 → 작성에 시간이 걸리지만 모델이 강하게 학습

**Decision:** 모델: gpt-4o-mini → gpt-4o 업그레이드

- **Context:** mini에서 환각·지시 위반·PART 분리 실패가 반복
- **Chosen:** gpt-4o (전체)
- **Rationale:** 프롬프트 한 번 호출당 비용 차이는 있지만 동영상 스크립트는 신청 1건당 1회만 생성 → 비용 영향 미미. 정부 제출용이라 품질 우선
- **Consequences:** max_tokens 2500 유지 (PART 5개 + few-shot 2500자 정도 여유). callOpenAI / testGuidePrompt 둘 다 동일 모델 명시

**Decision:** 샘플링 파라미터: temperature 0.85 + frequency_penalty 0.4 + presence_penalty 0.3

- **Context:** default(temperature 0.7, penalties 0)로는 같은 문장 반복 + 클리셰 빈출
- **Chosen:** temperature 0.85 / top_p 0.9 / frequency_penalty 0.4 / presence_penalty 0.3
- **Rationale:** 약간 더 다양한 어휘 + 반복 표현 억제 + 새로운 단어 등장 유도. 정부 제출 톤이라 너무 높은 temperature는 위험해 0.85 선
- **Consequences:** testGuidePrompt의 TUNING 객체에서 한 줄 수정으로 실험 가능 — 사용자가 직접 튜닝하며 최적값 탐색

---

### 📌 `config(config)`: config.js GAS URL 운영/테스트 토글

**Status:** `in-progress`  
**Files changed:** `config.js`

#### 📋 Context (왜)

프롬프트 튜닝 작업을 운영 GAS에 직접 배포하면 위험 — 테스트 GAS에서 검증 후 운영 반영 워크플로 필요. 두 URL을 한 파일에 두고 주석 토글로 전환.

#### 🔨 Implementation (무엇을 어떻게)

운영/테스트 두 URL을 모두 코드에 두고, 활성 URL만 주석 해제. 현재는 운영 URL이 활성, 테스트 URL은 주석. 작업 중 임시로 토글 가능. (잠시 두 줄 순서가 바뀌었다가 다시 운영 활성으로 돌려놓음)

#### 💻 Key Code

**`config.js`**

```javascript
//window.JHTECH_GAS_URL = 'https://script.google.com/macros/s/...QSH8zIsHhVuz8zimTk0j/exec'; // 테스트

window.JHTECH_GAS_URL = 'https://script.google.com/macros/s/...iV937e70DRp/exec'; // 운영
```

_운영 / 테스트 URL 토글_

#### 💡 Learnings

- config.js 단일 진실 소스 원칙(메모리 [[feedback_config_js_single_source]])은 유지하되, 같은 파일 내에서 두 URL 토글은 안전. HTML에 URL을 다시 하드코딩만 안 하면 됨

---

### 🔧 `chore(dev-notes)`: v1 → v2 개발노트 디자인 마이그레이션 (devnote-migrate)

**Status:** `completed`  
**Files changed:** `dev-notes/jhtechsmart_DevelopNote.html`

#### 📋 Context (왜)

v1 HTML이 폰트 위계 부재 / 줄간격 빽빽 / 한국어 단어 잘림 / ADR 들여쓰기 깨짐 등 디자인 결함 다수. v2 디자인이 발표되어 누적된 5개 노트(13~22.4차)를 일괄 재생성.

#### 🔨 Implementation (무엇을 어떻게)

python3 ~/.claude/skills/dev-note-manager/scripts/migrate.py --project jhtechsmart --dry-run 로 사전 확인 → 실제 실행. v1 백업이 jhtechsmart_DevelopNote.v1backup.20260514-095713.html로 자동 저장. v2 HTML이 기존 데이터를 모두 보존하면서 line-height 1.65, word-break: keep-all, typography scale, 코드/경로 분리 스타일 적용.

#### 📐 Architecture Decisions (ADR)

**Decision:** 마이그레이션 전 dry-run으로 변환 미리보기 확인

- **Context:** 5일치 누적 노트가 있어 한 번에 망치면 복원 부담
- **Chosen:** --dry-run 옵션으로 변환 결과 먼저 확인
- **Rationale:** 스크립트가 데이터 손실 없이 디자인만 갈아 끼우는지 검증
- **Consequences:** dry-run 통과 후 본 실행, v1 백업도 자동 생성됨 → 안전망 두 겹

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 프롬프트 튜닝 환경 요청 — '거기서 수정 → 응답 → 확인 → 재수정' 루프

```
일단 프롬프트만 테스트할 수 있는 함수를 하나만들어줘. 거기서 수정해서 응답받고 확인하고 다시 수정하면서 계속 만들 수 있도록.
```

**교훈:** 도구 요구사항을 '내가 어떤 흐름으로 작업하고 싶은지'(반복 루프)로 표현하면 LLM이 SAMPLE_CASES + TUNING + 9종 자동 검증까지 묶인 통합 환경을 제안함. '함수 하나 만들어줘'만 했으면 단순 호출 함수만 받았을 것.

### ✅ 잘 통한 프롬프트: 결과 평가 요청 — 본인 의견까지 묻기

```
PART3와 PART4가 중복되는 내용이 너무 많은것 같지 않나? 니가 생각하기에는 어때? 자연스럽지는 않은거 같은데.. 전제적인 결과를 한번 판단해봐
```

**교훈:** GPT 출력을 사람이 평가만 하는 게 아니라 Claude에게도 평가시킨 뒤 둘의 의견을 합쳐 프롬프트를 고치면 발견 못 한 미세 결함(PART 3과 4 효과 표현 중복)까지 잡힘. '어떻게 생각해?'를 그냥 친목용 질문이 아니라 평가 도구로 사용.

### ✅ 잘 통한 프롬프트: 톤 문제를 구체적 예시 + 변경 방향 함께 지시

```
지금 말투가.. ~~요, 로 끝나는데, 그것보다는 정부에 제출하는 영상이기 때문에 공손한 말투로 ~~ 다. 라고 끝나게 하는게 좋을것 같아.
```

**교훈:** '~요'와 '~다'를 직접 음절로 보여주고, 변경 사유(정부 제출 영상)까지 한 문장에 담음. 모호한 '톤을 격식 있게'가 아니라 구체적 종결어미 + 컨텍스트 → 프롬프트 작성자가 system prompt에 어조 규칙을 분리해 넣을 수 있게 됨.

### ✅ 잘 통한 프롬프트: 장비명 매핑 규칙 직접 제시 (3번째 안내)

```
선택장비 명이 영어로 되어 있기 때문에 프린터를 선택한 경우에는 '인쇄공정 자동화 설비', 커팅기를 선택한 경우에는 '소형소재 정밀커팅 설비' , '중형 소개 커팅 설비' 등의 문구만으로 처리할 수 있도록 했으면 좋겠어. 직접 모델명이 나오는게 아니고. 그리고 part4에서 설치 장소의 경우에는 '(손으로 가르키며) 이쪽 공간에 설치될 예정이며..'등으로 영상을 보여주며 자연스럽에 설치장소를 안내할 수 있는 문구로 해줘.
```

**교훈:** 도메인 지식(장비 카테고리 매핑 + 영상 연출 가이드)을 사용자가 직접 제공하면 LLM이 추측할 필요 없이 system prompt에 그대로 박아넣을 수 있음. '자연스럽게 해줘'가 아니라 '이런 문구로'가 핵심.

### 🔁 참고 프롬프트: 잘못된 사용자 행동에 대한 즉시 경고 (검증 누락)

```
(경고) 내가 Code.gs가 수정되서 붙어넣어야 하는경우에는 어떻게 하라고 했지?????????
```

**교훈:** 사용자가 강하게 지적할 때는 LLM이 같은 실수를 반복했다는 신호 — 즉시 [[feedback_self_verify_before_apply]] 메모리를 다시 확인하고, 다음부터는 (1) 검증 시나리오 먼저 제시 → (2) OK 받은 뒤 GAS 붙여넣기 안내 순서를 강제. 메모리에 저장된 피드백을 세션 초반에 한 번 더 적용 안내해야 안 잊음.

### ✅ 잘 통한 프롬프트: 데이터 흐름 확인 질문 — 실제로 무엇이 들어가는지

```
지금 운영되는 GAS에서 업체가 입력한 데이터중에 GPT프롬프트에서 참고하는 정보 필드가 뭐가 있지?
```

**교훈:** 프롬프트 개선 전에 '입력으로 무엇이 실제로 들어오는가'를 코드에서 확인하는 단계를 한 번 거치는 게 안전. 추정으로 시작하면 quote.html에 없는 필드를 system prompt에서 참조하는 등 비현실적 지시가 들어감.

---

## 📋 Changes Summary

### Added

- appscript/Code.gs: testGuidePrompt() 함수 + SAMPLE_CASES 4종 + 9종 자동 검증 리포트
- appscript/Code.gs: GUIDE_FEWSHOT_INPUT / GUIDE_FEWSHOT_OUTPUT (성진정밀가공 CNC 케이스) + _guideFewshotMessages()
- appscript/Code.gs: 영문 모델명 → 한국어 카테고리 매핑 7종 (system prompt + 검증 함수 양쪽)
- appscript/Code.gs: 환각 차단 조항 (input에 없는 회사 연차/창업 연도/매출 등 금지)
- appscript/Code.gs: '-요' 종결 12종 패턴 차단 + '안녕하세요' → '안녕하십니까' 강제
- admin.html: Manufacturing Hub 로그인 디자인 (#loginWrap 스코프, 좌측 단계 시각화 + 우측 카드)

### Changed

- appscript/Code.gs: GUIDE_SYSTEM_PROMPT 화자 시점 — '재현테크 영업 담당자' → '소공인 사장님 본인'
- appscript/Code.gs: PART별 input 매핑 가이드 신설 (PART 3은 '효과 표현 금지 + 호명까지만', PART 4는 '효과 메인')
- appscript/Code.gs: 클리셰 금지어 12종 → 18종 (성장/발전/도약/나아감 류 우회 변형 모두 포함)
- appscript/Code.gs: OpenAI 모델 gpt-4o-mini → gpt-4o, temperature 0.7 → 0.85, frequency/presence_penalty 0.4/0.3 신설
- config.js: 운영/테스트 GAS URL 토글 형식으로 두 URL 코드에 모두 보존
- dev-notes/jhtechsmart_DevelopNote.html: v1 → v2 디자인 마이그레이션 (line-height 1.65, word-break, typography scale)

---

## ⏭️ Next Steps

- [ ] testGuidePrompt() 으로 case_haerang_인쇄 외 case_정밀가공 / case_식품가공 / case_사출성형도 검증 → 9종 검증 모두 ✓ 나오면 운영 GAS에 배포
- [ ] 프롬프트가 안정되면 testGuidePrompt 함수와 GUIDE_FEWSHOT_* 상수를 별도 파일(guide-test.gs / guide-fewshot.gs)로 분리 — Code.gs 라인 수 관리
- [ ] 13차 토큰 인증 작업(메모리 [[project_v13_auth_inprogress]]) 운영 배포 — 프롬프트 작업이 끝나면 재개

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> GPT 가이드 프롬프트 작업 중일 때는 (1) Code.gs 변경 후 반드시 GAS 에디터에서 testGuidePrompt() 실행해 9종 검증 결과를 사용자에게 먼저 보여주고, (2) 사용자 OK 받은 뒤에 운영 적용 안내. 절대 본인 검증 없이 '복사해서 붙여넣어 주세요'를 먼저 던지지 말 것. 프롬프트 수정 시 system prompt 안에서 '도약/성장/발전' 같은 클리셰는 어근 + 활용형(도약하/도약할/나아갈/나아가겠 등)을 모두 나열해야 우회 차단됨.

**Reusable patterns introduced today:**

- `프롬프트 튜닝 함수 + 자동 검증 리포트` — 운영 데이터 영향 없이 GPT 프롬프트를 반복 실험할 수 있는 GAS/Node 함수. SAMPLE_CASES 사전 정의 + ACTIVE_CASE 한 줄 토글 + TUNING 객체로 sampling param 노출 + 응답 후 도메인 검증 N종 자동 출력. 다른 프롬프트 작업에도 그대로 이식 가능.
    - 파일: `appscript/Code.gs`
- `Few-shot 케이스 도메인 분리 원칙` — few-shot 예시는 운영 케이스와 다른 도메인(인쇄 ↔ CNC, 사출 ↔ 식품 등)으로 작성. 같은 도메인이면 모델이 어휘까지 베껴 over-fit. fewshot은 '구조와 톤만 학습'시키는 게 목표.
    - 파일: `appscript/Code.gs`
- `디자인 샘플 보존 패턴` — 여러 디자인 안을 비교해 하나를 선택하더라도 나머지를 코드에서 삭제하지 말고 보존. 다음 디자인 회의 / 다른 페이지 작업 시 재참조 가능. admin.html의 Bold Split / Glass Hero / Manufacturing Hub 3종이 이 패턴.
    - 파일: `admin.html`
