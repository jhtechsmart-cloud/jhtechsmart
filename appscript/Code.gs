/**
 * (주)재현테크 · 견적 관리 시스템
 * Google Apps Script 백엔드
 *
 * v13 (2026-05-12+) — 토큰 기반 인증 + 권한 필터 추가
 * 모든 action(handleSubmit 제외)은 토큰을 검증하며,
 * listRequests/handleConfirm 등 데이터 접근은 사용자의 isAdmin 여부와 담당자 이름을 기준으로 필터·검증.
 */

/* SPREADSHEET_ID — Script Properties 'SPREADSHEET_ID' 값에서 읽음.
   코드에 시트 ID를 박지 않음 — 운영/테스트 GAS 각각 Properties에서 직접 설정.
   설정 누락 시 doGet/doPost 진입에서 에러 응답. */
function _getSpreadsheetId(){
  const v = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!v) throw new Error('Script Property "SPREADSHEET_ID"가 설정되지 않았습니다. Apps Script ⚙ 프로젝트 설정 → 스크립트 속성에서 추가하세요.');
  return v;
}

// ─── 시트 초기화 (최초 1회 수동 실행 가능, 기존 시트에 헤더 누락 시에도 자동 보강) ───
function initSheets() {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());

  // 신청관리 — 21개 컬럼 헤더 보장 (기존 시트도 누락된 헤더 자동 추가)
  let s1 = ss.getSheetByName('신청관리');
  if (!s1) s1 = ss.insertSheet('신청관리');
  const s1Headers = [
    '접수번호','접수일시','업체명','사업자번호','대표자','연락처','이메일','주소',
    '사업자등록일','주업종','매출2023','매출2024','매출2025',
    '문제공정','도입목적','선택문제목표','선택장비','요청사항','상태','담당자','공정흐름도'
  ];
  if (s1.getLastRow() === 0) {
    s1.appendRow(s1Headers);
    s1.getRange(1, 1, 1, s1Headers.length).setFontWeight('bold').setBackground('#f3f7fb');
  } else {
    const curHeaders = s1.getRange(1, 1, 1, s1Headers.length).getValues()[0];
    s1Headers.forEach((h, idx) => {
      if (!curHeaders[idx]) s1.getRange(1, idx+1).setValue(h).setFontWeight('bold').setBackground('#f3f7fb');
    });
  }

  // 견적서발급관리 (담당자 컬럼 포함)
  let s2 = ss.getSheetByName('견적서발급관리');
  if (!s2) s2 = ss.insertSheet('견적서발급관리');
  if (s2.getLastRow() === 0) {
    s2.appendRow([
      '견적번호','접수번호','발급일시','업체명','선택장비','포함옵션','추가옵션(JSON)',
      '공급가액','부가세','합계','유효기간','상태','담당자'
    ]);
    s2.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#f3f7fb');
  } else {
    const lastCol = s2.getLastColumn();
    if (lastCol < 13) {
      s2.getRange(1, 13).setValue('담당자').setFontWeight('bold').setBackground('#f3f7fb');
    }
  }

  // 공급업체관리 (장비 목록 + 가격/옵션)
  let s3 = ss.getSheetByName('공급업체관리');
  if (!s3) s3 = ss.insertSheet('공급업체관리');
  if (s3.getLastRow() === 0) {
    s3.appendRow(['장비ID','장비명','카테고리','기본공급가액(원)','포함옵션(|구분)','추가옵션(JSON)']);
    s3.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f7fb');
    const pInc = 'RIP 소프트웨어 (Photoprint/Ergosoft 등)|잉크 기본 세트 포함|설치 및 기초 사용 교육|1년 무상 A/S|미디어 클램프/앵커 세트|전원 케이블 및 연결 자재';
    const cInc = '커팅 전용 소프트웨어|칼날 기본 세트|설치 및 기초 사용 교육|1년 무상 A/S|절단 공구 키트|전원 케이블 및 연결 자재';
    const pExt = '["화이트 잉크 키트","바니시 잉크 키트","롤 피더 유닛","LED 경화 업그레이드","잉크 추가 세트 (1세트)","연장 보증 2년","연장 보증 3년","현장 출장 설치비"]';
    const cExt = '["크리스 나이프 세트","하프 컷 모듈","마킹 툴 세트","밀링 툴","진공 테이블 업그레이드","연장 보증 2년","연장 보증 3년","현장 출장 설치비"]';
    [
      ['or16',  'XTRA OR16',  'printer','',pInc,pExt],
      ['or32',  'XTRA OR32',  'printer','',pInc,pExt],
      ['r20',   'XTRA R20',   'printer','',pInc,pExt],
      ['s2512', 'XTRA 2512S', 'printer','',pInc,pExt],
      ['x20',   'X20',        'printer','',pInc,pExt],
      ['ju2513','JU2513+',    'printer','',pInc,pExt],
      ['ju1810','JU1810+',    'printer','',pInc,pExt],
      ['ju9060','JU9060+',    'printer','',pInc,pExt],
      ['ju1361','JU1361',     'printer','',pInc,pExt],
      ['t8q',   'T8Q',        'printer','',pInc,pExt],
      ['t9m',   'T9M',        'printer','',pInc,pExt],
      ['jp0806','JP0806',     'cutter', '',cInc,cExt],
      ['jp1311','JP1311',     'cutter', '',cInc,cExt],
      ['jp1625','JP1625',     'cutter', '',cInc,cExt],
      ['sg1625','SG1625',     'cutter', '',cInc,cExt],
    ].forEach(row => s3.appendRow(row));
    s3.setColumnWidth(5, 260);
    s3.setColumnWidth(6, 220);
  }

  // 담당자관리 — 6컬럼
  let s4 = ss.getSheetByName('담당자관리');
  if (!s4) s4 = ss.insertSheet('담당자관리');
  if (s4.getLastRow() === 0) {
    s4.appendRow(['담당자ID','이름','전화번호','이메일','비밀번호','관리자여부']);
    s4.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f7fb');
    s4.appendRow(['admin','박현석 부장','010-6247-6261','smart@paxc.co.kr','jhtech2026','TRUE']);
  }
}

