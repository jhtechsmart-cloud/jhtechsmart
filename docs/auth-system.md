# 인증·권한 시스템 개발 노트 (v13 → v14)

> 작성일: 2026-05-12
> 대상: 재현테크 견적 관리 시스템 (`admin.html` + `appscript/Code.gs`)
> 목적: 클라이언트 측 권한 분기를 백엔드 권한 검증으로 전환하면서 도입한 토큰 인증, 권한 모델, 데이터 흐름 일체 정리

---

## 1. 왜 만들었나 (배경)

### 이전 구조의 본질적 한계 (v12 이하)

```
[브라우저]  ─── fetch ?action=list ───>  [GAS]
                                          │
                                          ▼ 모든 행 반환
[브라우저] ← (전체 신청 데이터)  ────────┘
   │
   └ 클라이언트가 if(!isAdmin) base.filter(...) — 화면에만 숨김
```

- GAS가 **모든 신청 데이터를 무조건 반환**. 비관리자는 사이드바에서만 본인 담당 신청만 보이지만 — F12 콘솔에서 `allRequests`로 다른 업체 사업자번호·연락처·이메일 모두 조회 가능
- GAS URL을 알면 누구나 curl로 직접 호출 가능
- 비밀번호 평문이 **모든 사용자에게 다운로드됨** (`getUserConfig` 응답에 pw 포함)
- 담당자 매핑이 localStorage에 의존 → PC 종속, 다른 PC에선 작동 안 함

**해결책**: GAS에서 토큰 발급 + 매 요청 검증 + 응답 자체를 권한별로 필터.

---

## 2. 핵심 개념 — 토큰 vs currentUser

이번 시스템의 가장 중요한 분리. 두 개념을 헷갈리면 보안 모델이 무너집니다.

### 본질적 차이

| 구분 | 토큰 페이로드 | 메모리 currentUser |
|---|---|---|
| **물리적 위치** | sessionStorage `jhtech_session_token` | JavaScript 변수 (`let currentUser`) |
| **수명** | 8시간 (만료 timestamp 박힘) / 탭 닫으면 자동 정리 | 페이지 리로드 시 사라짐 |
| **변경 가능성** | **Immutable** — 발급 후 절대 못 바꿈 (HMAC 서명 보호) | 가변 (그냥 변수) |
| **존재 목적** | **인증·권한 증명** (서버에 "나 누구임" 보임) | **화면 표시** (헤더 이름, isAdmin 분기 등) |
| **발급 / 소유 주체** | GAS (백엔드) | admin.html (프론트) |
| **검증 주체** | GAS의 `verifyToken` (매 요청마다) | 없음 (단순 표시 데이터) |
| **위변조 위험** | HMAC-SHA256 서명으로 차단 | 사용자가 콘솔에서 임의 변경 가능 (단 서버 영향 X) |

> 비유: 토큰은 **서명된 신분증**(서버용), currentUser는 **메모장 사본**(화면용).

### 왜 두 개 다 필요한가

#### 토큰만 있고 currentUser 없으면?
- 화면 그리는 모든 곳에서 토큰을 디코드해야 함 → 느림
- isAdmin·name·phone 등 자주 읽는데 매번 base64 디코딩 + HMAC 검증은 낭비
- 클라이언트는 이미 신뢰받은 토큰의 정보를 메모리에 캐시해서 빠르게 사용하는 것이 자연스러움

#### currentUser만 있고 토큰 없으면?
- GAS가 매 요청마다 사용자가 누군지 모름 → 권한 분기 불가
- 사용자가 콘솔에서 `currentUser.isAdmin = true` 한 줄로 admin 권한 탈취 가능 → **치명적 보안 결함**
- 토큰은 서명되어 있어 클라이언트가 변조 불가

**결론**: 분리 자체가 보안 모델의 핵심.

---

## 3. 데이터 모델

### 시트 (단일 진실 소스)

| 시트 | 컬럼 (담당자 관련) | v14 변경 |
|---|---|---|
| 신청관리 | 컬럼 20 = 담당자 | `u.id` 저장 (예: `test1`) |
| 견적서발급관리 | 컬럼 13 = 담당자 | `u.id` 저장 |
| 담당자관리 | 6컬럼: `담당자ID / 이름 / 전화번호 / 이메일 / 비밀번호 / 관리자여부` | 비밀번호 평문 — 신뢰된 단일 PC 환경 전제 |

