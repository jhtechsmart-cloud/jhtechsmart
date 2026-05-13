/**
 * (주)재현테크 · 메일 발송 Web App
 *
 * 메인 GAS(smart@paxc.co.kr 계정)로부터 HTTP POST를 받아
 * jhtechsmart@gmail.com 계정으로 메일을 발송한다.
 *
 * 별도 배포 이유: MailApp.sendEmail은 스크립트 소유자 계정으로 발송됨.
 *   - 메인 GAS = smart@paxc.co.kr → 발송 시 발신자도 smart@paxc.co.kr
 *   - 본 Mailer = jhtechsmart@gmail.com → 발송 시 발신자가 jhtechsmart@gmail.com (요구사항)
 *
 * 배포 방법:
 *   1. jhtechsmart@gmail.com으로 https://script.google.com/ 접속
 *   2. "새 프로젝트" → 본 파일 내용 붙여넣기 → 저장
 *   3. ⚙ 프로젝트 설정 → 스크립트 속성에 MAILER_TOKEN(임의 32자 hex) 추가
 *   4. 배포 → "새 배포" → 유형: Web App
 *      - 액세스 권한: "모든 사용자"
 *      - 실행 권한: "나" (= jhtechsmart@gmail.com)
 *   5. 발급된 URL을 메인 GAS Script Properties에 MAILER_WEBAPP_URL로 등록
 *   6. 동일한 MAILER_TOKEN을 메인 GAS Script Properties에도 등록 (양쪽 동일)
 *
 * 호출 측 페이로드 (메인 GAS의 callMailer):
 *   {
 *     token: "...",                    // MAILER_TOKEN 검증
 *     to: "abc@example.com",            // 수신자
 *     subject: "메일 제목",
 *     htmlBody: "<html>...</html>",     // 본문
 *     name: "(주)재현테크",              // 발신자 표시 이름 (선택)
 *     replyTo: "smart@paxc.co.kr",      // 답장 받을 주소 (선택)
 *     attachments: [                    // 첨부 파일 배열 (선택)
 *       { name: "견적서.pdf", url: "https://drive.google.com/uc?id=..." }
 *     ]
 *   }
 *
 * 응답:
 *   성공: { status: "ok", sentAt: "yyyy-MM-dd HH:mm" }
 *   실패: { status: "error", message: "...", code: "..." }
 */

function doPost(e) {
  try {
    const data = _parsePayload(e);
    _checkToken(data);
    _validatePayload(data);

    // 첨부 파일 — Drive URL에서 fetch (file ID 추출 → DriveApp으로 직접 가져옴)
    const attachments = _resolveAttachments(data.attachments || []);

    // 발송 옵션
    const options = {
      htmlBody: data.htmlBody,
      name: data.name || '(주)재현테크',
      attachments: attachments
    };
    if (data.replyTo) options.replyTo = data.replyTo;

    MailApp.sendEmail(data.to, data.subject, '', options);

    return _json({
      status: 'ok',
      sentAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
    });
  } catch (err) {
    return _json({
      status: 'error',
      message: String(err.message || err),
      code: err.code || 'INTERNAL'
    });
  }
}

/* 권한 확인용 — GET은 안 받지만 배포 검증을 위해 짧은 응답. */
function doGet() {
  return _json({status:'ok', service:'jhtech-mailer', version:'1.0'});
}

// ─── helpers ───

function _parsePayload(e) {
  // application/x-www-form-urlencoded (preflight 회피) 또는 application/json 둘 다 지원
  if (e && e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    const type = (e.postData.type || '').toLowerCase();
    if (type.indexOf('application/json') >= 0) {
      return JSON.parse(raw);
    }
    // urlencoded: 'data' 키 안에 JSON 들어있다고 가정 (callMailer 측 약속)
    if (e.parameter && e.parameter.data) {
      return JSON.parse(e.parameter.data);
    }
    // 마지막 폴백: raw 자체가 JSON
    try { return JSON.parse(raw); } catch (_) { /* fallthrough */ }
  }
  if (e && e.parameter && e.parameter.data) {
    return JSON.parse(e.parameter.data);
  }
  const err = new Error('payload 파싱 실패');
  err.code = 'BAD_PAYLOAD';
  throw err;
}

function _checkToken(data) {
  const expected = PropertiesService.getScriptProperties().getProperty('MAILER_TOKEN');
  if (!expected) {
    const err = new Error('Script Property "MAILER_TOKEN" 미설정. Apps Script ⚙ 프로젝트 설정에서 추가하세요.');
    err.code = 'MAILER_NOT_CONFIGURED';
    throw err;
  }
  if (!data || data.token !== expected) {
    const err = new Error('인증 토큰 불일치');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
}

function _validatePayload(data) {
  if (!data.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.to))) {
    const err = new Error('to 이메일 형식 오류: ' + data.to);
    err.code = 'BAD_EMAIL';
    throw err;
  }
  if (!data.subject) {
    const err = new Error('subject 누락');
    err.code = 'BAD_SUBJECT';
    throw err;
  }
  if (!data.htmlBody) {
    const err = new Error('htmlBody 누락');
    err.code = 'BAD_BODY';
    throw err;
  }
}

/* attachments: [{name, url}] 또는 [{name, fileId}].
   Drive URL에서 file ID 추출하거나 fileId 그대로 사용 → DriveApp으로 blob 가져옴.
   25MB 초과 시 그 파일만 skip 하고 로그 남김. */
function _resolveAttachments(arr) {
  const result = [];
  const MAX_BYTES = 25 * 1024 * 1024;
  arr.forEach(item => {
    try {
      let fileId = item.fileId;
      if (!fileId && item.url) {
        // https://drive.google.com/file/d/{id}/view 또는 https://drive.google.com/uc?id={id}
        const m1 = String(item.url).match(/\/d\/([a-zA-Z0-9_-]+)/);
        const m2 = String(item.url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
        fileId = (m1 && m1[1]) || (m2 && m2[1]);
      }
      if (!fileId) { Logger.log('attachments: fileId 추출 실패 — ' + JSON.stringify(item)); return; }
      const file = DriveApp.getFileById(fileId);
      const size = file.getSize();
      if (size > MAX_BYTES) {
        Logger.log('attachments: 25MB 초과 skip — ' + file.getName() + ' (' + size + 'B)');
        return;
      }
      const blob = file.getBlob();
      if (item.name) blob.setName(item.name);
      result.push(blob);
    } catch (e) {
      Logger.log('attachments: blob 변환 실패 — ' + (item && item.name) + ': ' + e);
    }
  });
  return result;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