/* 시트 마이그레이션 — 신청관리·견적서발급관리의 담당자 컬럼에 들어있는 '이름'을 'ID'로 변환.
   v14에서 비교/저장 정책이 이름→ID로 바뀌었으므로, 옛 데이터를 1회 변환해야 함.
   사용 방법: Apps Script 에디터에서 함수 드롭다운에서 `migrateAssigneeNameToId` 선택 → ▶ 실행.
   실행 로그(좌측 실행 메뉴)에서 변환된 행 목록을 확인. 멱등(이미 ID면 skip). */
function migrateAssigneeNameToId(){
  const users = _readUsers();
  if(!users.length){ Logger.log('담당자관리 시트가 비어있어 마이그레이션 불가'); return; }
  const idSet = new Set(users.map(u=>u.id));
  const nameToId = {};
  users.forEach(u => { if(u.name) nameToId[u.name] = u.id; });

  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let converted = 0, skipped = 0, unknown = 0;

  // 신청관리 컬럼 20
  const s1 = ss.getSheetByName('신청관리');
  if(s1 && s1.getLastRow() > 1){
    const rows = s1.getDataRange().getValues();
    for(let i=1; i<rows.length; i++){
      const cur = String(rows[i][19] || '');
      if(!cur){ skipped++; continue; }
      if(idSet.has(cur)){ skipped++; continue; } // 이미 ID
      const id = nameToId[cur];
      if(id){
        s1.getRange(i+1, 20).setValue(id);
        Logger.log('신청관리 r' + (i+1) + ': "' + cur + '" → "' + id + '"');
        converted++;
      } else {
        Logger.log('신청관리 r' + (i+1) + ': "' + cur + '" — 일치 사용자 없음 (담당자관리 시트 확인 필요)');
        unknown++;
      }
    }
  }

  // 견적서발급관리 컬럼 13
  const s2 = ss.getSheetByName('견적서발급관리');
  if(s2 && s2.getLastRow() > 1){
    const rows = s2.getDataRange().getValues();
    for(let i=1; i<rows.length; i++){
      const cur = String(rows[i][12] || '');
      if(!cur){ skipped++; continue; }
      if(idSet.has(cur)){ skipped++; continue; }
      const id = nameToId[cur];
      if(id){
        s2.getRange(i+1, 13).setValue(id);
        Logger.log('견적서발급관리 r' + (i+1) + ': "' + cur + '" → "' + id + '"');
        converted++;
      } else {
        Logger.log('견적서발급관리 r' + (i+1) + ': "' + cur + '" — 일치 사용자 없음');
        unknown++;
      }
    }
  }

  Logger.log('마이그레이션 완료. 변환=' + converted + ', 그대로(이미ID/빈값)=' + skipped + ', 일치없음=' + unknown);
}