### 클라이언트 메모리

| 변수 | 내용 | 출처 |
|---|---|---|
| `currentUser` | 현재 로그인 사용자 — `{id, name, phone, isAdmin, exp}` | 토큰 페이로드 또는 부트스트랩 응답 |
| `allRequests` | 권한 필터된 신청 목록 (서버가 이미 필터함) | `gasCall('list')` 응답 |
| `_memUsers` | 전체 담당자 목록 (비밀번호 마스킹) — ID→이름 변환용 | 백그라운드 `gasCall('getUserConfig')` |
| `_memEquipOpts` | 장비 옵션 캐시 | 백그라운드 `gasCall('getEquipConfig')` |

### sessionStorage (영구화 — 탭 단위)

| 키 | 내용 |
|---|---|
| `jhtech_session_token` | HMAC 서명 토큰 (8시간 유효) |
| `jhtech_session_user` | 사용자 ID (디버그·로그 추적용) |

### localStorage (오프라인 폴백 캐시)

| 키 | 내용 |
|---|---|
| `jhtech_users` | _memUsers 캐시 (비밀번호 마스킹 상태) |
| `jhtech_equip_opts` | _memEquipOpts 캐시 |
| `jhtech_stamp_b64` | 직인 이미지 base64 |
| `jhtech_sales_notes` | 영업일지 (PC 종속) |

---

## 4. 토큰 구조

### 페이로드 (HMAC 서명 전 평문)

```json
{
  "id": "admin",
  "name": "박현석 부장",
  "phone": "010-6247-6261",
  "isAdmin": true,
  "exp": 1778597000000
}
```

### 토큰 문자열 형식

```
<base64url(payload)>.<hex(HMAC-SHA256(payload, SECRET))>
```

- SECRET은 GAS Script Properties에 저장 (자동 생성)
- 서명이 일치해야만 유효한 토큰으로 인정
- 클라이언트는 서명을 모르므로 페이로드 변조 시 검증 실패

---

## 5. 동작 흐름

### 5-1. 로그인 시 저장 순서 (상세)

```
순번  주체        동작                              저장 위치           내용
─────────────────────────────────────────────────────────────────────────────
 1   사용자       id/pw 입력                       —                  -
 2   admin.html  doLogin() 호출                    메모리(임시)        id, pw
 3   admin.html  fetch POST → action=login         네트워크 송신       {action, data}
 4   GAS         _readUsers() — 시트 조회          GAS 메모리          사용자 목록
 5   GAS         id+pw 매칭                        —                  user 객체
 6   GAS         generateToken(user) — HMAC 서명   —                  토큰 문자열
 7   GAS         _filteredRequestRows(user)        —                  권한 필터된 신청 배열
 8   GAS         jsonResponse                      네트워크 응답       {token, user, rows}
 9   admin.html  res.json()                        메모리(JS)          파싱 객체
10   admin.html  _setToken(token)              ★  sessionStorage      jhtech_session_token
11   admin.html  sessionStorage.setItem            sessionStorage      jhtech_session_user (ID)
12   admin.html  currentUser = bootstrap.user  ★  메모리(JS)           user 참조
13   admin.html  allRequests = bootstrap.rows     메모리(JS)           신청 배열
14   admin.html  loginUser.textContent             DOM                 currentUser.name
15   admin.html  _loadAuxConfigInBackground()     (비동기 시작)        백그라운드 fetch
16   GAS         getEquipConfig 처리               —                  장비 목록
17   GAS         getUserConfig 처리                —                  사용자 목록(pw 마스킹)
18   admin.html  _memUsers = res.users            메모리(JS)           fresh user 목록
19   admin.html  currentUser.name 보정         ★  메모리(JS)           시트 최신 이름
20   admin.html  loginUser.textContent 갱신       DOM                 currentUser.name
21   admin.html  renderList / renderDetail        DOM                 최신 데이터 반영
```

★ 표시 = 핵심 저장 지점.

### 5-2. 데이터를 불러오는 시점

| 데이터 | 언제 읽힘 | 누가 |
|---|---|---|
| 토큰 | 매 GAS 호출 (`gasCall`) | admin.html `_getToken()` → URL/body에 첨부 |
| 토큰 (검증) | 매 GAS 호출 진입 시 | GAS `verifyToken(params.token)` |
| currentUser | 화면 그리는 모든 곳 | renderList, renderDetail, printQuote, isAssignedToMe 등 |
| _memUsers | 사이드바 ID→이름 변환 시 | renderList, renderDetail (option select) |

