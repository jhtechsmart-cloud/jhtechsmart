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

/* 시트 셀이 Date 객체(시트 자동 형식 인식 결과)면 JSON 직렬화 시 UTC ISO 문자열로
   변환되어 화면에 잘못 표시됨. 클라이언트로 보내기 전 KST로 포매팅한 문자열로 통일. */
function _fmtKstDateTime(v){
  if(v === '' || v === null || v === undefined) return '';
  // 이미 yyyy-MM-dd HH:mm 형식 문자열이면 그대로 (재포매팅 시 잘못 해석 방지)
  if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !v.includes('T')) return v;
  try { return Utilities.formatDate(new Date(v), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
  catch(e) { return String(v); }
}
function _fmtKstDate(v){
  if(v === '' || v === null || v === undefined) return '';
  if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  try { return Utilities.formatDate(new Date(v), 'Asia/Seoul', 'yyyy-MM-dd'); }
  catch(e) { return String(v); }
}

// ═══════════════════════════════════════════════════════════════════
// 통합정보 시트 — 신청 + 견적 + 가이드/메일 + Notion sync 메타 (Phase 1)
// 신청관리·견적서발급관리에 행이 들어오면 통합정보 시트의 같은 접수번호 행을
// 자동으로 upsert. 접수번호가 매칭 키.
// ═══════════════════════════════════════════════════════════════════

const UNIFIED_SHEET_NAME = '통합정보';

const UNIFIED_HEADERS = [
  // 신청 그룹 (21) — 신청관리와 동일
  '접수번호','접수일시','업체명','사업자번호','대표자','연락처','이메일','주소',
  '사업자등록일','주업종','매출2023','매출2024','매출2025',
  '문제공정','도입목적','선택문제목표','선택장비','요청사항','상태','담당자','공정흐름도',
  // 견적 그룹 (10) — 견적서발급관리 중복 제외 + 버전 메타
  '견적번호','발급일시','포함옵션','추가옵션(JSON)','공급가액','부가세','합계','유효기간',
  'version','isLatest',
  // 가이드/메일 그룹 (6) — Phase 2~4에서 사용
  '가이드_생성일시','가이드_HTML_URL','가이드_발송요청','가이드_발송일시','가이드_발송상태','가이드_에러',
  // Notion sync 메타 (2) — Phase 5에서 사용
  'Notion_PageID','최종푸시일시',
  // PDF URL (2) — Phase 2 추가. 항상 헤더 끝에 두어 기존 시트 끝에 자동 append 되도록
  '견적PDF_URL','장비사진PDF_URL',
  // 가이드 버전 메타 (1) — Phase 3 추가. 가이드가 생성된 시점의 견적 version 추적 (멱등성 강화)
  '가이드_version'
];

// 헤더명 → 컬럼 인덱스(0-based) 매핑
const UNIFIED_COL = (() => {
  const m = {};
  UNIFIED_HEADERS.forEach((h, i) => { m[h] = i; });
  return m;
})();

/* 견적번호 끝의 -vN을 정수로 추출. 없으면 0 (v1 미만으로 간주). */
function _extractVersionFromQuoteNo(quoteNo) {
  if (!quoteNo) return 0;
  const m = String(quoteNo).match(/-v(\d+)$/i);
  if (m) return Number(m[1]);
  // 레거시 -R01 / -R00 형식도 변환 — admin.html의 getVersionLabel과 동일 규칙
  const r = String(quoteNo).match(/-R(\d+)$/i);
  if (r) return Number(r[1]) + 1;
  return 1; // -v 접미 없음 → v1으로 간주
}

/* 통합정보 시트 핸들 — 없으면 생성, 헤더 누락 시 보강. */
function _getUnifiedSheet() {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  let sheet = ss.getSheetByName(UNIFIED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNIFIED_SHEET_NAME);
    sheet.appendRow(UNIFIED_HEADERS);
    sheet.getRange(1, 1, 1, UNIFIED_HEADERS.length).setFontWeight('bold').setBackground('#f3f7fb');
    sheet.setFrozenRows(1);
  } else {
    const lastCol = sheet.getLastColumn();
    // 헤더 누락 시 확장 (멱등) — 기존 데이터는 그대로 두고 헤더만 보강
    if (lastCol < UNIFIED_HEADERS.length) {
      const cur = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const merged = UNIFIED_HEADERS.map((h, i) => (i < cur.length && cur[i]) ? cur[i] : h);
      sheet.getRange(1, 1, 1, merged.length).setValues([merged]);
      sheet.getRange(1, 1, 1, merged.length).setFontWeight('bold').setBackground('#f3f7fb');
    }
  }
  return sheet;
}

/* 통합정보 upsert — 접수번호로 행 찾기 → INSERT 또는 UPDATE.
   requestData: 신청 객체 (handleSubmit의 p 또는 handleConfirm의 data)
     필드: id/bizNo/company/ceo/phone/email/address/foundDate/industry/
           rev2023~2025/problemProcess/adoptionType/issues/equipment/
           equipRequest/status/assignee/processFlow
   quoteData: 견적 객체 (handleConfirm의 data) — null이면 견적 컬럼 미변경
     필드: quoteNo/supplyPrice/taxPrice/totalPrice/validUntil/
           includeOpts/extraOpts/status
   동일 접수번호에 quoteData가 다시 들어오면 version 비교 후 최신 버전 값으로 overwrite. */
function upsertUnified(reqId, requestData, quoteData) {
  if (!reqId) return;
  const sheet = _getUnifiedSheet();
  const lastRow = sheet.getLastRow();

  // 기존 행 찾기 (접수번호 = 컬럼1)
  let targetRow = -1;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(reqId)) { targetRow = i + 2; break; }
    }
  }

  // 행 데이터 초기화 (기존 행이면 읽어와서 업데이트할 필드만 교체)
  let rowData;
  if (targetRow > 0) {
    rowData = sheet.getRange(targetRow, 1, 1, UNIFIED_HEADERS.length).getValues()[0];
    while (rowData.length < UNIFIED_HEADERS.length) rowData.push('');
  } else {
    rowData = new Array(UNIFIED_HEADERS.length).fill('');
    rowData[UNIFIED_COL['접수번호']] = reqId;
  }

  // 신청 필드 — 빈 값으로 덮어쓰지 않음 (수정 보호)
  if (requestData) {
    const reqMap = {
      '접수번호': requestData.id || reqId,
      '접수일시': requestData.submittedAt,
      '업체명': requestData.company,
      '사업자번호': requestData.bizNo,
      '대표자': requestData.ceo,
      '연락처': requestData.phone,
      '이메일': requestData.email,
      '주소': requestData.address,
      '사업자등록일': requestData.foundDate,
      '주업종': requestData.industry,
      '매출2023': requestData.rev2023,
      '매출2024': requestData.rev2024,
      '매출2025': requestData.rev2025,
      '문제공정': requestData.problemProcess,
      '도입목적': requestData.adoptionType,
      '선택문제목표': requestData.issues,
      '선택장비': requestData.equipment,
      '요청사항': requestData.equipRequest,
      '상태': requestData.status,
      '담당자': requestData.assignee,
      '공정흐름도': requestData.processFlow
    };
    Object.keys(reqMap).forEach(k => {
      const v = reqMap[k];
      if (v !== undefined && v !== null && v !== '') {
        rowData[UNIFIED_COL[k]] = v;
      }
    });
  }

  // 견적 필드 — 버전 비교 후 최신 버전만 반영 (멱등성·다운그레이드 방지)
  if (quoteData && quoteData.quoteNo) {
    const curVersion = Number(rowData[UNIFIED_COL['version']] || 0);
    const newVersion = _extractVersionFromQuoteNo(quoteData.quoteNo);
    if (newVersion >= curVersion) {
      const inc = Array.isArray(quoteData.includeOpts)
        ? quoteData.includeOpts.join(' | ')
        : (quoteData.includeOpts || '');
      const ext = typeof quoteData.extraOpts === 'string'
        ? quoteData.extraOpts
        : JSON.stringify(quoteData.extraOpts || []);
      const issuedAt = quoteData.issuedAt || _fmtKstDateTime(new Date());
      const qMap = {
        '견적번호': quoteData.quoteNo,
        '발급일시': issuedAt,
        '포함옵션': inc,
        '추가옵션(JSON)': ext,
        '공급가액': quoteData.supplyPrice,
        '부가세': quoteData.taxPrice,
        '합계': quoteData.totalPrice,
        '유효기간': quoteData.validUntil,
        'version': newVersion,
        'isLatest': '1'
      };
      Object.keys(qMap).forEach(k => {
        const v = qMap[k];
        if (v !== undefined && v !== null) {
          rowData[UNIFIED_COL[k]] = v;
        }
      });
      // 견적 확정 시 상태도 동기화 (신청 상태 확정 반영)
      if (quoteData.status) rowData[UNIFIED_COL['상태']] = quoteData.status;
    }
  }

  // 시트 반영
  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, UNIFIED_HEADERS.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  // Phase 5: Notion 즉시 push (실패해도 시트 update 자체는 성공)
  _safePushToNotion(reqId);
}

/* 운영 환경 기존 데이터 1회 마이그레이션 — 신청관리·견적서발급관리에 이미 있는 데이터를
   통합정보 시트에 backfill. GAS 에디터에서 수동 실행. 멱등(접수번호 기준 upsert). */
function backfillUnified() {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const s1 = ss.getSheetByName('신청관리');
  const s2 = ss.getSheetByName('견적서발급관리');
  if (!s1) { Logger.log('신청관리 시트 없음'); return; }

  // 견적 인덱스: 접수번호 → 최신 버전 견적 객체
  const quoteByReq = {};
  if (s2 && s2.getLastRow() > 1) {
    const qRows = s2.getDataRange().getValues();
    for (let i = 1; i < qRows.length; i++) {
      const r = qRows[i];
      const reqId = r[1];
      if (!reqId) continue;
      const quoteNo = r[0];
      const ver = _extractVersionFromQuoteNo(quoteNo);
      const prev = quoteByReq[reqId];
      if (!prev || ver >= prev._ver) {
        quoteByReq[reqId] = {
          quoteNo: quoteNo, reqId: reqId,
          issuedAt: _fmtKstDateTime(r[2]),
          company: r[3], equipment: r[4],
          includeOpts: r[5] ? String(r[5]).split(' | ') : [],
          extraOpts: safeParseJSON(r[6]),
          supplyPrice: r[7], taxPrice: r[8], totalPrice: r[9],
          validUntil: _fmtKstDate(r[10]),
          status: r[11], assignee: r[12],
          _ver: ver
        };
      }
    }
  }

  const aRows = s1.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < aRows.length; i++) {
    const r = aRows[i];
    const reqId = r[0];
    if (!reqId) continue;
    const reqObj = {
      id: reqId, submittedAt: _fmtKstDateTime(r[1]),
      company: r[2], bizNo: r[3], ceo: r[4], phone: r[5], email: r[6], address: r[7],
      foundDate: _fmtKstDate(r[8]), industry: r[9],
      rev2023: r[10], rev2024: r[11], rev2025: r[12],
      problemProcess: r[13], adoptionType: r[14], issues: r[15],
      equipment: r[16], equipRequest: r[17],
      status: r[18] || 'new', assignee: r[19], processFlow: r[20]
    };
    upsertUnified(reqId, reqObj, quoteByReq[reqId] || null);
    count++;
  }
  Logger.log('backfillUnified: ' + count + '개 행 처리 완료');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — 이메일 본문 자동 생성 + Drive 저장 + 발송 큐 등록
// 견적 PDF + 장비사진 PDF가 모두 Drive에 저장된 시점에 자동 호출됨.
// 본문 HTML은 jaehyun_tech_guide_fixed.html 템플릿의 5 PART(자기소개~마무리)
// 영역만 GPT 응답으로 치환(Phase 2는 placeholder). 나머지 정적 부분은 원본 그대로.
// ═══════════════════════════════════════════════════════════════════

/* Script Properties 조회 — 누락 시 명확한 에러 메시지로 즉시 fail-fast */
function _guideProp(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Script Property "' + key + '" 미설정. Apps Script ⚙ 프로젝트 설정 → 스크립트 속성에서 추가하세요.');
  return v;
}