// ═══════════════════════════════════════════════════════════════════
// 인증 / 토큰
// ═══════════════════════════════════════════════════════════════════

/* SECRET — Script Properties 'SECRET'. 없으면 자동 생성(첫 호출 시). */
function getSecret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) {
    s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g,'');
    props.setProperty('SECRET', s);
  }
  return s;
}

function _b64encode(s) {
  return Utilities.base64EncodeWebSafe(s).replace(/=+$/,'');
}
function _b64decode(s) {
  // base64 webSafe decoding (URL-safe)
  const padded = s + '='.repeat((4 - s.length % 4) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}
function _hmacHex(message) {
  const sigBytes = Utilities.computeHmacSha256Signature(message, getSecret());
  return sigBytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/* 토큰 발급 — 8시간 만료. phone은 견적서 PDF의 담당자 연락처에 사용되므로 페이로드에 포함. */
function generateToken(user) {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = JSON.stringify({id:user.id, name:user.name, phone:user.phone||'', isAdmin:user.isAdmin, exp:exp});
  const payloadB64 = _b64encode(payload);
  const sig = _hmacHex(payloadB64);
  return payloadB64 + '.' + sig;
}

/* 토큰 검증 — 유효하면 user 페이로드 반환, 실패 시 null */
function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = String(token).split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    if (sig !== _hmacHex(payloadB64)) return null;
    const payload = JSON.parse(_b64decode(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function authError(msg)  { return jsonResponse({status:'error', code:'AUTH_REQUIRED',     message: msg || '인증이 필요합니다'}); }
function permError(msg)  { return jsonResponse({status:'error', code:'PERMISSION_DENIED', message: msg || '권한이 없습니다'}); }

/* 캐시 헬퍼 (CacheService) — 장비 설정만 캐시. 담당자 데이터는 변경이 자주 있고
   시트 직접 편집 시 캐시 무효화가 안 되어 stale 위험. 매번 시트 직접 읽음. */
const CACHE_TTL_EQUIP = 600;   // 장비 옵션 — 10분
function _cacheGet(key){
  try{ const v = CacheService.getScriptCache().get(key); return v ? JSON.parse(v) : null; }
  catch(e){ return null; }
}
function _cachePut(key, value, ttl){
  try{ CacheService.getScriptCache().put(key, JSON.stringify(value), ttl); }catch(e){}
}
function _cacheDel(key){ try{ CacheService.getScriptCache().remove(key); }catch(e){} }

/* 시트에서 담당자 목록 읽기 (내부 함수, 비밀번호 포함) */
function _readUsers() {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('담당자관리');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    result.push({
      id: String(r[0]), name: String(r[1]),
      phone: String(r[2]), email: String(r[3]), pw: String(r[4]),
      isAdmin: r[5] === true || String(r[5]).toUpperCase() === 'TRUE'
    });
  }
  return result;
}

/* 로그인 — id/pw 검증 후 토큰 + 핵심 데이터(rows)만 반환.
   equipConfig·userConfig는 클라이언트가 로그인 후 백그라운드로 별도 fetch (응답 크기·지연 최소화). */
function handleLogin(data) {
  const id = (data.id || '').trim();
  const pw = data.pw || '';
  if (!id || !pw) return jsonResponse({status:'error', code:'AUTH_REQUIRED', message:'아이디·비밀번호를 입력하세요'});

  const users = _readUsers();
  const user = users.find(u => u.id === id && u.pw === pw);
  if (!user) return jsonResponse({status:'error', code:'AUTH_REQUIRED', message:'아이디 또는 비밀번호가 틀렸습니다'});

  const userInfo = {id:user.id, name:user.name, phone:user.phone, isAdmin:user.isAdmin};
  const token = generateToken(userInfo);
  const rows = _filteredRequestRows(userInfo);

  return jsonResponse({
    status: 'ok',
    token: token,
    user: userInfo,
    rows: rows
  });
}

// ═══════════════════════════════════════════════════════════════════
// 라우터
// ═══════════════════════════════════════════════════════════════════

function doPost(e) {
  const params = e.parameter || {};
  const action = params.action;

  try {
    // 공개 action (인증 불필요)
    if (action === 'submit') return handleSubmit(params);
    if (action === 'login')  return handleLogin(JSON.parse(params.data || '{}'));

    // 인증 필수
    const user = verifyToken(params.token);
    if (!user) return authError();

    if (action === 'confirm')          return handleConfirm(JSON.parse(params.data || '{}'), user);
    if (action === 'saveQuote')        return handleSaveQuote(JSON.parse(params.data || '{}'), user);
    if (action === 'updateAssignee')   return handleUpdateAssignee(JSON.parse(params.data || '{}'), user);
    if (action === 'saveEquipConfig')  return handleSaveEquipConfig(JSON.parse(params.data || '{}'), user);
    if (action === 'saveUserConfig')   return handleSaveUserConfig(JSON.parse(params.data || '{}'), user);
    return jsonResponse({status:'error', message:'알 수 없는 action'});
  } catch (err) {
    return jsonResponse({status:'error', message:err.toString()});
  }
}

function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const callback = params.callback;

  let data;
  try {
    // 모든 GET은 인증 필요
    const user = verifyToken(params.token);
    if (!user) {
      data = {status:'error', code:'AUTH_REQUIRED', message:'인증이 필요합니다'};
    } else if (action === 'list')            data = {status:'ok', rows: _filteredRequestRows(user)};
    else if (action === 'get')               data = getRequest(params.id, user);
    else if (action === 'listQuotes')        data = listQuotes(user);
    else if (action === 'getEquipConfig')    data = {status:'ok', items: _readEquipConfig()};
    else if (action === 'getUserConfig')     data = {status:'ok', users: _readUserConfigMasked()};
    else if (action === 'getVersions')       data = getVersions(params.id||'', user);
    else if (action === 'whoami')            data = {status:'ok', user:user}; // 토큰 검증 전용
    else data = {status:'error', message:'알 수 없는 action'};
  } catch (err) {
    data = {status:'error', message:err.toString()};
  }

  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════
// 신청 처리
// ═══════════════════════════════════════════════════════════════════

/* 신청 제출 — 공개 (quote.html에서 인증 없이 호출) */
function handleSubmit(p) {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let sheet = ss.getSheetByName('신청관리');
  if (!sheet) {
    sheet = ss.insertSheet('신청관리');
    sheet.appendRow(['접수번호','접수일시','업체명','사업자번호','대표자','연락처','이메일','주소','사업자등록일','주업종','매출2023','매출2024','매출2025','문제공정','도입목적','선택문제목표','선택장비','요청사항','상태','담당자','공정흐름도']);
    sheet.getRange(1,1,1,21).setFontWeight('bold').setBackground('#f3f7fb');
  }
  const id = generateId('REQ');
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([
    id, now, p.company||'', p.bizNo||'', p.ceo||'', p.phone||'',
    p.email||'', p.address||'', p.foundDate||'', p.industry||'',
    p.rev2023||'', p.rev2024||'', p.rev2025||'',
    p.problemProcess||'', p.adoptionType||'', p.issues||'',
    p.equipment||'', p.equipRequest||'', 'new', '', p.processFlow||''
  ]);
  return jsonResponse({status:'ok', id:id});
}

function generateId(prefix) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

/* 권한 체크 헬퍼 — 비관리자는 본인 담당 신청에만 접근 가능
   v14: 시트의 담당자 컬럼은 'u.id'(영문)로 저장. ID 비교라 한글 깨짐 무관. */
function _checkRequestPermission(reqId, user) {
  if (user.isAdmin) return {ok:true};
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('신청관리');
  if (!sheet) return {ok:false, error:permError('시트 없음')};
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === reqId) {
      const cellId = String(rows[i][19] || '');
      if (cellId === user.id) return {ok:true};
      return {ok:false, error:permError('본인 담당 신청만 처리할 수 있습니다')};
    }
  }
  return {ok:false, error:jsonResponse({status:'error', message:'접수번호를 찾을 수 없음'})};
}

/* 견적 확정 (또는 임시저장) — 권한 체크 후 처리 */
function handleConfirm(data, user) {
  const perm = _checkRequestPermission(data.id, user);
  if (!perm.ok) return perm.error;

  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet1 = ss.getSheetByName('신청관리');
  let sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet2) {
    sheet2 = ss.insertSheet('견적서발급관리');
    sheet2.appendRow(['견적번호','접수번호','발급일시','업체명','선택장비','포함옵션','추가옵션(JSON)','공급가액','부가세','합계','유효기간','상태','담당자']);
    sheet2.getRange(1,1,1,13).setFontWeight('bold').setBackground('#f3f7fb');
  }

  // 신청관리 상태 업데이트
  if (sheet1) {
    const rows1 = sheet1.getDataRange().getValues();
    for (let i = 1; i < rows1.length; i++) {
      if (rows1[i][0] === data.id) {
        sheet1.getRange(i+1, 19).setValue(data.status);
        break;
      }
    }
  }

  // v14: 견적서발급관리 컬럼 13 (담당자) — 이제 u.id 저장
  const assigneeId = data.assignee || '';
  const rowData = [
    data.quoteNo||'', data.id,
    Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    data.company||'', data.equipment||'',
    (data.includeOpts||[]).join(' | '),
    JSON.stringify(data.extraOpts||[]),
    data.supplyPrice||'', data.taxPrice||'', data.totalPrice||'',
    data.validUntil||'', data.status||'confirmed', assigneeId
  ];

  const rows2 = sheet2.getDataRange().getValues();
  let updated = false;
  for (let i = 1; i < rows2.length; i++) {
    if (rows2[i][1] === data.id && rows2[i][0] === data.quoteNo) {
      const existingStatus = String(rows2[i][11]||'').toLowerCase();
      if (existingStatus === 'confirmed') break;
      sheet2.getRange(i+1, 1, 1, 13).setValues([rowData]);
      updated = true;
      break;
    }
  }
  if (!updated) sheet2.appendRow(rowData);

  return jsonResponse({status:'ok'});
}