### 5-3. 데이터를 사용하는 이유

- **토큰**: 서버에 "나 인증됐어" 증명 + 권한 확인. 서명되어 위변조 불가.
- **currentUser**: 사용자에게 본인 이름 표시, isAdmin 분기, 견적서 PDF 담당자란 폴백 등.
- **_memUsers**: 시트엔 ID만 저장하므로 화면 표시 시 이름으로 변환하는 매핑 테이블.

### 5-4. 동작 주체 정리

| 행위 | 주체 |
|---|---|
| 토큰 발급 (서명) | GAS `generateToken` |
| 토큰 검증 (서명 확인) | GAS `verifyToken` (매 요청마다) |
| 토큰 저장 | admin.html `_setToken` → sessionStorage |
| 토큰 자동 첨부 | admin.html `gasCall` (모든 GAS 호출 wrapper) |
| 토큰 만료 처리 | admin.html `handleAuthExpired` (GAS의 AUTH_REQUIRED 응답 수신) |
| currentUser 설정 | admin.html `_enterApp` (로그인 직후 또는 세션 복원 시) |
| currentUser 보정 (시트 최신 동기화) | admin.html `_loadAuxConfigInBackground` |
| currentUser 사용 | admin.html 모든 렌더 함수 |

---

## 6. 권한 분기 정책

### 시나리오별 비교

| 사용자 | listRequests | confirm | updateAssignee | saveUserConfig |
|---|---|---|---|---|
| **admin (isAdmin=true)** | 전체 행 반환 | 모든 신청 처리 가능 | 모든 신청 담당자 변경 가능 | 가능 |
| **비관리자 (test1 등)** | 본인 ID와 일치한 행만 반환 | 본인 담당 신청만 가능 | ❌ 차단 (관리자만) | ❌ 차단 (관리자만) |
| **인증 없음** | AUTH_REQUIRED | AUTH_REQUIRED | AUTH_REQUIRED | AUTH_REQUIRED |

### 핵심 함수 (GAS)

#### `verifyToken(token)`
- 토큰 페이로드 디코드 + 서명 검증 + 만료 체크
- 통과 시 user 페이로드 반환, 실패 시 null

#### `_checkRequestPermission(reqId, user)`
- admin이면 무조건 통과
- 비관리자는 시트 컬럼 20 (담당자 ID)이 user.id와 일치하는지 검증
- 실패 시 PERMISSION_DENIED

#### `_filteredRequestRows(user)`
- 신청관리 시트 전체 읽고 user.isAdmin이거나 r[19]===user.id인 행만 반환
- listRequests + handleLogin이 사용

---

## 7. 보안 모델

### 무엇이 안전하고 무엇은 안전하지 않은가

#### ✅ 안전
- 비관리자가 다른 업체 데이터를 **물리적으로 받지 못함** — listRequests 응답이 권한 필터됨
- 콘솔에서 `gasCall('list')` 직접 호출해도 본인 담당만 옴
- 토큰 페이로드 변조 시도 → 서명 불일치로 GAS가 거부
- `currentUser.isAdmin = true` 메모리 변조 → 시각만 변함, 서버는 토큰 페이로드의 isAdmin만 신뢰
- 비밀번호가 클라이언트에 다운로드되지 않음 (`getUserConfig`가 pw 마스킹)

#### ⚠ 부분 보호
- 비밀번호 평문이 시트에 저장됨 — 신뢰된 단일 PC 환경 전제
- localStorage에 사용자 목록 캐시 (pw 마스킹된 상태) — 큰 위험 X
- 8시간 토큰 유효기간 — 토큰 탈취 시 그 동안 사용 가능

#### ❌ 의도적 미보호
- HTTPS 자체 보안 (Google이 보장) 외에 별도 암호화 없음
- 토큰 강제 무효화 메커니즘 없음 (JWT 유사 — 만료까지 유효)
- 로그인 시도 횟수 제한 없음 (브루트포스 가능 — 다만 비밀번호 평문 시트라 큰 의미 X)

---

## 8. v13 → v14 변경 (이름 → ID 정책)

### 문제 (v13)