/* 통합정보 시트에서 접수번호로 한 행 읽어 객체로 반환.
   헤더 기준 dynamic 매핑 — UNIFIED_HEADERS 순서가 바뀌어도 동작.
   결과 객체 키 = 헤더 이름, 값 = 셀 값. __row에 시트 행 번호도 포함. */
function _readUnifiedRow(reqId) {
  if (!reqId) return null;
  const sheet = _getUnifiedSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return null;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const reqIdCol = headers.indexOf('접수번호');
  if (reqIdCol < 0) return null;
  const ids = sheet.getRange(2, reqIdCol + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(reqId)) {
      const rowValues = sheet.getRange(i + 2, 1, 1, lastCol).getValues()[0];
      const obj = {};
      headers.forEach((h, idx) => { if (h) obj[h] = rowValues[idx]; });
      obj.__row = i + 2;
      return obj;
    }
  }
  return null;
}

/* 통합정보 시트의 단일 필드 update — 헤더 이름으로 컬럼 위치 dynamic 조회. */
function _updateUnifiedField(reqId, columnName, value) {
  return _updateUnifiedFields(reqId, _kv(columnName, value));
}
function _kv(k, v) { const o = {}; o[k] = v; return o; }

/* 통합정보 시트의 여러 필드 동시 update. */
function _updateUnifiedFields(reqId, fields) {
  if (!reqId || !fields) return false;
  const sheet = _getUnifiedSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return false;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const reqIdCol = headers.indexOf('접수번호');
  if (reqIdCol < 0) return false;
  const ids = sheet.getRange(2, reqIdCol + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(reqId)) {
      const targetRow = i + 2;
      Object.keys(fields).forEach(k => {
        const colIdx = headers.indexOf(k);
        if (colIdx >= 0) sheet.getRange(targetRow, colIdx + 1).setValue(fields[k]);
        else Logger.log('_updateUnifiedFields: 컬럼 "' + k + '" 없음 — skip');
      });
      return true;
    }
  }
  return false;
}

/* 이메일 템플릿 로드 — GUIDE_TEMPLATE_FILE_ID에서 Drive HTML fetch + 5분 캐시 + 5 마커 검증.
   마커 형식: <!-- 1. 자기소개 -->, <!-- 2. xxx -->, ... <!-- 5. 마무리 --> */
const GUIDE_TEMPLATE_CACHE_KEY = 'jhtech_guide_template_v1';
const GUIDE_TEMPLATE_CACHE_SEC = 300;

function loadEmailTemplate() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(GUIDE_TEMPLATE_CACHE_KEY);
  if (cached) return cached;
  const fileId = _guideProp('GUIDE_TEMPLATE_FILE_ID');
  const file = DriveApp.getFileById(fileId);
  const html = file.getBlob().getDataAsString('UTF-8');
  // 5 PART 마커 존재 검증
  for (let i = 1; i <= 5; i++) {
    const re = new RegExp('<!--\\s*' + i + '\\.\\s+[^>]*-->', 'i');
    if (!re.test(html)) {
      throw new Error('Template missing PART ' + i + ' marker. 예상 형식: "<!-- ' + i + '. 제목 -->"');
    }
  }
  // 캐시 크기 한도 (~100KB) — 템플릿이 그보다 크면 캐시 안 함
  if (html.length < 100000) {
    cache.put(GUIDE_TEMPLATE_CACHE_KEY, html, GUIDE_TEMPLATE_CACHE_SEC);
  }
  return html;
}

/* GPT 응답(markdown) 5 PART 파싱. Phase 3에서 callOpenAI 결과를 이걸로 처리.
   예상 입력 형식:
     ## PART 1 · 자기소개 및 필수 문구 (10초)
     본문 줄...
     ## PART 2 · ...
   결과: {part1, part2, part3, part4, part5} — 본문 텍스트

   구현 메모: `split + capture group` 방식. JavaScript 정규식엔 `\Z` 미지원이라
   기존 lookahead `(?=...|\Z)` 패턴이 마지막 PART를 못 잡았음. split이 더 안전·간단. */
function parseGuideScript(rawMarkdown) {
  const empty = {part1:'', part2:'', part3:'', part4:'', part5:''};
  if (!rawMarkdown) return empty;
  const text = String(rawMarkdown).trim();
  // ## PART (\d+) 헤더로 split — capture group 덕분에 split 결과에 PART 번호도 포함됨.
  // 결과 형태: [before_first_header, '1', body1, '2', body2, ..., '5', body5]
  const tokens = text.split(/##\s*PART\s*(\d+)[^\n]*\n?/);
  const out = Object.assign({}, empty);
  for (let i = 1; i < tokens.length; i += 2) {
    const n = Number(tokens[i]);
    const body = String(tokens[i + 1] || '').trim();
    if (n >= 1 && n <= 5) out['part' + n] = body;
  }
  return out;
}

/* 텍스트를 메일 본문용 HTML로 안전 변환.
   - HTML escape (& < >)
   - **bold** → <strong> (PART 3 강조 유지)
   - \n → <br>
   - 큰따옴표(") 보존 */
function _formatGuidePartHtml(text) {
  if (!text) return '';
  let s = String(text);
  // HTML escape — & 먼저
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // **bold** → <strong>
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong style="color:#8b4543">$1</strong>');
  // 줄바꿈 정리 → <br>
  s = s.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  return s;
}

/* 템플릿의 5 PART 본문 영역을 GPT 응답 내용으로 교체.
   마커 <!-- N. xxx --> 직후 가장 가까운 <div style="background-color:#f9f5ed;...">...</div>
   내부 content를 교체. style(border-left 색 포함)은 보존 — PART 3은 #8b4543(빨강) 유지. */
function mergeGuideTemplate(templateHtml, parts5) {
  let html = String(templateHtml);
  for (let n = 1; n <= 5; n++) {
    const partKey = 'part' + n;
    if (!parts5 || parts5[partKey] === undefined) continue;
    const bodyHtml = _formatGuidePartHtml(parts5[partKey]);
    // 마커 찾기
    const markerRe = new RegExp('<!--\\s*' + n + '\\.\\s+[^>]*-->', 'i');
    const markerMatch = markerRe.exec(html);
    if (!markerMatch) {
      Logger.log('mergeGuideTemplate: PART ' + n + ' 마커 못 찾음 — skip');
      continue;
    }
    const markerEnd = markerMatch.index + markerMatch[0].length;
    // 마커 뒤에서 background-color:#f9f5ed div 찾기 (가장 가까운 것)
    const after = html.substring(markerEnd);
    const divRe = /<div\s+style="(background-color:#f9f5ed;[^"]*)"[^>]*>([\s\S]*?)<\/div>/i;
    const divMatch = divRe.exec(after);
    if (!divMatch) {
      Logger.log('mergeGuideTemplate: PART ' + n + ' 본문 div 못 찾음 — skip');
      continue;
    }
    const divStart = markerEnd + divMatch.index;
    const divEnd = divStart + divMatch[0].length;
    const preservedStyle = divMatch[1];
    const newDiv = '<div style="' + preservedStyle + '">' + bodyHtml + '</div>';
    html = html.substring(0, divStart) + newDiv + html.substring(divEnd);
  }
  return html;
}

/* 회사별 가이드 HTML을 Drive 폴더(GUIDE_DRIVE_FOLDER_ID)에 저장 + ANYONE_WITH_LINK VIEW.
   파일명: {회사명}_가이드메일_{YYYYMMDD-HHmm}_v{N}.html */