/* 담당자 배정 — 관리자 전용 */
function handleUpdateAssignee(data, user) {
  if (!user.isAdmin) return permError('담당자 변경은 관리자만 가능합니다');
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet1 = ss.getSheetByName('신청관리');
  if (!sheet1) return jsonResponse({status:'error', message:'시트 없음'});
  const rows = sheet1.getDataRange().getValues();
  // v14: 시트엔 u.id 저장
  const value = data.assignee || '';
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet1.getRange(i+1, 20).setValue(value);
      return jsonResponse({status:'ok'});
    }
  }
  return jsonResponse({status:'error', message:'접수번호를 찾을 수 없음'});
}

// ═══════════════════════════════════════════════════════════════════
// 신청 목록/상세 (모두 권한 필터)
// ═══════════════════════════════════════════════════════════════════

function _filteredRequestRows(user) {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet1 = ss.getSheetByName('신청관리');
  const sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet1) return [];
  const rows1 = sheet1.getDataRange().getValues();
  const rows2 = sheet2 ? sheet2.getDataRange().getValues() : [[]];

  // 견적서발급관리 → reqId 별 모든 버전 배열 수집
  const versionsMap = {};
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i];
    const reqId = r[1];
    if (!reqId) continue;
    if (!versionsMap[reqId]) versionsMap[reqId] = [];
    versionsMap[reqId].push({
      quoteNo: String(r[0]||''),
      reqId: String(reqId),
      issuedAt: r[2] ? Utilities.formatDate(new Date(r[2]), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '',
      company: String(r[3]||''),
      equipment: String(r[4]||''),
      includeOpts: r[5] ? String(r[5]).split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice: r[7]!==''?String(r[7]):'',
      taxPrice: r[8]!==''?String(r[8]):'',
      totalPrice: r[9]!==''?String(r[9]):'',
      validUntil: r[10] ? Utilities.formatDate(new Date(r[10]), 'Asia/Seoul', 'yyyy-MM-dd') : '',
      status: String(r[11]||''),
      assignee: String(r[12]||'')
    });
  }

  const quoteMap = {};
  Object.keys(versionsMap).forEach(reqId => {
    const sorted = [...versionsMap[reqId]].sort((a,b)=>String(a.quoteNo)<String(b.quoteNo)?-1:1);
    quoteMap[reqId] = sorted[sorted.length - 1];
  });

  const result = [];
  for (let i = 1; i < rows1.length; i++) {
    const r = rows1[i];
    // v14: 시트엔 u.id 저장. 비관리자는 본인 ID와 일치하는 행만.
    const assigneeId = String(r[19] || '');
    if (!user.isAdmin && assigneeId !== user.id) continue;

    const q = quoteMap[r[0]] || {};
    result.push({
      id:r[0], submittedAt:r[1], company:r[2], bizNo:r[3], ceo:r[4],
      phone:r[5], email:r[6], address:r[7], foundDate:r[8], industry:r[9],
      rev2023:r[10], rev2024:r[11], rev2025:r[12],
      problemProcess:r[13], adoptionType:r[14], issues:r[15],
      equipment:r[16], equipRequest:r[17], status:r[18]||'new', assignee:assigneeId,
      processFlow:r[20]||'',
      quoteNo:q.quoteNo||'', validUntil:q.validUntil||'',
      includeOpts:q.includeOpts||[], extraOpts:q.extraOpts||[],
      supplyPrice:q.supplyPrice||'', taxPrice:q.taxPrice||'', totalPrice:q.totalPrice||'',
      versions: versionsMap[r[0]] || []
    });
  }
  return result;
}

