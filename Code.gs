/**
 * (주)재현테크 · 견적 관리 시스템
 * Google Apps Script 백엔드
 *
 * [설치 방법]
 * 1. https://script.google.com 에서 새 프로젝트 생성
 * 2. 이 파일 내용을 복사하여 Code.gs에 붙여넣기
 * 3. SPREADSHEET_ID를 실제 Google Sheets ID로 수정
 * 4. 배포 → 새 배포 → 웹앱
 *    - 실행 계정: 나(본인)
 *    - 액세스 권한: 모든 사용자(익명 포함)
 * 5. 배포 URL을 관리자.html과 장비 견적 요청 프로그램.html의 URL 입력란에 붙여넣기
 *
 * [Google Sheets 구성]
 * 시트1: 신청관리
 * 시트2: 견적서발급관리
 * → 최초 실행 시 initSheets()를 수동으로 한 번 실행하면 헤더가 자동 생성됩니다.
 */

const SPREADSHEET_ID = '1HoFkaRY0xOGEriXAjrQ7tyH9LOZ5UkPamyRzxc_W3Ts';

// ─── 시트 초기화 (최초 1회 수동 실행) ───
function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let sheet1 = ss.getSheetByName('신청관리');
  if (!sheet1) sheet1 = ss.insertSheet('신청관리');
  if (sheet1.getLastRow() === 0) {
    sheet1.appendRow([
      '접수번호', '접수일시', '업체명', '사업자번호', '대표자', '연락처', '이메일', '주소',
      '사업자등록일', '주업종', '매출2023', '매출2024', '매출2025',
      '문제공정', '도입목적', '선택문제목표', '선택장비', '요청사항', '상태'
    ]);
    sheet1.getRange(1, 1, 1, 19).setFontWeight('bold').setBackground('#f3f7fb');
  }

  let sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet2) sheet2 = ss.insertSheet('견적서발급관리');
  if (sheet2.getLastRow() === 0) {
    sheet2.appendRow([
      '견적번호', '접수번호', '발급일시', '업체명', '선택장비', '포함옵션', '추가옵션(JSON)',
      '공급가액', '부가세', '합계', '유효기간', '상태'
    ]);
    sheet2.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#f3f7fb');
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
    if (action === 'submit') {
      return handleSubmit(params);
    } else if (action === 'confirm') {
      const data = JSON.parse(params.data || '{}');
      return handleConfirm(data);
    } else if (action === 'saveQuote') {
      const data = JSON.parse(params.data || '{}');
      return handleSaveQuote(data);
    }
    return jsonResponse({status: 'error', message: '알 수 없는 action'});
  } catch (err) {
    return jsonResponse({status: 'error', message: err.toString()});
  }
}

function handleSubmit(p) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('신청관리');
  if (!sheet) {
    sheet = ss.insertSheet('신청관리');
    sheet.appendRow(['접수번호','접수일시','업체명','사업자번호','대표자','연락처','이메일','주소','사업자등록일','주업종','매출2023','매출2024','매출2025','문제공정','도입목적','선택문제목표','선택장비','요청사항','상태']);
    sheet.getRange(1,1,1,19).setFontWeight('bold').setBackground('#f3f7fb');
  }
  const id = generateId('REQ');
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

  sheet.appendRow([
    id, now, p.company || '', p.bizNo || '', p.ceo || '', p.phone || '',
    p.email || '', p.address || '', p.foundDate || '', p.industry || '',
    p.rev2023 || '', p.rev2024 || '', p.rev2025 || '',
    p.problemProcess || '', p.adoptionType || '', p.issues || '',
    p.equipment || '', p.equipRequest || '', 'new'
  ]);

  return jsonResponse({status: 'ok', id: id});
}

