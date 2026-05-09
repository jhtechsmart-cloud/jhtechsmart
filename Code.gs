/**
 * (주)재현테크 · 견적 관리 시스템
 * Google Apps Script 백엔드
 */

const SPREADSHEET_ID = '1HoFkaRY0xOGEriXAjrQ7tyH9LOZ5UkPamyRzxc_W3Ts';

// ─── 시트 초기화 (최초 1회 수동 실행) ───
function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 신청관리
  let s1 = ss.getSheetByName('신청관리');
  if (!s1) s1 = ss.insertSheet('신청관리');
  if (s1.getLastRow() === 0) {
    s1.appendRow([
      '접수번호','접수일시','업체명','사업자번호','대표자','연락처','이메일','주소',
      '사업자등록일','주업종','매출2023','매출2024','매출2025',
      '문제공정','도입목적','선택문제목표','선택장비','요청사항','상태','담당자','공정흐름도'
    ]);
    s1.getRange(1, 1, 1, 21).setFontWeight('bold').setBackground('#f3f7fb');
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
    // 기존 시트에 담당자 컬럼 없으면 추가
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

  // 담당자관리
  let s4 = ss.getSheetByName('담당자관리');
  if (!s4) s4 = ss.insertSheet('담당자관리');
  if (s4.getLastRow() === 0) {
    s4.appendRow(['담당자ID','이름','직책','전화번호','이메일','비밀번호','관리자여부']);
    s4.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#f3f7fb');
    s4.appendRow(['admin','박현석','부장','010-6247-6261','smart@paxc.co.kr','jhtech2026','TRUE']);
  }
}