function getRequest(id, user) {
  const rows = _filteredRequestRows(user);
  const found = rows.find(r => r.id === id);
  if (!found) return {status:'error', code:'PERMISSION_DENIED', message:'없거나 접근 권한이 없습니다'};
  return {status:'ok', request: found};
}

function getVersions(reqId, user) {
  // 권한 체크 (해당 신청 접근 가능 여부)
  const perm = _checkRequestPermission(reqId, user);
  if (!perm.ok) return {status:'error', code:'PERMISSION_DENIED', rows:[]};

  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('견적서발급관리');
  if (!sheet || sheet.getLastRow() <= 1) return {status:'ok', rows:[]};
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[1]) === String(reqId)) {
      result.push({
        quoteNo:String(r[0]||''), reqId:String(r[1]||''), issuedAt:r[2]||'',
        company:String(r[3]||''), equipment:String(r[4]||''),
        includeOpts: r[5] ? String(r[5]).split(' | ') : [],
        extraOpts: safeParseJSON(r[6]),
        supplyPrice:r[7]||'', taxPrice:r[8]||'', totalPrice:r[9]||'',
        validUntil:r[10]||'', status:String(r[11]||''), assignee:String(r[12]||'')
      });
    }
  }
  return {status:'ok', rows: result};
}

function listQuotes(user) {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('견적서발급관리');
  if (!sheet) return {status:'ok', rows:[]};
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // v14: 비관리자는 본인 ID와 일치하는 견적만
    if (!user.isAdmin && String(r[12] || '') !== user.id) continue;
    result.push({
      quoteNo:r[0], reqId:r[1], issuedAt:r[2], company:r[3], equipment:r[4],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice:r[7], taxPrice:r[8], totalPrice:r[9],
      validUntil:r[10], status:r[11], assignee:r[12]||''
    });
  }
  return {status:'ok', rows:result};
}