function saveGuideHtmlToDrive(html, company, reqId, version) {
  const folderId = _guideProp('GUIDE_DRIVE_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const safeCompany = String(company || 'unknown').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmm');
  const vLabel = version ? 'v' + version : 'v1';
  const filename = safeCompany + '_가이드메일_' + stamp + '_' + vLabel + '.html';
  const blob = Utilities.newBlob(html, 'text/html', filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {fileId: file.getId(), url: file.getUrl(), name: filename};
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — OpenAI API 호출로 동영상 촬영 가이드 5 PART 생성
// PART 1 (10초): 자기소개 + 부정수급 동의 필수 문구
// PART 2 (15초): 대표 제품 및 공정 소개
// PART 3 (30초, 핵심): 현 공정의 문제점 및 도입 장비
// PART 4 (20초): 설치 장소 및 기대효과
// PART 5 (5초): 마무리
// ═══════════════════════════════════════════════════════════════════

/* GPT system prompt — 카메라 앞 사장님 1인칭 톤 + 5 PART markdown 형식 강제.
   응답 형식: ## PART N · 제목 \n 본문 \n ## PART (N+1) · ...
   개선 이력: 24차에 AI 클리셰 제거 + 장비명 한국어 도입 강제 + PART별 input 매핑 명시. */
const GUIDE_SYSTEM_PROMPT = [
  '당신은 (주)재현테크가 신청서를 작성한 소공인 사장님 본인이 되어, 카메라 앞에서 직접 말하는 1인칭 동영상 스크립트를 작성합니다.',
  '발표문이 아니라, 사장님이 자기 회사·자기 공장 얘기를 자연스럽게 풀어내는 어투여야 합니다.',
  '',
  '【출력 형식 — 반드시 마크다운으로】',
  '',
  '## PART 1 · 자기소개 및 필수 문구 (10초, 약 90~110자)',
  '본문...',
  '',
  '## PART 2 · 대표 제품 및 공정 소개 (15초, 약 140~170자)',
  '본문...',
  '',
  '## PART 3 · 현 공정의 문제점 및 도입 장비 (30초, 약 280~340자)',
  '본문...',
  '',
  '## PART 4 · 설치 장소 및 기대효과 (20초, 약 190~230자)',
  '본문...',
  '',
  '## PART 5 · 간단한 마무리 (5초, 약 40~60자)',
  '본문...',
  '',
  '【PART별 input 활용 지침】',
  '- PART 1: input.company / input.ceo로 자기소개. 인사말은 "안녕하십니까"로 시작 ("안녕하세요" 금지 — 정부 제출용 격식체). "안녕하십니까, ○○대표이사 ○○○입니다" 식의 평범한 한 줄짜리 인사가 아니라 "저는 ○○에서 ○년째 ~를 만들고 있는 ○○○입니다" 같이 자기 일에 대한 자부심이 묻어나는 자기소개로 풀어쓸 것. 마지막에 반드시 정확히 다음 문구를 그대로 넣을 것: "부정수급을 하지 않을 것이며, 부정수급 발생 시 보조금 환수 및 제재처분에 동의합니다."',
  '- PART 2: input.industry 값에서 업종 코드(예: "C18", "ETC")와 안내문구(예: " / 지원 기준: 평균매출 2억원 이상")는 잡음이므로 모두 무시하고, 실제 업종명 부분만 추출해 자연스러운 한국어로 풀어 사용 (예: "C18 인쇄 및 기록매체 복제업 / 지원 기준: 평균매출 2억원 이상" → "인쇄·기록매체 복제업"). 추출한 업종을 바탕으로 어떤 제품을 누구에게 어떻게 만드는지 구체적으로 묘사하고 공정의 흐름을 한두 마디로 시각적으로 보여주기.',
  '- PART 3 (핵심 — 현 문제 + 도입 장비 "호명"까지만 다룬다. 도입 후 효과/변화/기대는 절대 다루지 말고 PART 4에 양보할 것): input.problemProcess와 input.issues를 반드시 구체적으로 인용. input.issues는 파이프 기호(|)로 구분된 여러 항목이 들어올 수 있다 (예: "납기 지연|불량률 증가|주야간 가동률 차이"). 파이프 기호를 절대 그대로 노출하지 말고 각 항목을 별도 절·문장으로 풀어 자연스럽게 연결할 것. 현재의 불편을 생생하고 구체적으로 묘사할 것 — 좋은 예: "지금은 ~를 직원이 일일이 손으로 합니다", "현재 인쇄기 1대로 소량 주문과 대량 주문을 같은 라인에서 처리하다 보니 ~". 그 다음 도입할 장비를 호명. 호명은 다음 규칙을 모두 지킬 것: (a) input.equipment의 영문 모델명(예: "XTRA OR16", "PACK-LINE 2200", "JU1810+")을 어떠한 형태로도 노출하지 말 것. (b) 반드시 한국어 카테고리 명을 1회 이상 명시적으로 등장시킬 것. 카테고리 매핑 — 프린터/인쇄기 계열: "인쇄공정 자동화 설비", 소형 커팅기: "소형 소재 정밀 커팅 설비", 중형 커팅기: "중형 소재 커팅 설비", CNC/가공기 계열: "정밀 가공 설비", 사출기: "자동 사출 성형 설비", 포장기: "포장 공정 자동화 설비", 측정/검사기: "정밀 측정 검사 설비". (c) "신규 장비", "이 장비", "본 설비", "이번 장비", "새 장비" 같이 카테고리 없이 두루뭉술 호명 금지. (d) input.equipment에 콤마로 여러 장비가 있으면 각각을 한국어 카테고리 명으로 모두 등장시킬 것 (생략 금지). (e) PART 3 마지막에 "~ 큰 도움이 될 것입니다", "~ 문제를 해결해 줄 것입니다", "~ 효율을 높여줄 것입니다" 같은 도입 후 효과·기대 표현 일체 금지. 장비 호명 직후 PART 3는 끝.',
  '- PART 4 (설치 장소 + 기대효과 — 도입 후 변화·효과를 메인으로 다루는 PART): 설치 장소는 영상에서 화자가 카메라 앞에서 직접 손짓으로 가리키는 연출을 가정해 "(손으로 가리키며) 이쪽 공간에 설치될 예정이며…" 같은 카메라 액션 지시문을 자연스럽게 한 번 포함할 것. 평수·면적·치수 등의 수치는 절대 언급하지 말고, 전원·환경 조건 같은 행정 정보도 노출 금지. 이 PART의 메인은 도입 후 달라지는 모습이다 — input.adoptionType과 input.issues에 근거한 구체적 변화(작업시간 단축, 야간 무인 가공, 불량률 감소, 납기 단축, 신규 주문 수용 등)를 충분한 분량으로 풀어쓸 것. 같은 효과를 PART 3과 똑같은 표현으로 반복하지 말고(예: PART 3에서 "긴급 납품 대응 가능"이라고 했으면 PART 4에서는 "당일 들어온 주문도 그날 저녁 출고가 가능해집니다" 식으로 시간 단위·생산 단위·일상 변화의 각도로 다르게 묘사). 일반론 금지.',
  '- PART 5: 정부 지원에 대한 짧고 진심 어린 한마디. 클리셰("도약", "성장의 발판") 금지.',
  '',
  '【어조 규칙 — 정부 제출용 격식체】',
  '- 모든 종결은 "-다"체 격식 종결만 사용: ~입니다 / ~합니다 / ~했습니다 / ~겠습니다 / ~드립니다 / ~없습니다 / ~있습니다 등. "-요"로 끝나는 모든 종결(~해요, ~예요, ~에요, ~네요, ~죠, ~지요, ~군요 등) 절대 사용 금지. 인사말 "안녕하세요"도 "안녕하십니까"로',
  '- 격식체를 지키되 발표문처럼 딱딱하지 않게, 자기 일에 대한 자부심과 진심이 묻어나는 어조로. 정부 담당자가 보는 영상이라는 점을 의식한 공손함 유지',
  '- 다음 단어/표현은 절대 사용 금지: "혁신적", "최첨단", "극대화", "도약", "도약하", "성장의 발판", "성장", "발전", "한 단계 발전", "한 단계 더", "한 단계 더 나아", "더 나아가", "나아갈", "나아갑니다", "나아가겠습니다", "스마트화", "디지털 전환", "패러다임", "비전", "미래를 향해", "효율성을 높여". 성장·발전·도약·나아감 류의 추상적 미래 비유는 위 단어 외 변형도 일체 금지. 정부 지원에 대한 감사는 "감사드립니다", "큰 힘이 되겠습니다", "잘 활용하겠습니다" 같은 직접 표현으로만 한정',
  '- input JSON에 명시되지 않은 구체 사실(회사 연차·창업 연도·직원 수·매출 액수·거래처 수·위치·수상 이력 등)은 절대 만들어내지 말 것. 예: input에 "10년째" 같은 정보가 없는데 임의로 "○○년째"라고 쓰면 안 됨. 회사·대표자 정체성은 input.company / input.ceo / input.industry / input.equipment / input.problemProcess / input.issues / input.adoptionType / input.equipRequest에 있는 정보 + 그로부터 자연스럽게 파생 가능한 묘사만 사용',
  '- 추상적 효과 대신 구체적 사실로 표현. (나쁜 예: "효율이 좋아집니다" → 좋은 예: "지금 하루 4시간 걸리던 작업이 1시간이면 끝납니다")',
  '- "저희는~", "저희 직원들이~", "제가 직접~" 같은 1인칭을 격식체와 자연스럽게 결합',
  '- 같은 종결어미가 4문장 이상 연속되지 않도록 ~입니다 / ~합니다 / ~했습니다 / ~겠습니다 등을 적절히 분산',
  '',
  '【엄격한 금지 사항】',
  '- "-요"로 끝나는 문장 종결(~해요, ~예요, ~에요, ~네요, ~죠, ~지요, ~군요 등) 일체 금지 — 모두 "-다"체 격식 종결로',
  '- 견적 금액 / 공급가 / 부가세 등 가격 일체 노출 금지',
  '- 영문 모델명(input.equipment의 영문 부분 — 예: "XTRA OR16", "PACK-LINE 2200") 어떠한 형태로도 노출 금지. 한국어 카테고리·기능 설명 문구로만 표현',
  '- 업종 코드(예: "C18", "ETC")와 지원 기준 안내문구(예: "/ 지원 기준: 평균매출 2억원 이상") 노출 금지',
  '- input.issues의 파이프 기호(|) 그대로 노출 금지 (자연어 문장으로 풀어쓸 것)',
  '- 설치 공간의 평수·면적·치수·전원 사양 등 수치 노출 금지',
  '- 대표자명 / 회사명은 input.ceo / input.company를 그대로 사용 (변경·축약 금지)',
  '- 마크다운 헤더(##) 외의 헤더(#, ###) / 리스트(-) / 테이블 사용 금지',
  '- 응답은 위 5 PART 마크다운 본문만. 다른 설명·주석·코드블록 절대 포함하지 말 것'
].join('\n');

/* Few-shot 예시 — system prompt 다음에 user/assistant 페어로 주입.
   모델이 톤·구조·금지 패턴을 모방하도록 유도. CNC 가공업 케이스 (해랑 인쇄와 겹치지 않게).
   환각 없음 / 카테고리 명 등장 / PART 3 끝 효과 누출 없음 / PART 4 다른 각도 효과. */
const GUIDE_FEWSHOT_INPUT = {
  company: '성진정밀가공',
  ceo: '김성진',
  industry: 'C25 금속가공제품 제조업 / 지원 기준: 평균매출 2억원 이상',
  equipment: 'DOOSAN VC630',
  problemProcess: '복합 다축 가공이 필요한 부품을 2번에 나눠 가공',
  adoptionType: '공정 통합',
  issues: '공정 분리로 인한 작업시간 지연·재고정 오차 발생|숙련공 의존도 높아 신규 인력 양성 어려움',
  equipRequest: '기존 머시닝센터 1대 자리에 교체 설치'
};
const GUIDE_FEWSHOT_OUTPUT = [
  '## PART 1 · 자기소개 및 필수 문구 (10초, 약 90~110자)',
  '안녕하십니까, 저는 성진정밀가공을 운영하고 있는 대표 김성진입니다. 저희는 정밀 금속 부품을 가공해 다양한 기계 제조사에 납품하고 있습니다. 부정수급을 하지 않을 것이며, 부정수급 발생 시 보조금 환수 및 제재처분에 동의합니다.',
  '',
  '## PART 2 · 대표 제품 및 공정 소개 (15초, 약 140~170자)',
  '저희 성진정밀가공은 산업기계와 자동화 설비에 들어가는 정밀 금속 부품을 가공합니다. 도면 검토와 소재 준비를 거쳐 머시닝센터에서 절삭 가공한 뒤, 치수 검사 단계까지 사내에서 처리하는 일관 공정으로 작업이 진행됩니다. 한 부품이 들어와 완성품으로 나가기까지의 흐름을 저희 손으로 직접 관리하고 있습니다.',
  '',
  '## PART 3 · 현 공정의 문제점 및 도입 장비 (30초, 약 280~340자)',
  '지금 저희가 가장 어려움을 겪는 부분은 복합 다축 가공이 필요한 부품을 한 번에 끝내지 못하고 두 번에 나눠서 가공해야 한다는 점입니다. 첫 번째 작업이 끝나면 부품을 다시 빼서 방향을 바꿔 고정한 뒤 다음 공정으로 옮겨야 하는데, 이 재고정 과정에서 미세한 오차가 누적되고 작업시간도 함께 늘어집니다. 또한 이런 방식의 세팅은 숙련공이 직접 잡아야 가능하다 보니 신규 직원이 들어와도 곧바로 같은 작업에 투입하기가 어렵습니다. 이런 문제를 해결하기 위해 이번에 도입하는 장비는 정밀 가공 설비입니다.',
  '',
  '## PART 4 · 설치 장소 및 기대효과 (20초, 약 190~230자)',
  '(손으로 가리키며) 이쪽 공간에 설치될 예정이며, 지금까지 사용하던 머시닝센터를 빼낸 자리에 그대로 들어옵니다. 도입 후에는 한 번 고정한 상태에서 가공이 끝나기 때문에 부품 하나당 작업시간이 절반 수준으로 줄어듭니다. 재고정 단계가 사라지면서 치수 오차로 되돌려 보내는 부품도 거의 없어지고, 신규 직원도 저장된 기본 설정값만 불러오면 바로 가공을 시작할 수 있습니다.',
  '',
  '## PART 5 · 간단한 마무리 (5초, 약 40~60자)',
  '이번 지원을 통해 저희가 더 좋은 부품을 만들 수 있도록 잘 활용하겠습니다. 감사드립니다.'
].join('\n');

/* Few-shot 메시지 페어 — callOpenAI / testGuidePrompt 공유.
   system 다음, 실제 user 메시지 직전에 삽입. */
function _guideFewshotMessages() {
  return [
    {role: 'user', content: JSON.stringify(GUIDE_FEWSHOT_INPUT, null, 2)},
    {role: 'assistant', content: GUIDE_FEWSHOT_OUTPUT}
  ];
}

/* OpenAI Chat Completions 호출 — gpt-4o, text 응답 (JSON 응답 아님).
   에러는 throw — 호출 측에서 try-catch로 가이드_에러 컬럼에 기록.

   모델: gpt-4o — 24차에 gpt-4o-mini에서 변경. 환각·지시 위반이 mini에서 반복돼 모델 업그레이드.
   max_tokens: 2500 — 5 PART 각 ~400자(약 300토큰) × 5 = 1500토큰 + 여유 + few-shot.
     명시 안 하면 디폴트로 짧게 잘리는 경우 발생 (실측: PART 2에서 truncation).
   finish_reason 검증 — 'stop' 외의 값(특히 'length')이면 응답이 잘린 것이므로 명확한 에러. */
function callOpenAI(promptInput) {
  const apiKey = _guideProp('OPENAI_API_KEY');
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-4o',
    temperature: 0.85,
    top_p: 0.9,
    frequency_penalty: 0.4,
    presence_penalty: 0.3,
    max_tokens: 2500,
    messages: [{role: 'system', content: GUIDE_SYSTEM_PROMPT}]
      .concat(_guideFewshotMessages())
      .concat([{role: 'user', content: JSON.stringify(promptInput, null, 2)}])
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + apiKey},
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code !== 200) {
    throw new Error('OpenAI HTTP ' + code + ': ' + body.substring(0, 500));
  }
  const json = JSON.parse(body);
  const choice = json && json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (!content) throw new Error('OpenAI 응답에서 content 누락: ' + body.substring(0, 500));
  const finishReason = choice.finish_reason;
  if (finishReason && finishReason !== 'stop') {
    throw new Error('OpenAI 응답이 비정상 종료 (finish_reason=' + finishReason + '). max_tokens 부족 또는 정책 차단 가능성. content 끝부분: ' + String(content).slice(-200));
  }
  return String(content).trim();
}