시트의 담당자 컬럼에 **한글 이름**을 저장했음:
- 신청관리 컬럼 20: "김태스트 사원"
- 견적서발급관리 컬럼 13: "김태스트 사원"

권한 비교도 이름으로:
```js
if (!user.isAdmin && r.assignee !== user.name) continue;
```

→ 한글 비교의 미세한 차이(NFC/NFD 자모 분리, trailing space, NBSP)에서 매칭 실패 발생.

### 해결 (v14)

**시트엔 ID만 저장, 비교는 ID, 표시할 때만 ID → 이름 변환**

| 측면 | v13 | v14 |
|---|---|---|
| 시트 신청관리 컬럼 20 | `"김태스트 사원"` | `"test1"` |
| 시트 견적서발급관리 컬럼 13 | `"김태스트 사원"` | `"test1"` |
| 권한 비교 | `r.assignee === user.name` | `r.assignee === user.id` |
| 화면 표시 | r.assignee 그대로 | `_users.find(u=>u.id===r.assignee).name` |
| 견적서 PDF | name 매칭 후 표시 | ID 매칭 후 .name 표시 |

### 장점

- 영문 ID는 깨지지 않음, 인코딩 무관
- 사용자가 시트에서 이름을 자유롭게 바꿔도 권한 비교 영향 없음
- 동명이인 처리 가능 (ID는 unique)

### 단점

- 시트 직접 열어서 볼 때 ID만 보임 (관리자가 시트 확인 시 누구인지 즉시 모름)
  - → admin.html UI에서만 처리하는 게 원칙
- 마이그레이션 필요 (기존 이름 데이터 → ID 변환)
  - → `migrateAssigneeNameToId()` 함수 추가

---

## 9. 구현 핵심

### 9-1. GAS (`appscript/Code.gs`)

#### 토큰 헬퍼

```js
function getSecret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) {
    s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g,'');
    props.setProperty('SECRET', s);
  }
  return s;
}

function generateToken(user) {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = JSON.stringify({
    id: user.id, name: user.name, phone: user.phone||'',
    isAdmin: user.isAdmin, exp: exp
  });
  const payloadB64 = _b64encode(payload);
  const sig = _hmacHex(payloadB64);
  return payloadB64 + '.' + sig;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const [payloadB64, sig] = String(token).split('.');
    if (sig !== _hmacHex(payloadB64)) return null;
    const payload = JSON.parse(_b64decode(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}
```

#### 라우터 (모든 액션에 토큰 검증)

```js
function doPost(e) {
  const action = e.parameter.action;
  if (action === 'submit') return handleSubmit(...);    // 공개 (quote.html)
  if (action === 'login')  return handleLogin(...);     // 인증 자체
  const user = verifyToken(e.parameter.token);
  if (!user) return authError();
  if (action === 'confirm')        return handleConfirm(..., user);
  if (action === 'updateAssignee') return handleUpdateAssignee(..., user);
  // …
}
```

#### 권한 체크 (비관리자는 본인 신청만)

```js
function _checkRequestPermission(reqId, user) {
  if (user.isAdmin) return {ok:true};
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === reqId) {
      const cellId = String(rows[i][19] || '');
      if (cellId === user.id) return {ok:true};
      return {ok:false, error: permError('본인 담당 신청만 처리할 수 있습니다')};
    }
  }
  return {ok:false, error: jsonResponse({status:'error', message:'접수번호 없음'})};
}
```

### 9-2. admin.html

#### gasCall — 토큰 자동 첨부 wrapper

```js
async function gasCall(action, data, opts){
  const url = getGasUrl();
  const method = (opts && opts.method) || 'POST';
  const token = _getToken();

  let res;
  if (method === 'GET') {
    const qs = new URLSearchParams({action, ...(data||{})});
    if (token) qs.set('token', token);
    res = await fetch(url + '?' + qs.toString());
  } else {
    const body = new URLSearchParams({action, data: JSON.stringify(data||{})});
    if (token) body.set('token', token);
    res = await fetch(url, {method:'POST', body});
  }
  const json = await res.json();
  if (json.code === 'AUTH_REQUIRED') {
    handleAuthExpired();
    throw new Error('AUTH_REQUIRED');
  }
  return json;
}
```

#### 백그라운드 사용자 정보 보정