// ═══════════════════════════════════════════════════════════════════
// 공급업체관리 (장비 설정)
// ═══════════════════════════════════════════════════════════════════

function _readEquipConfig() {
  const cached = _cacheGet('equip_v1');
  if (cached) return cached;
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('공급업체관리');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    result.push({
      id:String(r[0]), name:String(r[1]), cat:String(r[2]),
      basePrice: r[3] !== '' ? String(r[3]) : '',
      includeOpts: r[4] ? String(r[4]).split('|').map(s=>s.trim()).filter(Boolean) : [],
      extraOpts: safeParseJSON(r[5])
    });
  }
  _cachePut('equip_v1', result, CACHE_TTL_EQUIP);
  return result;
}

function handleSaveEquipConfig(data, user) {
  if (!user.isAdmin) return permError('장비 설정은 관리자만 가능합니다');
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let sheet = ss.getSheetByName('공급업체관리');
  if (!sheet) {
    sheet = ss.insertSheet('공급업체관리');
    sheet.appendRow(['장비ID','장비명','카테고리','기본공급가액(원)','포함옵션(|구분)','추가옵션(JSON)']);
    sheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#f3f7fb');
  }
  const items = data.items || [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow()-1, 6).clearContent();
  }
  items.forEach(item => {
    sheet.appendRow([
      item.id||'', item.name||'', item.cat||'', item.basePrice||'',
      (item.includeOpts||[]).join('|'),
      JSON.stringify(item.extraOpts||[])
    ]);
  });
  _cacheDel('equip_v1'); // 캐시 무효화
  return jsonResponse({status:'ok'});
}