// ═══════════════════════════════════════════════════════════════════
// 프롬프트 튜닝용 테스트 함수 — 시트/Drive 영향 없음
//   사용법:
//     1. 아래 SAMPLE_CASES 중 하나를 ACTIVE_CASE에서 선택 (또는 새로 추가)
//     2. TEST_SYSTEM_PROMPT 를 직접 수정해서 실험 (GUIDE_SYSTEM_PROMPT 복사 후 수정 추천)
//     3. TUNING 의 temperature 등 파라미터 수정
//     4. GAS 에디터에서 testGuidePrompt 선택 → 실행
//     5. "실행 > 로그 보기" (Ctrl+Enter) 로 응답 + 자동 검증 리포트 확인
//     6. 만족스러우면 TEST_SYSTEM_PROMPT 내용을 GUIDE_SYSTEM_PROMPT 로 옮겨 운영 반영
// ═══════════════════════════════════════════════════════════════════
function testGuidePrompt() {
  // ─── 1. 샘플 input 케이스 (실제 시트 row 흉내 — 자유 편집) ───
  const SAMPLE_CASES = {
    case_정밀가공: {
      company: '(주)대성정밀',
      ceo: '김대성',
      industry: '정밀 기계 부품 가공업',
      equipment: 'XTRA OR16',
      problemProcess: '바이트 교체와 치수 측정을 작업자가 매번 수동으로 진행',
      adoptionType: '공정 자동화',
      issues: '주야간 가동률 차이가 커서 납기 대응이 늦음, 측정 오차로 재작업 발생',
      equipRequest: '기존 라인 끝쪽 5평 공간에 설치 예정, 220V 전원 확보'
    },
    case_식품가공: {
      company: '한울식품',
      ceo: '박정민',
      industry: '반찬류 소포장 식품 가공',
      equipment: 'PACK-LINE 2200',
      problemProcess: '소분과 라벨 부착을 직원 4명이 손으로 처리',
      adoptionType: '포장 자동화',
      issues: '하루 생산량이 직원 컨디션에 따라 들쭉날쭉, HACCP 위생 기준 충족이 빠듯',
      equipRequest: '기존 포장실 옆 신축 공간에 설치, 위생 구역 분리'
    },
    case_사출성형: {
      company: '제이엠플라스틱',
      ceo: '이재민',
      industry: '플라스틱 사출 성형',
      equipment: 'SMART-MOLD 80T',
      problemProcess: '구식 사출기로 사이클 타임 35초, 게이트 자국 후가공 필요',
      adoptionType: '생산성 개선',
      issues: '경쟁사 대비 단가가 높아 신규 수주 어려움, 불량률 3%대',
      equipRequest: '기존 사출기 1기 철거 후 같은 자리에 교체 설치'
    },
    case_haerang_인쇄: {
      company: '해랑',
      ceo: '이한솔',
      industry: '그 외 업종 / 지원 기준: 평균매출 2억원 이상',
      equipment: 'JU1810+',
      problemProcess: '인쇄공정',
      adoptionType: '신규 장비 도입',
      issues: '소량 다품종·맞춤형 디지털 인쇄 수요 대응 불가 → 소량 주문 내재화·수주 경쟁력 향상 목표|긴급 납품 요청(당일·익일) 대응 불가로 고객 이탈 → 납기 대응력 강화·고객 만족도 향상 목표',
      equipRequest: ''
    }
  };
  const ACTIVE_CASE = 'case_haerang_인쇄';  // ← 여기서 케이스 변경
  const TEST_INPUT = SAMPLE_CASES[ACTIVE_CASE];

  // ─── 2. 실험 중인 시스템 프롬프트 ───
  //   기본값은 운영 GUIDE_SYSTEM_PROMPT 를 그대로 씀.
  //   직접 수정하려면 아래 라인을 주석 처리하고 새 배열로 join 한 문자열 할당.
  let TEST_SYSTEM_PROMPT = GUIDE_SYSTEM_PROMPT;
  // 예시 — 프롬프트 부분 교체 실험할 때:
  // TEST_SYSTEM_PROMPT = [
  //   '당신은 ...',
  //   '...'
  // ].join('\n');

  // ─── 3. API 튜닝 옵션 ───
  const TUNING = {
    model: 'gpt-4o',
    temperature: 0.85,
    top_p: 0.9,
    frequency_penalty: 0.4,
    presence_penalty: 0.3,
    max_tokens: 2500,
    useFewshot: true   // ← few-shot 예시 사용 여부 (비교 실험 시 false로 끄기)
  };

  // ─── 호출 ───
  const apiKey = _guideProp('OPENAI_API_KEY');
  const startedAt = new Date();
  const fewshot = TUNING.useFewshot ? _guideFewshotMessages() : [];
  const payload = {
    model: TUNING.model,
    temperature: TUNING.temperature,
    top_p: TUNING.top_p,
    frequency_penalty: TUNING.frequency_penalty,
    presence_penalty: TUNING.presence_penalty,
    max_tokens: TUNING.max_tokens,
    messages: [{role: 'system', content: TEST_SYSTEM_PROMPT}]
      .concat(fewshot)
      .concat([{role: 'user', content: JSON.stringify(TEST_INPUT, null, 2)}])
  };
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + apiKey},
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const elapsedMs = new Date() - startedAt;
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code !== 200) {
    Logger.log('✗ HTTP ' + code + ': ' + body.substring(0, 500));
    return;
  }
  const json = JSON.parse(body);
  const choice = json.choices && json.choices[0];
  const content = (choice && choice.message && choice.message.content) || '';
  const finishReason = choice && choice.finish_reason;
  const usage = json.usage || {};

  // ─── 리포트 출력 ───
  const bar = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  Logger.log(bar);
  Logger.log('▶ CASE: ' + ACTIVE_CASE + '  (' + elapsedMs + 'ms, finish=' + finishReason + ')');
  Logger.log('   tokens: prompt=' + (usage.prompt_tokens || '?') + ', completion=' + (usage.completion_tokens || '?') + ', total=' + (usage.total_tokens || '?'));
  Logger.log('   tuning: T=' + TUNING.temperature + ' top_p=' + TUNING.top_p + ' freq=' + TUNING.frequency_penalty + ' pres=' + TUNING.presence_penalty);
  Logger.log(bar);
  Logger.log('▶ INPUT');
  Logger.log(JSON.stringify(TEST_INPUT, null, 2));
  Logger.log(bar);
  Logger.log('▶ RAW RESPONSE');
  Logger.log(content);
  Logger.log(bar);

  // PART 분리 + 글자수
  Logger.log('▶ PART별 분량 (가이드: 90~110 / 140~170 / 280~340 / 190~230 / 40~60)');
  const targets = [[90,110],[140,170],[280,340],[190,230],[40,60]];
  try {
    const parts = parseGuideScript(content);
    [1,2,3,4,5].forEach(function(n){
      const body = parts['part'+n] || '';
      const len = body.length;
      const tgt = targets[n-1];
      const flag = len === 0 ? '✗ 비어있음' : (len < tgt[0] ? '⚠ 짧음' : (len > tgt[1] ? '⚠ 김' : '✓'));
      const preview = body.replace(/\n/g, ' ').substring(0, 70);
      Logger.log('  PART ' + n + ': ' + len + '자 ' + flag + ' — ' + preview + (body.length > 70 ? '…' : ''));
    });
  } catch (e) {
    Logger.log('  ✗ PART 파싱 실패: ' + e.message);
  }
  Logger.log(bar);

  // 1) 클리셰 금지어 검출 (성장/발전/도약/나아감 류 우회 표현 포함)
  const BANNED = ['혁신적','최첨단','극대화','도약','성장의 발판','성장','발전','한 단계 발전','한 단계 더','더 나아가','나아갈','나아갑니다','나아가겠','스마트화','디지털 전환','패러다임','비전','미래를 향해','효율성을 높여'];
  const hits = BANNED.filter(function(w){ return content.indexOf(w) >= 0; });
  Logger.log('▶ 클리셰 금지어: ' + (hits.length ? '✗ ' + hits.join(', ') : '✓ 없음'));

  // 2) 필수 문구 포함 (PART 1)
  const MANDATORY = '부정수급을 하지 않을 것이며, 부정수급 발생 시 보조금 환수 및 제재처분에 동의합니다.';
  Logger.log('▶ 부정수급 필수 문구: ' + (content.indexOf(MANDATORY) >= 0 ? '✓ 포함' : '✗ 누락'));

  // 3) 영문 모델명 노출 — 새 정책상 0회여야 정상
  //    input.equipment 가 "XTRA OR16, PACK-LINE 2200" 처럼 콤마 결합일 수 있어 split해 각각 확인.
  //    모델명 후보로 인정할 토큰만 추출 (영문/숫자/대시/공백 — 한국어 포함 토큰은 제외).
  const eqRaw = String(TEST_INPUT.equipment || '');
  const eqTokens = eqRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){
    return s && /[A-Za-z]/.test(s) && !/[가-힣]/.test(s);
  });
  if (eqTokens.length === 0) {
    Logger.log('▶ 영문 모델명 노출: (모델명 토큰 없음 — 건너뜀)');
  } else {
    const leaked = eqTokens.filter(function(tok){
      const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(esc, 'i').test(content);
    });
    Logger.log('▶ 영문 모델명 노출: ' + (leaked.length ? '✗ 노출됨 → ' + leaked.join(', ') : '✓ 없음'));
  }

  // 4) 업종 코드 / 지원 기준 안내문구 노출
  const INDUSTRY_NOISE = [/\bC\d{1,2}\b/, /\bETC\b/, /지원\s*기준/, /평균\s*매출/];
  const indNoise = INDUSTRY_NOISE.filter(function(p){ return p.test(content); });
  Logger.log('▶ 업종 잡음 노출: ' + (indNoise.length ? '✗ 의심 패턴 ' + indNoise.length + '개' : '✓ 없음'));

  // 5) 파이프 기호 그대로 노출
  Logger.log('▶ 파이프(|) 노출: ' + (content.indexOf('|') >= 0 ? '✗ 있음' : '✓ 없음'));

  // 6) PART 4 카메라 액션 지시문 포함
  try {
    const part4 = (parseGuideScript(content).part4 || '');
    const hasGesture = /손으로\s*가리키|손짓|이쪽\s*공간|이\s*공간/.test(part4);
    Logger.log('▶ PART 4 카메라 액션: ' + (hasGesture ? '✓ 포함' : '⚠ 누락 — "(손으로 가리키며) 이쪽 공간…" 류 표현 없음'));
  } catch (e) {}

  // 6-2) PART 3 한국어 카테고리 명 등장 여부 + 두루뭉술 호명 검출
  try {
    const part3 = (parseGuideScript(content).part3 || '');
    const CATEGORIES = ['인쇄공정 자동화 설비','소형 소재 정밀 커팅 설비','중형 소재 커팅 설비','정밀 가공 설비','자동 사출 성형 설비','포장 공정 자동화 설비','정밀 측정 검사 설비'];
    const matchedCat = CATEGORIES.filter(function(c){ return part3.indexOf(c) >= 0; });
    Logger.log('▶ PART 3 한국어 카테고리: ' + (matchedCat.length ? '✓ ' + matchedCat.join(', ') : '⚠ 카테고리 명 등장 안 함 — 매핑된 한국어 설비 명 누락'));

    const VAGUE = ['신규 장비','이 장비','본 설비','이번 장비','새 장비','해당 장비','이번에 도입하는 장비'];
    const vagueHits = VAGUE.filter(function(v){ return part3.indexOf(v) >= 0; });
    Logger.log('▶ PART 3 두루뭉술 호명: ' + (vagueHits.length ? '✗ ' + vagueHits.join(', ') + ' (카테고리 명으로 대체 필요)' : '✓ 없음'));

    // PART 3 끝 효과·기대 표현 검출 (PART 4와 중복 방지)
    const part3Tail = part3.slice(-200);
    const EFFECT_TAIL = ['큰 도움이 될','문제를 해결해','효율을 높여','생산성을 높여','대응할 수 있게 됩니','만족도가 향상','경쟁력이 강화'];
    const tailHits = EFFECT_TAIL.filter(function(p){ return part3Tail.indexOf(p) >= 0; });
    Logger.log('▶ PART 3 효과 누출 (PART 4로 가야 할 표현이 PART 3에): ' + (tailHits.length ? '✗ ' + tailHits.join(', ') : '✓ 없음'));
  } catch (e) {}

  // 7) 평수/면적/치수/전압 수치 노출
  const SIZE_PATTERNS = [/\d+\s*평\b/, /\d+\s*(?:m²|㎡|제곱미터)/, /\d+\s*(?:V|볼트)\b/i, /\d+\s*(?:m|미터|cm|mm)\b/];
  const sizeHits = SIZE_PATTERNS.filter(function(p){ return p.test(content); });
  Logger.log('▶ 평수/치수/전압 수치: ' + (sizeHits.length ? '✗ 의심 패턴 ' + sizeHits.length + '개' : '✓ 없음'));

  // 8) "-요" 종결 검출 (정부 제출용 격식체 위반)
  //    문장 끝의 "○요" 패턴 — false positive(주요/필요/요구 등 명사 안의 "요")를 피하려고
  //    "요" 뒤에 문장 종결 기호(. ! ?) 또는 줄바꿈/공백 후 끝이 따라오는 경우만 잡음.
  const yoMatches = content.match(/[가-힣]요(?=[\.\!\?]|\s*$|\n)/gm) || [];
  // 흔히 종결로 쓰이는 형태만 따로 한 번 더 보여줌
  const yoForms = ['해요','예요','에요','네요','지요','죠','군요','는데요','거든요','대요','래요','구요','네요'];
  const yoFormHits = yoForms.filter(function(f){
    return new RegExp('[가-힣]?' + f + '(?=[\\.\\!\\?]|\\s*$|\\n)', 'gm').test(content);
  });
  Logger.log('▶ "-요" 종결: ' + (yoMatches.length ? '✗ ' + yoMatches.length + '회 노출 (예: ' + yoMatches.slice(0, 5).join(', ') + ')' : '✓ 없음') + (yoFormHits.length ? ' / 패턴 매칭: ' + yoFormHits.join(', ') : ''));

  // 9) 가격 노출
  const PRICE_PATTERNS = [/[0-9,]+\s*원/, /부가세/, /공급가/, /견적\s*금액/];
  const priceHits = PRICE_PATTERNS.filter(function(p){ return p.test(content); });
  Logger.log('▶ 가격 노출: ' + (priceHits.length ? '✗ 의심 패턴 ' + priceHits.length + '개' : '✓ 없음'));

  Logger.log(bar);
  Logger.log('✓ 테스트 완료');
  return content;
}