// ─── ID 생성 ───
function generateId(prefix) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Date.now().toString().slice(-5)}`;
}

// ─── POST 처리 ───
function doPost(e) {
  const params = e.parameter || {};
  const action = params.action;

  try {
    if (action === 'submit')           return handleSubmit(params);
    if (action === 'confirm')          return handleConfirm(JSON.parse(params.data || '{}'));
    if (action === 'saveQuote')        return handleSaveQuote(JSON.parse(params.data || '{}'));
    if (action === 'updateAssignee')   return handleUpdateAssignee(JSON.parse(params.data || '{}'));
    if (action === 'saveEquipConfig')  return handleSaveEquipConfig(JSON.parse(params.data || '{}'));
    if (action === 'saveUserConfig')   return handleSaveUserConfig(JSON.parse(params.data || '{}'));
    return jsonResponse({status:'error', message:'알 수 없는 action'});
  } catch (err) {
    return jsonResponse({status:'error', message:err.toString()});
  }
}

function handleSubmit(p) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

function handleConfirm(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

  const assignee = data.assigneeName || data.assignee || '';
  const rowData = [
    data.quoteNo||'', data.id,
    Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    data.company||'', data.equipment||'',
    (data.includeOpts||[]).join(' | '),
    JSON.stringify(data.extraOpts||[]),
    data.supplyPrice||'', data.taxPrice||'', data.totalPrice||'',
    data.validUntil||'', data.status||'confirmed', assignee
  ];

  // 기존 행 업데이트 or 신규 추가
  const rows2 = sheet2.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows2.length; i++) {
    if (rows2[i][1] === data.id && rows2[i][0] === data.quoteNo) {
      sheet2.getRange(i+1, 1, 1, 13).setValues([rowData]);
      found = true;
      break;
    }
  }
  if (!found) sheet2.appendRow(rowData);

  return jsonResponse({status:'ok'});
}

// ─── GET 처리 ───
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const callback = params.callback;

  let data;
  try {
    if      (action === 'list')          data = listRequests();
    else if (action === 'get')           data = getRequest(params.id);
    else if (action === 'listQuotes')    data = listQuotes();
    else if (action === 'getEquipConfig') data = getEquipConfig();
    else if (action === 'getUserConfig')  data = getUserConfig();
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

function listRequests() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet1 = ss.getSheetByName('신청관리');
  const sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet1) return {rows:[]};
  const rows1 = sheet1.getDataRange().getValues();
  const rows2 = sheet2 ? sheet2.getDataRange().getValues() : [[]];

  const quoteMap = {};
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i];
    quoteMap[r[1]] = {
      quoteNo:r[0], validUntil:r[10],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice:r[7], taxPrice:r[8], totalPrice:r[9],
      quoteAssignee: r[12]||''
    };
  }

  const result = [];
  for (let i = 1; i < rows1.length; i++) {
    const r = rows1[i];
    const q = quoteMap[r[0]] || {};
    result.push({
      id:r[0], submittedAt:r[1], company:r[2], bizNo:r[3], ceo:r[4],
      phone:r[5], email:r[6], address:r[7], foundDate:r[8], industry:r[9],
      rev2023:r[10], rev2024:r[11], rev2025:r[12],
      problemProcess:r[13], adoptionType:r[14], issues:r[15],
      equipment:r[16], equipRequest:r[17], status:r[18]||'new', assignee:r[19]||'',
      processFlow:r[20]||'',
      quoteNo:q.quoteNo||'', validUntil:q.validUntil||'',
      includeOpts:q.includeOpts||[], extraOpts:q.extraOpts||[],
      supplyPrice:q.supplyPrice||'', taxPrice:q.taxPrice||'', totalPrice:q.totalPrice||''
    });
  }
  return {rows:result};
}

function getRequest(id) {
  return listRequests().rows.find(r => r.id === id) || null;
}

function listQuotes() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('견적서발급관리');
  if (!sheet) return {rows:[]};
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    result.push({
      quoteNo:r[0], reqId:r[1], issuedAt:r[2], company:r[3], equipment:r[4],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice:r[7], taxPrice:r[8], totalPrice:r[9],
      validUntil:r[10], status:r[11], assignee:r[12]||''
    });
  }
  return {rows:result};
}

// ─── 공급업체관리 (장비 설정) ───
function getEquipConfig() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('공급업체관리');
  if (!sheet || sheet.getLastRow() <= 1) return {items:[]};
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
  return {items:result};
}

function handleSaveEquipConfig(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  return jsonResponse({status:'ok'});
}

// ─── 담당자관리 ───
function getUserConfig() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('담당자관리');
  if (!sheet || sheet.getLastRow() <= 1) return {users:[]};
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    result.push({
      id:String(r[0]), name:String(r[1]), title:String(r[2]),
      phone:String(r[3]), email:String(r[4]), pw:String(r[5]),
      isAdmin: r[6]===true || String(r[6]).toUpperCase()==='TRUE'
    });
  }
  return {users:result};
}

function handleSaveUserConfig(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('담당자관리');
  if (!sheet) {
    sheet = ss.insertSheet('담당자관리');
    sheet.appendRow(['담당자ID','이름','직책','전화번호','이메일','비밀번호','관리자여부']);
    sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#f3f7fb');
  }
  const users = data.users || [];
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow()-1, 7).clearContent();
  }
  users.forEach(u => {
    sheet.appendRow([u.id||'',u.name||'',u.title||'',u.phone||'',u.email||'',u.pw||'',u.isAdmin?'TRUE':'FALSE']);
  });
  return jsonResponse({status:'ok'});
}

// ─── 담당자 배정 업데이트 ───
function handleUpdateAssignee(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet1 = ss.getSheetByName('신청관리');
  if (!sheet1) return jsonResponse({status:'error', message:'시트 없음'});
  const rows = sheet1.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet1.getRange(i+1, 20).setValue(data.assignee||'');
      return jsonResponse({status:'ok'});
    }
  }
  return jsonResponse({status:'error', message:'접수번호를 찾을 수 없음'});
}

// ─── Google Drive 견적서 저장 (PDF) ───
function handleSaveQuote(data) {
  const now = new Date();
  const company = (data.company||'quote').replace(/[\/\\:*?"<>|]/g,'_').replace(/\s+/g,'_');
  const dateStr = Utilities.formatDate(now, 'Asia/Seoul', 'yyyyMMdd');
  const filename = (data.filename||(company+'_'+dateStr)).replace(/[\/\\:*?"<>|]/g,'_');

  const folderName = '재현테크_견적서';
  const folderIter = DriveApp.getFoldersByName(folderName);
  const folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder(folderName);

  const ym = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM');
  const subIter = folder.getFoldersByName(ym);
  const subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(ym);

  let file;
  if (data.pdf) {
    const pdfBytes = Utilities.base64Decode(data.pdf);
    const pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', filename+'.pdf');
    file = subFolder.createFile(pdfBlob);
  } else {
    const blob = Utilities.newBlob(data.html||'', 'text/html', filename+'.html');
    file = subFolder.createFile(blob);
  }

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonResponse({status:'ok', url:file.getUrl(), name:file.getName(), folderId:subFolder.getId()});
}

// ─── 유틸 ───
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParseJSON(str) {
  try { return JSON.parse(str||'[]'); } catch { return []; }
}