function handleConfirm(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet1 = ss.getSheetByName('신청관리');
  let sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet2) {
    sheet2 = ss.insertSheet('견적서발급관리');
    sheet2.appendRow(['견적번호','접수번호','발급일시','업체명','선택장비','포함옵션','추가옵션(JSON)','공급가액','부가세','합계','유효기간','상태']);
    sheet2.getRange(1,1,1,12).setFontWeight('bold').setBackground('#f3f7fb');
  }

  // 신청관리 상태 업데이트
  const rows1 = sheet1.getDataRange().getValues();
  for (let i = 1; i < rows1.length; i++) {
    if (rows1[i][0] === data.id) {
      sheet1.getRange(i + 1, 19).setValue(data.status);
      break;
    }
  }

  // 견적서발급관리 업데이트 or 신규 (quoteNo가 같을 때만 업데이트, 다르면 신규 버전 행 추가)
  const rows2 = sheet2.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows2.length; i++) {
    if (rows2[i][1] === data.id && rows2[i][0] === data.quoteNo) {
      sheet2.getRange(i + 1, 1, 1, 12).setValues([[
        data.quoteNo || '', data.id, Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
        data.company || '', data.equipment || '',
        (data.includeOpts || []).join(' | '),
        JSON.stringify(data.extraOpts || []),
        data.supplyPrice || '', data.taxPrice || '', data.totalPrice || '',
        data.validUntil || '', data.status || 'confirmed'
      ]]);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet2.appendRow([
      data.quoteNo || '', data.id,
      Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      data.company || '', data.equipment || '',
      (data.includeOpts || []).join(' | '),
      JSON.stringify(data.extraOpts || []),
      data.supplyPrice || '', data.taxPrice || '', data.totalPrice || '',
      data.validUntil || '', data.status || 'confirmed'
    ]);
  }

  return jsonResponse({status: 'ok'});
}

// ─── GET 처리 (JSONP 지원) ───
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const callback = params.callback;

  let data;
  try {
    if (action === 'list') {
      data = listRequests();
    } else if (action === 'get') {
      data = getRequest(params.id);
    } else if (action === 'listQuotes') {
      data = listQuotes();
    } else {
      data = {status: 'error', message: '알 수 없는 action'};
    }
  } catch (err) {
    data = {status: 'error', message: err.toString()};
  }

  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function listRequests() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet1 = ss.getSheetByName('신청관리');
  const sheet2 = ss.getSheetByName('견적서발급관리');
  if (!sheet1) return { rows: [] };
  const rows1 = sheet1.getDataRange().getValues();
  const rows2 = sheet2 ? sheet2.getDataRange().getValues() : [[]];

  // 견적서 데이터 매핑 (접수번호 → 견적 데이터)
  const quoteMap = {};
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i];
    quoteMap[r[1]] = {
      quoteNo: r[0], validUntil: r[10],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice: r[7], taxPrice: r[8], totalPrice: r[9]
    };
  }

  const result = [];
  for (let i = 1; i < rows1.length; i++) {
    const r = rows1[i];
    const q = quoteMap[r[0]] || {};
    result.push({
      id: r[0], submittedAt: r[1], company: r[2], bizNo: r[3], ceo: r[4],
      phone: r[5], email: r[6], address: r[7], foundDate: r[8], industry: r[9],
      rev2023: r[10], rev2024: r[11], rev2025: r[12],
      problemProcess: r[13], adoptionType: r[14], issues: r[15],
      equipment: r[16], equipRequest: r[17], status: r[18] || 'new',
      quoteNo: q.quoteNo || '', validUntil: q.validUntil || '',
      includeOpts: q.includeOpts || [], extraOpts: q.extraOpts || [],
      supplyPrice: q.supplyPrice || '', taxPrice: q.taxPrice || '', totalPrice: q.totalPrice || ''
    });
  }
  return {rows: result};
}

function getRequest(id) {
  const all = listRequests().rows;
  return all.find(r => r.id === id) || null;
}

function listQuotes() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('견적서발급관리');
  const rows = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    result.push({
      quoteNo: r[0], reqId: r[1], issuedAt: r[2], company: r[3], equipment: r[4],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice: r[7], taxPrice: r[8], totalPrice: r[9],
      validUntil: r[10], status: r[11]
    });
  }
  return {rows: result};
}

// ─── Google Drive 견적서 저장 ───
function handleSaveQuote(data) {
  const html = data.html || '';
  const filename = (data.filename || 'quote').replace(/[\/\\:*?"<>|]/g, '_');

  // 최상위 폴더 확보
  const folderName = '재현테크_견적서';
  const folderIter = DriveApp.getFoldersByName(folderName);
  const folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder(folderName);

  // 년월 서브폴더
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const subIter = folder.getFoldersByName(ym);
  const subFolder = subIter.hasNext() ? subIter.next() : folder.createFolder(ym);

  // HTML 파일 생성 및 공유 설정
  const blob = Utilities.newBlob(html, 'text/html', filename + '.html');
  const file = subFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResponse({status: 'ok', url: file.getUrl(), name: file.getName(), folderId: subFolder.getId()});
}

// ─── 유틸 ───
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeParseJSON(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}