/* 통합정보 행에서 GPT 입력용 핵심 필드만 추출. */
function _buildGuidePromptInput(row) {
  return {
    company: row['업체명'] || '',
    ceo: row['대표자'] || '',
    industry: row['주업종'] || '',
    equipment: row['선택장비'] || '',
    problemProcess: row['문제공정'] || '',
    adoptionType: row['도입목적'] || '',
    issues: row['선택문제목표'] || '',
    equipRequest: row['요청사항'] || ''
  };
}

/* 통합정보 행을 기준으로 가이드 본문 생성 + Drive 저장 + 시트 메타 update.
   Phase 3: callOpenAI 결과를 parseGuideScript로 5 PART 분리 → mergeGuideTemplate → Drive 저장.
   멱등 규칙: 가이드_version === row.version 이면 skip (같은 견적 버전엔 한 번만 생성).
   새 견적 버전(v2, v3 ...) 발급되면 자동으로 새 가이드 생성.
   GPT 호출 실패 시 가이드_에러 컬럼에 메시지 기록 — 다음 호출에서 재시도. */
function _ensureGuideForUnified(row) {
  if (!row || !row['접수번호']) return null;
  const reqId = row['접수번호'];
  const curVersion = Number(row['version'] || 0) || 1;
  const lastGuideVersion = Number(row['가이드_version'] || 0) || 0;
  // 멱등: 같은 견적 version에 가이드가 이미 있으면 skip
  if (row['가이드_HTML_URL'] && lastGuideVersion >= curVersion) {
    Logger.log('_ensureGuideForUnified: 이미 v' + lastGuideVersion + ' 가이드 있음 — ' + reqId);
    return {skipped: true, url: row['가이드_HTML_URL']};
  }
  // GPT 호출 — 실패해도 시트엔 에러 기록 후 throw (handleSaveQuote의 try-catch가 잡음)
  let parts5;
  try {
    const promptInput = _buildGuidePromptInput(row);
    const rawScript = callOpenAI(promptInput);
    parts5 = parseGuideScript(rawScript);
    // 파싱 결과 검증 — 5 PART 모두 본문이 채워졌는지
    for (let i = 1; i <= 5; i++) {
      if (!parts5['part' + i]) {
        throw new Error('GPT 응답에서 PART ' + i + ' 본문이 비어있음. 원본 응답 일부: ' + rawScript.substring(0, 200));
      }
    }
  } catch (e) {
    _updateUnifiedFields(reqId, {
      '가이드_발송상태': '오류',
      '가이드_에러': 'GPT 호출/파싱 실패: ' + (e.message || e)
    });
    throw e;
  }
  // 본문 HTML 생성 + Drive 저장
  const template = loadEmailTemplate();
  const merged = mergeGuideTemplate(template, parts5);
  const saved = saveGuideHtmlToDrive(merged, row['업체명'], reqId, curVersion);
  _updateUnifiedFields(reqId, {
    '가이드_생성일시': Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    '가이드_HTML_URL': saved.url,
    '가이드_version': curVersion,
    '가이드_발송요청': true,
    '가이드_발송상태': '발송대기',
    '가이드_에러': ''
  });
  // Phase 5: 가이드 메타 update 후 노션에 반영
  _safePushToNotion(reqId);
  return {skipped: false, url: saved.url, fileId: saved.fileId, version: curVersion};
}

// ═══════════════════════════════════════════════════════════════════
// Phase 4 — Time-driven 트리거 자동 발송 + Mailer Web App 호출
// 통합정보 시트에서 가이드_발송요청=TRUE 행을 수집해 Mailer Web App(별도 배포)
// 으로 HTTP POST → 그 Web App이 jhtechsmart@gmail.com 계정으로 발송.
// 동시 실행 방지: LockService. 한 번에 최대 30건 처리.
// ═══════════════════════════════════════════════════════════════════

const MAIL_POLL_MAX_PER_TICK = 30;
const MAIL_RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5분 내 중복 발송 차단
const MAIL_POLL_INTERVAL_MIN = 5;              // trigger polling 주기 (분)

/* pollAndSendGuides time-driven 트리거 자동 설정 — 멱등.
   GAS 에디터 함수 드롭다운에서 ▶ 한 번 실행하면 기존 동일 함수 trigger는 모두
   삭제되고 MAIL_POLL_INTERVAL_MIN 분 간격으로 새 trigger 1개가 생성된다.
   trigger 간격 변경 시: MAIL_POLL_INTERVAL_MIN 상수만 수정하고 setupTriggers ▶ 재실행. */
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
  Logger.log('setupTriggers: 기존 pollAndSendGuides trigger ' + removed + '개 삭제 + ' + MAIL_POLL_INTERVAL_MIN + '분 간격 trigger 새로 생성');
}

/* Time-driven 트리거에 등록되는 진입점. setupTriggers ▶ 실행으로 자동 등록됨.
   수동 실행도 가능 — GAS 에디터 함수 드롭다운에서 ▶ 실행. */
function pollAndSendGuides() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('pollAndSendGuides: 이전 실행이 아직 진행 중. skip.');
    return;
  }
  try {
    const sheet = _getUnifiedSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) { Logger.log('pollAndSendGuides: 데이터 없음'); return; }
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    let processed = 0, sent = 0, failed = 0;
    for (let i = 0; i < values.length; i++) {
      if (processed >= MAIL_POLL_MAX_PER_TICK) break;
      const row = {__row: i + 2};
      headers.forEach((h, idx) => { if (h) row[h] = values[i][idx]; });
      // 발송 대상 필터링
      // 발송요청=TRUE가 운영자의 의도 표현 — 발송완료 상태라도 재체크하면 재발송 의도로 봄.
      // 무한 재발송은 아래 5분 cooldown으로 차단되므로 발송상태 체크는 빼야 함 (안 빼면
      // 노션에서 운영자가 발송완료 행에 발송요청 켜도 영원히 안 가는 문제 발생).
      if (!row['가이드_발송요청']) continue;
      if (!row['이메일']) continue;
      if (!row['가이드_HTML_URL']) continue;
      // 5분 내 재발송 방지
      if (row['가이드_발송일시']) {
        try {
          const lastTime = new Date(row['가이드_발송일시']).getTime();
          if (!isNaN(lastTime) && Date.now() - lastTime < MAIL_RESEND_COOLDOWN_MS) {
            Logger.log('pollAndSendGuides: 5분 cooldown — ' + row['접수번호']);
            continue;
          }
        } catch (_) {}
      }
      processed++;
      try {
        sendGuideForRow(row);
        sent++;
      } catch (e) {
        failed++;
        Logger.log('pollAndSendGuides: 발송 실패 — ' + row['접수번호'] + ': ' + e);
        try {
          _updateUnifiedFields(row['접수번호'], {
            '가이드_발송상태': '오류',
            '가이드_에러': '발송 실패: ' + (e.message || e)
          });
        } catch (_) {}
      }
    }
    Logger.log('pollAndSendGuides: 처리 ' + processed + '건 / 성공 ' + sent + ' / 실패 ' + failed);
    // Phase 6: 노션→시트 양방향 sync — 운영자가 노션에서 수정한 6 필드 반영. sync 결과로 발송요청=TRUE가 되면 다음 trigger에서 발송됨
    try { syncFromNotion(); } catch (e) { Logger.log('syncFromNotion 실패 — ' + e); }
    // Phase 5: 10분 보조 노션 sync — push 안 된 행 batch 처리. 폴링과 같은 트리거로 통합 운영.
    try { syncPendingToNotion(); } catch (e) { Logger.log('syncPendingToNotion 실패 — ' + e); }
  } finally {
    lock.releaseLock();
  }
}

/* 한 행 발송 — Drive에서 본문 HTML fetch + 견적/장비사진 PDF를 첨부로 묶어 Mailer 호출. */
function sendGuideForRow(row) {
  if (!row || !row['접수번호']) throw new Error('row 또는 접수번호 누락');
  const to = String(row['이메일'] || '').trim();
  if (!to) throw new Error('이메일 비어있음');
  // 본문 HTML fetch (Drive 가이드 폴더 파일)
  const htmlUrl = row['가이드_HTML_URL'];
  if (!htmlUrl) throw new Error('가이드_HTML_URL 비어있음');
  const html = _fetchDriveHtml(htmlUrl);
  // 첨부: 견적 PDF + 장비사진 PDF (있는 것만)
  const attachments = [];
  if (row['견적PDF_URL']) {
    attachments.push({url: row['견적PDF_URL'], name: _safeFilename(row['업체명'], '_견적서.pdf')});
  }
  if (row['장비사진PDF_URL']) {
    attachments.push({url: row['장비사진PDF_URL'], name: _safeFilename(row['업체명'], '_장비사진.pdf')});
  }
  // 메일 제목 — 회사명만 동적
  const subject = '[(주)재현테크] 견적서 송부 및 동영상 촬영 가이드 · ' + (row['업체명'] || '');
  // Mailer Web App 호출
  const result = callMailer({
    to: to,
    subject: subject,
    htmlBody: html,
    name: '(주)재현테크',
    replyTo: 'smart@paxc.co.kr',
    attachments: attachments
  });
  if (result.status !== 'ok') {
    throw new Error('Mailer 응답 비정상: ' + JSON.stringify(result));
  }
  // 시트 update — 발송 완료
  _updateUnifiedFields(row['접수번호'], {
    '가이드_발송요청': false,
    '가이드_발송상태': '발송완료',
    '가이드_발송일시': result.sentAt || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    '가이드_에러': ''
  });
  // Phase 5: 발송 후 노션 push
  _safePushToNotion(row['접수번호']);
  return result;
}