// ═══════════════════════════════════════════════════════════════════
// 담당자관리
// ═══════════════════════════════════════════════════════════════════

/* 인증된 사용자에게 반환할 사용자 목록 — 비밀번호 마스킹 */
function _readUserConfigMasked() {
  return _readUsers().map(u => ({
    id: u.id, name: u.name,
    phone: u.phone, email: u.email,
    pw: '',     // 마스킹 (클라이언트엔 절대 노출 X)
    isAdmin: u.isAdmin
  }));
}

function handleSaveUserConfig(data, user) {
  if (!user.isAdmin) return permError('담당자 관리는 관리자만 가능합니다');
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let sheet = ss.getSheetByName('담당자관리');
  if (!sheet) {
    sheet = ss.insertSheet('담당자관리');
    sheet.appendRow(['담당자ID','이름','전화번호','이메일','비밀번호','관리자여부']);
    sheet.getRange(1,1,1,6).setFontWeight('bold').setBackground('#f3f7fb');
  }
  const users = data.users || [];

  /* 비밀번호 마스킹 정책으로 인해 클라이언트는 기존 비밀번호를 알 수 없음.
     따라서 빈 pw가 들어오면 기존 시트의 비밀번호를 유지. */
  const existing = _readUsers();
  const pwById = {};
  existing.forEach(u => { pwById[u.id] = u.pw; });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow()-1, 6).clearContent();
  }
  users.forEach(u => {
    const pw = u.pw || pwById[u.id] || '';
    sheet.appendRow([u.id||'', u.name||'', u.phone||'', u.email||'', pw, u.isAdmin?'TRUE':'FALSE']);
  });
  return jsonResponse({status:'ok'});
}

// ═══════════════════════════════════════════════════════════════════
// Google Drive 견적서 PDF 저장
// ═══════════════════════════════════════════════════════════════════

/* PDF 파일 저장 — 인증된 사용자면 OK (PDF 생성 자체가 confirm/revise 통과 후이므로
   confirmQuote/confirmRevise에서 이미 권한 체크됨). 추가 안전망: reqId 동봉 시 권한 검증 */
function handleSaveQuote(data, user) {
  // 호출 측이 reqId를 보냈으면 권한 체크
  if (data.reqId) {
    const perm = _checkRequestPermission(data.reqId, user);
    if (!perm.ok) return perm.error;
  }

  const filename = (data.filename||'견적서').replace(/[\/\\:*?"<>|]/g,'_');
  const folderName = '재현테크_견적서';
  const folderIter = DriveApp.getFoldersByName(folderName);
  const folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder(folderName);

  // 동일 파일명만 휴지통 처리 (다른 버전 파일은 영향 없음)
  const pdfIter = folder.getFilesByName(filename + '.pdf');
  while (pdfIter.hasNext()) pdfIter.next().setTrashed(true);
  const htmlIter = folder.getFilesByName(filename + '.html');
  while (htmlIter.hasNext()) htmlIter.next().setTrashed(true);

  let file;
  if (data.pdf) {
    const pdfBytes = Utilities.base64Decode(data.pdf);
    const pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', filename + '.pdf');
    file = folder.createFile(pdfBlob);
  } else {
    const blob = Utilities.newBlob(data.html||'', 'text/html', filename + '.html');
    file = folder.createFile(blob);
  }

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonResponse({status:'ok', url:file.getUrl(), name:file.getName(), folderId:folder.getId()});
}

// ═══════════════════════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════════════════════

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParseJSON(str) {
  try { return JSON.parse(str||'[]'); } catch { return []; }
}