```js
async function _loadAuxConfigInBackground(){
  // ... getUserConfig fetch 후
  _memUsers = res.users;
  // 토큰의 옛 이름을 시트 최신 데이터로 보정
  if (currentUser) {
    const fresh = _memUsers.find(u => u.id === currentUser.id);
    if (fresh) {
      currentUser.name = fresh.name;
      currentUser.phone = fresh.phone;
      document.getElementById('loginUser').textContent = currentUser.name;
    }
  }
  renderList();
}
```

#### 권한 분기 (이름 → ID)

```js
const isAssignedToMe = currentUser &&
  (currentUser.isAdmin || (r.assignee && r.assignee === currentUser.id));
```

---

## 10. 시나리오별 동작

### 시나리오 A: 정상 첫 로그인

```
사용자: admin/admin1234 입력
→ fetch /login
→ GAS: 시트 정상 → 토큰 발급
→ admin.html: 토큰 저장, currentUser.name = "박현석 부장"
→ 헤더 "박현석 부장" 표시
→ 백그라운드 fetch → _memUsers 갱신 (값 동일)
→ 헤더 변화 없음 ✓
```

### 시나리오 B: 시트가 도중에 수정됨

```
시트 admin 이름이 "??? ??" 상태에서 사용자가 admin 로그인
→ 토큰 발급: name="??? ??"
→ currentUser.name = "??? ??"
→ 헤더 "??? ??"
─ 사용자가 시트를 "박현석 부장"으로 수정 ─
→ 페이지 새로고침
→ tryRestoreSession → whoami → 토큰 그대로 = "??? ??"
→ currentUser.name = "??? ??"
→ 헤더 "??? ??" (v13까진 여기서 멈춤)
→ _loadAuxConfigInBackground 
  → _memUsers fetch → admin.name = "박현석 부장"
  → currentUser.name = "박현석 부장"로 보정 ★
  → 헤더 "박현석 부장"으로 갱신 ★
```

### 시나리오 C: 8시간 후 토큰 만료

```
사용자 작업 → gasCall
→ GAS verifyToken: exp 지났음 → null → AUTH_REQUIRED 응답
→ admin.html gasCall: code='AUTH_REQUIRED' → handleAuthExpired
→ sessionStorage 정리, currentUser=null, 로그인 화면
→ 사용자 재로그인 → 새 토큰 발급
```

### 시나리오 D: 권한 위조 시도

```
공격자: currentUser.isAdmin = true; (메모리만 변경)
→ admin.html UI: ⚙ 관리자 설정 버튼 보임 (시각 변경됨)
→ 공격자가 saveUserConfig 호출
→ gasCall이 토큰 첨부 → GAS handleSaveUserConfig
→ user = verifyToken(token) ← 토큰 페이로드의 isAdmin (false)을 본다
→ if (!user.isAdmin) return permError('관리자만 가능')
→ 시트 변경 안 됨 ✓
→ 공격자는 메모리만 만져봤지만 서버는 신경 안 씀
```

→ **이게 토큰 기반의 본질적 가치**. 클라이언트 메모리(currentUser)를 신뢰하지 않고 서명된 토큰만 신뢰.

### 시나리오 E: 다른 PC에서 같은 사용자 로그인

```
PC1에서 test1 로그인 → 토큰 A (sessionStorage 저장)
PC2에서 test1 로그인 → 토큰 B (별개 발급)
두 토큰 모두 8시간 유효, 둘 다 시트 동일 데이터 봄
PC1 작업 → 토큰 A로 GAS 호출 → 정상
PC2 작업 → 토큰 B로 GAS 호출 → 정상
충돌 없음 — 양쪽이 시트만 본다
```

---

## 11. 운영 적용 가이드

### 첫 적용 시 (운영 GAS)

1. **백업**: 운영 시트 사본 만들기 (롤백 대비)
2. **GAS 코드 교체**: `appscript/Code.gs` 전체 운영 GAS에 붙여넣기
3. **Script Properties**:
   - `SPREADSHEET_ID` = 운영 시트 ID
   - `SECRET` 자동 생성 (첫 호출 시) — 별도 작업 불필요
4. **시트 마이그레이션 (1회)**:
   - Apps Script 에디터 함수 드롭다운에서 `migrateAssigneeNameToId` 선택 → ▶ 실행
   - 좌측 "실행" 메뉴에서 로그 확인 (`r2: "김태스트 사원" → "test1"` 형태)