/* Mailer Web App에 HTTP POST. Content-Type은 application/x-www-form-urlencoded로
   (preflight 회피 패턴) — payload는 data=<json string> 형식. */
function callMailer(payload) {
  const url = _guideProp('MAILER_WEBAPP_URL');
  const token = _guideProp('MAILER_TOKEN');
  const body = Object.assign({}, payload, {token: token});
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {data: JSON.stringify(body)},
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code !== 200) {
    throw new Error('Mailer HTTP ' + code + ': ' + text.substring(0, 500));
  }
  try { return JSON.parse(text); }
  catch (e) { throw new Error('Mailer 응답 JSON 파싱 실패: ' + text.substring(0, 500)); }
}

/* Drive 파일 URL에서 HTML content fetch. file ID 추출 → DriveApp으로 blob. */
function _fetchDriveHtml(url) {
  if (!url) return '';
  const m1 = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = (m1 && m1[1]) || (m2 && m2[1]);
  if (!fileId) throw new Error('Drive URL에서 file ID 추출 실패: ' + url);
  const file = DriveApp.getFileById(fileId);
  return file.getBlob().getDataAsString('UTF-8');
}

/* 파일명 safe 처리 — 회사명에 특수문자 포함 시 _로 치환. */
function _safeFilename(company, suffix) {
  const safe = String(company || 'unknown').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
  return safe + (suffix || '');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5 — Notion DB 단방향 동기화 (시트 → 노션)
// 통합정보 42개 컬럼을 Notion DB로 push. 접수번호로 페이지 upsert.
// 즉시 push (upsertUnified, sendGuideForRow 끝) + 10분 보조 sync (pollAndSendGuides 끝).
// ═══════════════════════════════════════════════════════════════════

const NOTION_API_VERSION = '2022-06-28';

/* 통합정보 컬럼 → Notion 속성 매핑.
   Notion 속성명은 한글 그대로 사용 (사용자 친화).
   skip: true 면 노션에 보내지 않음 (Notion_PageID는 노션 페이지 ID 자체라 의미 없음, 최종푸시일시도 sync 메타). */
const NOTION_PROP_MAP = [
  // 신청 그룹
  {sheet: '업체명',         notion: '업체명',         type: 'title'},
  {sheet: '접수번호',       notion: '접수번호',       type: 'rich_text'},
  {sheet: '접수일시',       notion: '접수일시',       type: 'date'},
  {sheet: '사업자번호',     notion: '사업자번호',     type: 'rich_text'},
  {sheet: '대표자',         notion: '대표자',         type: 'rich_text'},
  {sheet: '연락처',         notion: '연락처',         type: 'phone_number'},
  {sheet: '이메일',         notion: '이메일',         type: 'email'},
  {sheet: '주소',           notion: '주소',           type: 'rich_text'},
  {sheet: '사업자등록일',   notion: '사업자등록일',   type: 'date'},
  {sheet: '주업종',         notion: '주업종',         type: 'rich_text'},
  {sheet: '매출2023',       notion: '매출2023',       type: 'number'},
  {sheet: '매출2024',       notion: '매출2024',       type: 'number'},
  {sheet: '매출2025',       notion: '매출2025',       type: 'number'},
  {sheet: '문제공정',       notion: '문제공정',       type: 'rich_text'},
  {sheet: '도입목적',       notion: '도입목적',       type: 'rich_text'},
  {sheet: '선택문제목표',   notion: '선택문제목표',   type: 'rich_text'},
  {sheet: '선택장비',       notion: '선택장비',       type: 'rich_text'},
  {sheet: '요청사항',       notion: '요청사항',       type: 'rich_text'},
  {sheet: '상태',           notion: '상태',           type: 'select'},
  {sheet: '담당자',         notion: '담당자',         type: 'select'},
  {sheet: '공정흐름도',     notion: '공정흐름도',     type: 'rich_text'},
  // 견적 그룹
  {sheet: '견적번호',       notion: '견적번호',       type: 'rich_text'},
  {sheet: '발급일시',       notion: '발급일시',       type: 'date'},
  {sheet: '포함옵션',       notion: '포함옵션',       type: 'rich_text'},
  {sheet: '추가옵션(JSON)', notion: '추가옵션',       type: 'rich_text'},
  {sheet: '공급가액',       notion: '공급가액',       type: 'number'},
  {sheet: '부가세',         notion: '부가세',         type: 'number'},
  {sheet: '합계',           notion: '합계',           type: 'number'},
  {sheet: '유효기간',       notion: '유효기간',       type: 'date'},
  {sheet: 'version',        notion: '견적_version',   type: 'number'},
  {sheet: 'isLatest',       notion: 'isLatest',       type: 'checkbox'},
  // 가이드/메일 그룹
  {sheet: '가이드_생성일시', notion: '가이드_생성일시', type: 'date'},
  {sheet: '가이드_HTML_URL', notion: '가이드_HTML',    type: 'url'},
  {sheet: '가이드_발송요청', notion: '발송요청',       type: 'checkbox'},
  {sheet: '가이드_발송일시', notion: '메일발송일시',   type: 'date'},
  {sheet: '가이드_발송상태', notion: '발송상태',       type: 'select'},
  {sheet: '가이드_에러',     notion: '발송에러',       type: 'rich_text'},
  // PDF URL
  {sheet: '견적PDF_URL',     notion: '견적PDF',        type: 'url'},
  {sheet: '장비사진PDF_URL', notion: '장비사진PDF',    type: 'url'},
  // 가이드 버전
  {sheet: '가이드_version',  notion: '가이드_version', type: 'number'}
  // Notion_PageID, 최종푸시일시 — sync 메타라 노션에 보내지 않음
];

/* Notion API 호출 wrapper — 인증 + 에러 처리.
   path: '/v1/...' / method: 'GET'|'POST'|'PATCH' / body: object 또는 null */
function _notionFetch(path, method, body) {
  const token = _guideProp('NOTION_TOKEN');
  const url = 'https://api.notion.com' + path;
  const options = {
    method: (method || 'GET').toLowerCase(),
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  if (body) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Notion HTTP ' + code + ': ' + text.substring(0, 500));
  }
  return text ? JSON.parse(text) : null;
}

/* 시트 셀 값을 Notion 속성 value 형식으로 변환. 빈값은 null 반환(빈 속성 update). */
function _toNotionValue(item, raw) {
  const empty = (raw === null || raw === undefined || raw === '');
  switch (item.type) {
    case 'title': {
      return {title: empty ? [] : [{type: 'text', text: {content: String(raw).substring(0, 2000)}}]};
    }
    case 'rich_text': {
      return {rich_text: empty ? [] : [{type: 'text', text: {content: String(raw).substring(0, 2000)}}]};
    }
    case 'number': {
      if (empty) return {number: null};
      const n = Number(String(raw).replace(/,/g, ''));
      return {number: isNaN(n) ? null : n};
    }
    case 'date': {
      if (empty) return {date: null};
      // yyyy-MM-dd 또는 yyyy-MM-dd HH:mm 형식 → Notion ISO 8601
      const s = String(raw);
      const dt = _parseKstToIso(s);
      return {date: dt ? {start: dt} : null};
    }
    case 'select': {
      if (empty) return {select: null};
      return {select: {name: String(raw).substring(0, 100)}};
    }
    case 'checkbox': {
      const v = (raw === true || raw === 'TRUE' || raw === 'true' || raw === 1 || raw === '1');
      return {checkbox: v};
    }
    case 'url': {
      return {url: empty ? null : String(raw)};
    }
    case 'email': {
      return {email: empty ? null : String(raw)};
    }
    case 'phone_number': {
      return {phone_number: empty ? null : String(raw)};
    }
    default:
      return {rich_text: empty ? [] : [{type: 'text', text: {content: String(raw).substring(0, 2000)}}]};
  }
}

/* "yyyy-MM-dd" 또는 "yyyy-MM-dd HH:mm" → ISO 8601(KST 오프셋 포함). */
function _parseKstToIso(s) {
  if (!s) return null;
  const text = String(s).trim();
  // yyyy-MM-dd HH:mm
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':00+09:00';
  // yyyy-MM-dd
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  // 그 외: Date 파싱 시도
  try {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
  } catch (_) {}
  return null;
}

/* 통합정보 row 객체 → Notion properties 객체 변환. */
function _buildNotionProperties(row) {
  const props = {};
  NOTION_PROP_MAP.forEach(item => {
    if (item.skip) return;
    const raw = row[item.sheet];
    props[item.notion] = _toNotionValue(item, raw);
  });
  return props;
}

/* DB 스키마 자동 보강 — NOTION_PROP_MAP에 정의된 속성 중 DB에 없는 것을 추가.
   Title 속성은 첫 번째여야 하므로 이미 있어야 함 (없으면 새 컬럼은 select로 만들 수 없음).
   타입 자동 변경은 하지 않음 — 사용자가 노션에서 의도적으로 바꿨을 수 있음.
   불일치만 경고로 출력해 운영자가 한쪽을 정렬할 수 있게. */
function ensureNotionSchema() {
  const dbId = _guideProp('NOTION_DB_ID');
  const db = _notionFetch('/v1/databases/' + dbId, 'GET');
  const existing = db.properties || {};
  const toAdd = {};
  const mismatches = [];
  NOTION_PROP_MAP.forEach(item => {
    if (item.skip) return;
    if (item.type === 'title') return; // title은 이미 있어야 함
    const existingProp = existing[item.notion];
    if (!existingProp) {
      toAdd[item.notion] = _emptySchemaForType(item.type);
      return;
    }
    // 타입 일치 검사 — 노션 API의 속성 객체는 type 필드를 가짐
    const actualType = existingProp.type;
    if (actualType && actualType !== item.type) {
      mismatches.push(item.notion + ': 코드=' + item.type + ' / 노션=' + actualType);
    }
  });
  if (mismatches.length > 0) {
    Logger.log('⚠ ensureNotionSchema: 타입 불일치 ' + mismatches.length + '건. PATCH 시 validation_error 발생 가능 — 한쪽을 맞춰주세요:');
    mismatches.forEach(m => Logger.log('  ' + m));
  }
  if (Object.keys(toAdd).length === 0) {
    Logger.log('ensureNotionSchema: 모든 속성 이미 존재' + (mismatches.length ? ' (위 불일치 처리 필요)' : ''));
    return;
  }
  _notionFetch('/v1/databases/' + dbId, 'PATCH', {properties: toAdd});
  Logger.log('ensureNotionSchema: ' + Object.keys(toAdd).length + '개 속성 추가됨 → ' + Object.keys(toAdd).join(', '));
}

function _emptySchemaForType(type) {
  switch (type) {
    case 'rich_text':   return {rich_text: {}};
    case 'number':      return {number: {format: 'number'}};
    case 'date':        return {date: {}};
    case 'select':      return {select: {options: []}};
    case 'checkbox':    return {checkbox: {}};
    case 'url':         return {url: {}};
    case 'email':       return {email: {}};
    case 'phone_number':return {phone_number: {}};
    default:            return {rich_text: {}};
  }
}

/* 접수번호 + 사업자번호로 노션 페이지 upsert. 시트의 Notion_PageID 컬럼에 페이지 ID 저장.
   매칭 우선순위:
     1. Notion_PageID 캐시 (시트에 저장됨) → 그대로 PATCH
     2. 노션 query — 접수번호 OR 사업자번호 (둘 중 첫 매칭 페이지)
        · 접수번호 매칭은 같은 신청건 재push 시 안전망
        · 사업자번호 매칭은 운영자가 사전 등록한 페이지에 신청 데이터 자동 병합 (사업자번호=고유키)
     3. 없으면 POST로 새 페이지 생성
   사전 등록 시나리오: 사용자가 노션에 사업자번호만 적힌 페이지를 미리 만들어 두면, 신청이
   들어왔을 때 그 페이지로 자동 병합. 사전 등록 페이지의 상태/담당자/메모 등 운영 메타는
   PATCH가 전송 필드만 update하므로 그대로 보존됨. */
function pushToNotion(reqId) {
  if (!reqId) return null;
  const row = _readUnifiedRow(reqId);
  if (!row) { Logger.log('pushToNotion: 행 없음 — ' + reqId); return null; }
  const dbId = _guideProp('NOTION_DB_ID');
  const properties = _buildNotionProperties(row);
  let pageId = row['Notion_PageID'] || '';
  // pageId 없으면 query로 기존 페이지 검색 (접수번호 OR 사업자번호)
  if (!pageId) {
    try {
      const orFilters = [{property: '접수번호', rich_text: {equals: String(reqId)}}];
      const bizNo = String(row['사업자번호'] || '').trim();
      if (bizNo) orFilters.push({property: '사업자번호', rich_text: {equals: bizNo}});
      const filter = orFilters.length > 1 ? {or: orFilters} : orFilters[0];
      const query = _notionFetch('/v1/databases/' + dbId + '/query', 'POST', {
        filter: filter, page_size: 1
      });
      if (query && query.results && query.results.length > 0) {
        pageId = query.results[0].id;
        Logger.log('pushToNotion: 기존 페이지 매칭 — reqId=' + reqId + ' bizNo=' + bizNo + ' pageId=' + pageId);
      }
    } catch (e) {
      // 접수번호/사업자번호 속성이 없거나 권한 문제 — 새 페이지 생성으로 진행
      Logger.log('pushToNotion: query 실패 (정상 가능 — 첫 push) — ' + e);
    }
  }
  let result;
  if (pageId) {
    // PATCH 갱신
    result = _notionFetch('/v1/pages/' + pageId, 'PATCH', {properties: properties});
  } else {
    // POST 새 페이지
    result = _notionFetch('/v1/pages', 'POST', {
      parent: {database_id: dbId},
      properties: properties
    });
    pageId = result.id;
  }
  // 시트에 페이지 ID + 최종푸시일시 업데이트
  _updateUnifiedFields(reqId, {
    'Notion_PageID': pageId,
    '최종푸시일시': Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
  });
  // Phase 6: push 직후 양방향 6 필드의 현재 hash 저장 — syncFromNotion에서 무한루프 차단 기준
  try {
    const fresh = _readUnifiedRow(reqId);
    if (fresh) {
      const sheetValues = {};
      BIDIRECTIONAL_FIELDS.forEach(k => { sheetValues[k] = fresh[k]; });
      _setStoredHash(reqId, _calcBidirectionalHash(sheetValues));
    }
  } catch (e) { Logger.log('pushToNotion: hash 저장 실패 (sync 무한루프 보호 약화) — ' + e); }
  return result;
}

/* 즉시 push의 안전 wrapper — 예외는 삼키고 로그만. 호출 측 로직(예: upsertUnified)을 막지 않음.
   디버깅을 위해 시트 flush를 먼저 호출(write 반영 보장) + 에러 메시지에 stack 포함. */
function _safePushToNotion(reqId) {
  try {
    SpreadsheetApp.flush(); // upsertUnified/_updateUnifiedFields 직후 호출 시 시트 write 반영 보장
    pushToNotion(reqId);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const stack = e && e.stack ? '\n' + String(e.stack).substring(0, 800) : '';
    Logger.log('[NOTION PUSH FAILED] reqId=' + reqId + ' / ' + msg + stack);
  }
}

/* 보조 동기화 — 통합정보 시트에서 Notion_PageID가 비어있거나 최종푸시일시가 너무 옛날인 행을 push.
   Time-driven 트리거에 등록되거나 pollAndSendGuides 끝에서 호출. 한 번에 최대 20건. */
function syncPendingToNotion() {
  const sheet = _getUnifiedSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const reqIdCol = headers.indexOf('접수번호');
  const pageIdCol = headers.indexOf('Notion_PageID');
  if (reqIdCol < 0 || pageIdCol < 0) return;
  let count = 0;
  const MAX = 20;
  for (let i = 0; i < values.length && count < MAX; i++) {
    const reqId = values[i][reqIdCol];
    const pageId = values[i][pageIdCol];
    if (!reqId) continue;
    if (pageId) continue; // 이미 push됨 — skip (단순 정책: push 안 된 행만 보조 sync)
    _safePushToNotion(reqId);
    count++;
  }
  Logger.log('syncPendingToNotion: ' + count + '건 push');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 6 — 노션 → 시트 양방향 sync (운영자가 노션에서 수정한 6 필드만)
// 매 polling(5~10분)마다 노션 DB에서 last_edited_time > LAST_SYNC_AT 페이지 query.
// 양방향 6 필드를 시트(통합정보 + 신청관리)에 update. hash 비교로 무한루프 방지.
// ═══════════════════════════════════════════════════════════════════

/* 노션→시트로 가져올 양방향 필드 — 시트 컬럼명 기준. */
const BIDIRECTIONAL_FIELDS = ['이메일', '연락처', '상태', '담당자', '가이드_발송요청', '가이드_발송상태'];

/* 통합정보 시트 컬럼 → 신청관리 시트 컬럼 인덱스(1-based) 매핑.
   양방향 필드 중 신청관리에도 존재하는 필드만. 발송요청/발송상태는 신청관리에 없음 — skip. */
const REQUEST_SHEET_COLS = {
  '이메일':   7,   // 신청관리 컬럼 G
  '연락처':   6,   // F
  '상태':    19,   // S
  '담당자':  20    // T
};

/* sync 진입점 — pollAndSendGuides 끝에서 호출. LockService는 pollAndSendGuides가 이미 보유. */
function syncFromNotion() {
  const dbId = _guideProp('NOTION_DB_ID');
  const sinceIso = PropertiesService.getScriptProperties().getProperty('LAST_SYNC_AT') || '';
  const filter = sinceIso ? {
    timestamp: 'last_edited_time',
    last_edited_time: {after: sinceIso}
  } : undefined;
  let pages;
  try {
    pages = _fetchNotionUpdatedPages(dbId, filter);
  } catch (e) {
    Logger.log('[NOTION SYNC] fetch 실패 — ' + e);
    return;
  }
  let applied = 0, skipped = 0;
  const nowIso = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
  pages.forEach(page => {
    try {
      const r = _applyNotionPageToSheet(page);
      if (r && r.applied) applied++;
      else if (r && r.skipped) skipped++;
    } catch (e) {
      Logger.log('[NOTION SYNC] page 적용 실패 — page=' + page.id + ': ' + e);
    }
  });
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC_AT', nowIso);
  Logger.log('syncFromNotion: ' + pages.length + '개 페이지 조회 / 적용 ' + applied + ' / hash 동일 skip ' + skipped);
}

/* 노션 DB query — last_edited_time 기준 페이지 페이지네이션 fetch. 한 번에 최대 50개. */
function _fetchNotionUpdatedPages(dbId, filter) {
  const all = [];
  let cursor = null;
  for (let safety = 0; safety < 10; safety++) {
    const body = {
      page_size: 50,
      sorts: [{timestamp: 'last_edited_time', direction: 'descending'}]
    };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const result = _notionFetch('/v1/databases/' + dbId + '/query', 'POST', body);
    if (result && result.results) all.push.apply(all, result.results);
    if (!result || !result.has_more) break;
    cursor = result.next_cursor;
  }
  return all;
}

/* 노션 페이지 객체에서 양방향 6 필드 값 추출. 빈값은 빈 문자열 또는 false(checkbox). */
function _extractBidirectionalFromNotion(page) {
  const out = {};
  const props = page.properties || {};
  BIDIRECTIONAL_FIELDS.forEach(sheetCol => {
    const item = NOTION_PROP_MAP.find(p => p.sheet === sheetCol);
    if (!item) return;
    const np = props[item.notion];
    if (!np) { out[sheetCol] = ''; return; }
    switch (item.type) {
      case 'title': {
        const arr = np.title || [];
        out[sheetCol] = arr.map(t => t.plain_text || '').join('');
        break;
      }
      case 'rich_text': {
        const arr = np.rich_text || [];
        out[sheetCol] = arr.map(t => t.plain_text || '').join('');
        break;
      }
      case 'select':
        out[sheetCol] = np.select ? np.select.name : '';
        break;
      case 'checkbox':
        out[sheetCol] = !!np.checkbox;
        break;
      case 'email':
        out[sheetCol] = np.email || '';
        break;
      case 'phone_number':
        out[sheetCol] = np.phone_number || '';
        break;
      case 'number':
        out[sheetCol] = (np.number === null || np.number === undefined) ? '' : np.number;
        break;
      case 'date':
        out[sheetCol] = (np.date && np.date.start) ? np.date.start : '';
        break;
      case 'url':
        out[sheetCol] = np.url || '';
        break;
      default:
        out[sheetCol] = '';
    }
  });
  return out;
}

/* 양방향 필드 값 객체 → 정규화된 hash 입력 문자열. */
function _normalizeBidirectionalValues(values) {
  return BIDIRECTIONAL_FIELDS.map(k => {
    const v = values[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v).trim();
  }).join('');
}

function _calcBidirectionalHash(values) {
  const input = _normalizeBidirectionalValues(values);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return bytes.map(b => ('00' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}

function _getStoredHash(reqId) {
  return PropertiesService.getScriptProperties().getProperty('hash_' + reqId) || '';
}
function _setStoredHash(reqId, hash) {
  PropertiesService.getScriptProperties().setProperty('hash_' + reqId, hash);
}

/* 노션 페이지를 시트에 적용. hash 비교로 무한루프 차단. */
function _applyNotionPageToSheet(page) {
  // 접수번호 추출 (rich_text 속성)
  const item = NOTION_PROP_MAP.find(p => p.sheet === '접수번호');
  if (!item) return {skipped: true, reason: 'no req mapping'};
  const reqProp = page.properties && page.properties[item.notion];
  if (!reqProp || !reqProp.rich_text || !reqProp.rich_text.length) return {skipped: true, reason: 'no req in page'};
  const reqId = reqProp.rich_text.map(t => t.plain_text || '').join('').trim();
  if (!reqId) return {skipped: true, reason: 'empty req'};
  // 노션 양방향 값 추출 + hash
  const notionValues = _extractBidirectionalFromNotion(page);
  const notionHash = _calcBidirectionalHash(notionValues);
  const lastHash = _getStoredHash(reqId);
  if (lastHash && lastHash === notionHash) {
    return {skipped: true, reason: 'hash equal'};
  }
  // 시트의 현재 값과도 비교 — 시트가 더 최신(다른 hash)이면 last-write-wins로 노션을 시트값으로 덮어씀
  const row = _readUnifiedRow(reqId);
  if (!row) {
    Logger.log('[NOTION SYNC] 시트에 없는 접수번호 — ' + reqId + ' (페이지 무시)');
    return {skipped: true, reason: 'no sheet row'};
  }
  const sheetValues = {};
  BIDIRECTIONAL_FIELDS.forEach(k => { sheetValues[k] = row[k]; });
  const sheetHash = _calcBidirectionalHash(sheetValues);
  if (sheetHash === notionHash) {
    // 시트와 노션이 우연히 같은 값 — hash 갱신 후 skip
    _setStoredHash(reqId, sheetHash);
    return {skipped: true, reason: 'sheet equal'};
  }
  if (lastHash && lastHash === sheetHash) {
    // 시트는 push 시점 그대로, 노션이 더 새 값 → 시트에 적용
    const updates = {};
    BIDIRECTIONAL_FIELDS.forEach(k => { updates[k] = notionValues[k]; });
    _updateUnifiedFields(reqId, updates);
    // 신청관리 시트에도 동기 (이메일·연락처·상태·담당자)
    Object.keys(REQUEST_SHEET_COLS).forEach(k => {
      if (updates[k] !== undefined) _updateRequestSheetField(reqId, REQUEST_SHEET_COLS[k], updates[k]);
    });
    _setStoredHash(reqId, notionHash);
    return {applied: true};
  }
  // 시트와 노션 모두 옛 hash와 다름 → 시트가 우선 (last-write-wins). 노션을 시트값으로 덮음.
  Logger.log('[NOTION SYNC] last-write-wins 시트 우선 — ' + reqId);
  _setStoredHash(reqId, sheetHash);
  _safePushToNotion(reqId);
  return {applied: false, skipped: true, reason: 'conflict resolved to sheet'};
}

/* 신청관리 시트의 한 컬럼 update — 양방향 필드 중 신청관리에도 존재하는 것에 사용. */
function _updateRequestSheetField(reqId, colIdx1, value) {
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet = ss.getSheetByName('신청관리');
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(reqId)) {
      sheet.getRange(i + 2, colIdx1).setValue(value);
      return;
    }
  }
}

/* 수동 — 특정 접수번호 또는 가장 최근 행을 노션에 강제 push. GAS 에디터에서 디버깅용. */
function manualPushToNotion(reqId) {
  if (!reqId) {
    const sheet = _getUnifiedSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) { Logger.log('manualPushToNotion: 데이터 없음'); return; }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idCol = headers.indexOf('접수번호');
    const verCol = headers.indexOf('발급일시');
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    let latest = null;
    values.forEach(r => {
      const t = r[verCol];
      if (t && (!latest || t > latest._t)) latest = {_t: t, id: r[idCol]};
    });
    if (!latest) { Logger.log('manualPushToNotion: 발급일시 비어있음 — 임의 행 사용'); reqId = values[0][idCol]; }
    else reqId = latest.id;
  }
  const result = pushToNotion(reqId);
  Logger.log('manualPushToNotion: ' + reqId + ' → ' + (result ? result.id || 'PATCH OK' : 'null'));
}

/* 수동 재생성 (옵션) — 견적 정보는 그대로 두고 가이드만 다시 생성하고 싶을 때 사용.
   GAS 에디터 함수 드롭다운에서 reqId 인자 없이 실행하면 가장 최근 발급된 견적의 가이드 재생성.
   특정 reqId 지정 호출도 가능: regenerateGuide('REQ-...') */
function regenerateGuide(reqId) {
  if (!reqId) {
    // 가장 최근 견적 발급된 행 찾기
    const sheet = _getUnifiedSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) { Logger.log('regenerateGuide: 데이터 없음'); return; }
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const verCol = headers.indexOf('발급일시');
    const idCol = headers.indexOf('접수번호');
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    let latest = null;
    values.forEach(r => {
      const t = r[verCol];
      if (t && (!latest || t > latest._t)) latest = {_t: t, id: r[idCol]};
    });
    if (!latest) { Logger.log('regenerateGuide: 발급일시 비어있음'); return; }
    reqId = latest.id;
  }
  const row = _readUnifiedRow(reqId);
  if (!row) { Logger.log('regenerateGuide: 행 없음 — ' + reqId); return; }
  // 멱등 우회 — 가이드_version을 0으로 초기화해 재생성 트리거
  _updateUnifiedField(reqId, '가이드_version', 0);
  row['가이드_version'] = 0;
  const result = _ensureGuideForUnified(row);
  Logger.log('regenerateGuide: ' + reqId + ' → ' + JSON.stringify(result));
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

  // 통합정보 — 신청+견적+가이드/메일+Notion sync 메타 (Phase 1 도입)
  _getUnifiedSheet();
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
    if (action === 'updateRequest')    return handleUpdateRequest(JSON.parse(params.data || '{}'), user);
    if (action === 'resendGuide')      return handleResendGuide(JSON.parse(params.data || '{}'), user);
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

  // 통합정보 시트에도 동일 데이터 자동 복사 (Phase 1). 실패해도 신청 자체는 성공 처리.
  try {
    upsertUnified(id, {
      id: id, submittedAt: now,
      company: p.company, bizNo: p.bizNo, ceo: p.ceo, phone: p.phone, email: p.email,
      address: p.address, foundDate: p.foundDate, industry: p.industry,
      rev2023: p.rev2023, rev2024: p.rev2024, rev2025: p.rev2025,
      problemProcess: p.problemProcess, adoptionType: p.adoptionType, issues: p.issues,
      equipment: p.equipment, equipRequest: p.equipRequest,
      status: 'new', assignee: '', processFlow: p.processFlow
    }, null);
  } catch (e) { Logger.log('upsertUnified(submit) 실패: ' + e); }

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

  // 통합정보 시트 업데이트 (Phase 1). 같은 접수번호 행에 견적 정보 반영.
  // 신청 시점 정보는 시트에서 다시 읽어와 보강 (data엔 일부만 포함).
  try {
    let reqObj = null;
    if (sheet1) {
      const rows1b = sheet1.getDataRange().getValues();
      for (let i = 1; i < rows1b.length; i++) {
        if (rows1b[i][0] === data.id) {
          const r = rows1b[i];
          reqObj = {
            id: r[0], submittedAt: _fmtKstDateTime(r[1]),
            company: r[2], bizNo: r[3], ceo: r[4], phone: r[5], email: r[6], address: r[7],
            foundDate: _fmtKstDate(r[8]), industry: r[9],
            rev2023: r[10], rev2024: r[11], rev2025: r[12],
            problemProcess: r[13], adoptionType: r[14], issues: r[15],
            equipment: r[16], equipRequest: r[17],
            status: data.status || r[18], assignee: r[19], processFlow: r[20]
          };
          break;
        }
      }
    }
    upsertUnified(data.id, reqObj, {
      quoteNo: data.quoteNo,
      issuedAt: rowData[2],  // 위에서 KST 포매팅된 발급일시
      includeOpts: data.includeOpts, extraOpts: data.extraOpts,
      supplyPrice: data.supplyPrice, taxPrice: data.taxPrice, totalPrice: data.totalPrice,
      validUntil: data.validUntil, status: data.status, assignee: assigneeId
    });
  } catch (e) { Logger.log('upsertUnified(confirm) 실패: ' + e); }

  return jsonResponse({status:'ok'});
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7 — admin.html 즉시 발송 + 정보 수정 (이메일/연락처)
// updateRequest: 신청관리 + 통합정보 + 노션 동시 update
// resendGuide: cooldown 우회 즉시 발송. 분당 1회 throttle.
// ═══════════════════════════════════════════════════════════════════

/* admin에서 이메일/연락처 수정. 본인 담당 또는 관리자만 가능.
   data = {id: 'REQ-...', fields: {email: '...', phone: '...'}}
   허용 필드: email, phone만. 그 외 reject (mass-edit 방지). */
function handleUpdateRequest(data, user) {
  if (!data || !data.id) return jsonResponse({status:'error', message:'id 누락'});
  const perm = _checkRequestPermission(data.id, user);
  if (!perm.ok) return perm.error;
  const fields = data.fields || {};
  const allowed = {};
  if (typeof fields.email === 'string') allowed.email = fields.email.trim();
  if (typeof fields.phone === 'string') allowed.phone = fields.phone.trim();
  if (Object.keys(allowed).length === 0) {
    return jsonResponse({status:'error', message:'수정 가능 필드 없음 (email, phone만 허용)'});
  }
  // 이메일 형식 검증 (있을 때만)
  if (allowed.email !== undefined && allowed.email !== '' &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(allowed.email)) {
    return jsonResponse({status:'error', message:'이메일 형식 오류: ' + allowed.email});
  }
  // 신청관리 시트 update
  const ss = SpreadsheetApp.openById(_getSpreadsheetId());
  const sheet1 = ss.getSheetByName('신청관리');
  if (!sheet1) return jsonResponse({status:'error', message:'신청관리 시트 없음'});
  const rows = sheet1.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      if (allowed.email !== undefined) sheet1.getRange(i + 1, 7).setValue(allowed.email);  // G: 이메일
      if (allowed.phone !== undefined) sheet1.getRange(i + 1, 6).setValue(allowed.phone);  // F: 연락처
      found = true;
      break;
    }
  }
  if (!found) return jsonResponse({status:'error', message:'접수번호를 찾을 수 없음: ' + data.id});
  // 통합정보 시트 동시 update
  const unifiedUpdates = {};
  if (allowed.email !== undefined) unifiedUpdates['이메일'] = allowed.email;
  if (allowed.phone !== undefined) unifiedUpdates['연락처'] = allowed.phone;
  _updateUnifiedFields(data.id, unifiedUpdates);
  // 노션 push
  _safePushToNotion(data.id);
  return jsonResponse({status:'ok', updated: allowed});
}