5. **새 버전 배포**: "배포 관리 → 연필 → 새 버전 → 배포" (URL 유지)
6. **admin.html 푸시**: GitHub Pages 반영 (1~3분)
7. **운영 환경에서 테스트 로그인** 1회 — 정상 작동 확인

### 롤백 (이슈 발생 시)

| 단계 | 시간 |
|---|---|
| GAS: "배포 관리 → 연필 → 이전 버전 선택 → 배포" | 30초 |
| admin.html: `git revert HEAD && git push` | 1분 |
| GitHub Pages 반영 | 1~3분 |
| 시트 데이터 (필요시 백업 사본으로) | 수동 |

---

## 12. 트러블슈팅

### "??? ??" 표시 (한글 깨짐)

| 원인 | 해결 |
|---|---|
| 토큰에 옛 이름 박힘 | sessionStorage.clear() + 재로그인 |
| 시트 데이터 자체 깨짐 | 시트 admin 행 이름 직접 수정 |
| 백그라운드 fetch 미반영 | 페이지 새로고침 (Cmd+R) |

### "본인 담당 신청만 처리할 수 있습니다" (v14에서도 발생 시)

| 원인 | 해결 |
|---|---|
| 시트 컬럼 20에 이름이 그대로 (마이그레이션 미실행) | GAS에서 `migrateAssigneeNameToId` 1회 실행 |
| admin이 시트에서 직접 한글 이름 입력 | admin.html UI에서 담당자 select 변경 (자동 ID 저장) |

### "AUTH_REQUIRED" / 세션 만료 alert

| 원인 | 해결 |
|---|---|
| 8시간 경과 — 토큰 만료 | 재로그인 |
| GAS Web App 재배포로 SECRET 분기 변경 | 재로그인 (이전 토큰 무효화됨) |
| sessionStorage 토큰 임의 삭제 | 재로그인 |

### 다른 탭 갔다 와도 데이터 안 들어옴

| 원인 | 해결 |
|---|---|
| GAS cold start로 첫 폴링 실패 | 사이드바 새로고침 버튼 한 번 클릭 |
| 60초 폴링이 도착할 때까지 대기 | 60초 |

### 첫 로그인이 너무 느림

| 원인 | 해결 |
|---|---|
| GAS Web App cold start | 정상 (2~5초). 두 번째 로그인은 0.5~1.5초 |
| handleLogin 응답 크기 큼 | v14에서 rows만 반환하도록 축소됨 |

---

## 13. 알려진 한계

- **토큰 강제 무효화 불가**: JWT 유사 자가서명 방식. 발급 후 8시간 동안 유효. 사용자 권한이 시트에서 변경돼도 즉시 반영 안 됨 (다음 로그인 때 반영). 운영상 큰 문제 X.
- **비밀번호 평문 시트 저장**: 신뢰된 단일 PC 환경 전제. 공용 PC 배포 시 별도 대책 필요 (예: SHA-256 해시).
- **콜드 스타트**: GAS Web App 특성. 일정 시간 idle 후 첫 호출 1~5초. Time-based trigger로 완화 가능 (10분마다 빈 함수 실행 → 따로 설정 필요).
- **동명이인 처리 X (v13)**: v14에서 ID 기반으로 전환되어 해결됨.

---

## 14. 핵심 학습 포인트 요약

1. **토큰 = 서명된 진실 (서버용)**. currentUser = 캐시된 사본 (화면용).
2. 서버는 토큰만 신뢰. 클라이언트 메모리 변조해도 서버 영향 X.
3. 페이로드는 발급 시점의 스냅샷 — 시트 변경에 자동 따라가지 않음.
4. 화면 표시용 데이터는 백그라운드 fetch로 주기적 보정 필요.
5. 시트엔 안정 식별자(ID), 화면엔 가독성 데이터(name) — 분리하면 인코딩·동명이인 문제 회피.
6. 모든 GAS 호출은 wrapper(`gasCall`)를 거치고 토큰 자동 첨부 + AUTH_REQUIRED 자동 처리.
7. 로그아웃·세션만료 시 메모리·DOM·sessionStorage 모두 정리해야 보안 (`_clearScreen` 헬퍼).

---

> **이 문서는 v13~v14 작업의 설계 결정과 보안 모델을 기록합니다. 차후 시스템 보강 작업 시 이 문서의 원칙을 따라야 일관성이 유지됩니다.**