/* admin에서 즉시 메일 발송. cooldown 우회 + 분당 1회 throttle.
   본인 담당 또는 관리자만 가능. 가이드_HTML_URL이 없으면 reject. */
function handleResendGuide(data, user) {
  if (!data || !data.id) return jsonResponse({status:'error', message:'id 누락'});
  const perm = _checkRequestPermission(data.id, user);
  if (!perm.ok) return perm.error;
  // 분당 1회 throttle
  const props = PropertiesService.getScriptProperties();
  const throttleKey = 'resend_throttle_' + data.id;
  const lastTry = Number(props.getProperty(throttleKey) || 0);
  if (lastTry && Date.now() - lastTry < 60 * 1000) {
    const waitSec = Math.ceil((60 * 1000 - (Date.now() - lastTry)) / 1000);
    return jsonResponse({status:'error', code:'THROTTLED', message:'분당 1회만 가능 — ' + waitSec + '초 후 다시 시도'});
  }
  props.setProperty(throttleKey, String(Date.now()));
  // row 확인 — 가이드 HTML 있어야 발송 가능
  const row = _readUnifiedRow(data.id);
  if (!row) return jsonResponse({status:'error', message:'통합정보 시트에 없음'});
  if (!row['가이드_HTML_URL']) return jsonResponse({status:'error', message:'가이드 본문 없음 — 견적 확정 후 가능'});
  if (!row['이메일']) return jsonResponse({status:'error', message:'이메일 비어있음'});
  // cooldown 우회를 위해 가이드_발송일시 임시 비우기 (sendGuideForRow의 5분 cooldown은 자동 polling용)
  // 직접 sendGuideForRow를 호출하면 cooldown 검사가 없음 (그건 pollAndSendGuides에서만 검사) — 그래서 우회 불필요
  try {
    sendGuideForRow(row);
    return jsonResponse({status:'ok', sentAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')});
  } catch (e) {
    // 실패는 sendGuideForRow가 시트에 기록함. 응답으로도 알림.
    return jsonResponse({status:'error', message:'발송 실패: ' + (e.message || e)});
  }
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
      id:r[0], submittedAt:_fmtKstDateTime(r[1]), company:r[2], bizNo:r[3], ceo:r[4],
      phone:r[5], email:r[6], address:r[7], foundDate:_fmtKstDate(r[8]), industry:r[9],
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
        quoteNo:String(r[0]||''), reqId:String(r[1]||''), issuedAt:_fmtKstDateTime(r[2]),
        company:String(r[3]||''), equipment:String(r[4]||''),
        includeOpts: r[5] ? String(r[5]).split(' | ') : [],
        extraOpts: safeParseJSON(r[6]),
        supplyPrice:r[7]||'', taxPrice:r[8]||'', totalPrice:r[9]||'',
        validUntil:_fmtKstDate(r[10]), status:String(r[11]||''), assignee:String(r[12]||'')
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
      quoteNo:r[0], reqId:r[1], issuedAt:_fmtKstDateTime(r[2]), company:r[3], equipment:r[4],
      includeOpts: r[5] ? r[5].split(' | ') : [],
      extraOpts: safeParseJSON(r[6]),
      supplyPrice:r[7], taxPrice:r[8], totalPrice:r[9],
      validUntil:_fmtKstDate(r[10]), status:r[11], assignee:r[12]||''
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

  // === Phase 2 훅: 통합정보 시트에 PDF URL 기록 + 두 PDF 모두 채워지면 가이드 본문 자동 생성 ===
  // filename prefix '장비사진_'로 견적/장비사진 PDF 자동 구분. admin.html 변경 X.
  // 실패해도 PDF 저장 자체는 성공 응답 — try-catch로 격리.
  try {
    if (data.reqId) {
      const isEquip = String(data.filename || '').indexOf('장비사진_') === 0;
      const colName = isEquip ? '장비사진PDF_URL' : '견적PDF_URL';
      _updateUnifiedField(data.reqId, colName, file.getUrl());
      // Phase 5: PDF URL update 직후 노션에도 반영 (둘째 PDF 들어오면 다시 한 번 push되어 둘 다 반영됨)
      _safePushToNotion(data.reqId);
      const row = _readUnifiedRow(data.reqId);
      if (row && row['견적PDF_URL'] && row['장비사진PDF_URL']) {
        _ensureGuideForUnified(row);
      }
    }
  } catch (e) { Logger.log('handleSaveQuote: 가이드 훅 실패 — ' + e); }

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
