/**
 * MMEEC 포켓보드 PRO 2.1 — 체감온도 자동 기록 Apps Script (토큰 검증 버전)
 *
 * 적용 방법:
 * 1. 구글 시트 → 확장 프로그램 → Apps Script 열기
 * 2. 기존 코드의 doPost 함수를 아래 내용으로 교체
 *    (기존 시트 기록 로직은 recordToSheet 부분에 그대로 붙여넣기)
 * 3. SHARED_TOKEN 값을 config.js의 sheetsToken과 동일하게 설정
 * 4. 배포 → 새 배포 → 웹 앱 (액세스: 모든 사용자) 로 재배포
 *    ※ 재배포하면 URL이 바뀔 수 있으니 config.js의 sheetsWebhookUrl 갱신 확인
 */

// config.js 의 sheetsToken 과 반드시 동일해야 함
const SHARED_TOKEN = "MMEEC-2607-HEAT";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ── 토큰 검증: 불일치 시 기록 거부 ──
    if (!data.token || data.token !== SHARED_TOKEN) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: "unauthorized" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    recordToSheet(data);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 일자별 탭 자동 생성 + 연장작업(새벽 06시 이전 → 전날 탭) 기록
 * 기존 v1.0 로직과 동일 — 필요 시 기존 코드로 교체 가능
 */
function recordToSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 새벽 06:00 이전은 전날 탭에 기록 (연장작업)
  const now = new Date();
  const target = new Date(now);
  if (now.getHours() < 6) target.setDate(target.getDate() - 1);

  const yy = String(target.getFullYear()).slice(2);
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  const tabName = `${yy}${mm}-${dd}`; // 예: 2607-13

  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(2, 1, 1, 13).setValues([[
      "공장", "사업장", "공사명", "등급", "작업",
      "기록1", "기록2", "기록3", "기록4", "기록5", "기록6", "기록7", "기록8"
    ]]);
    sheet.getRange(2, 1, 1, 13).setFontWeight("bold");
  }

  const time = Utilities.formatDate(now, "Asia/Seoul", "HH:mm");
  const iconMap = { "관심": "○", "주의": "■", "경고": "▲", "위험": "◆", "보통": "" };
  const icon = iconMap[data.level] || "";
  const record = `${time}\n${icon}${data.level} ${data.value}℃`;

  // 동일 공사 행 찾기 (공장+공사명 일치)
  const lastRow = sheet.getLastRow();
  let targetRow = -1;
  if (lastRow >= 3) {
    const values = sheet.getRange(3, 1, lastRow - 2, 3).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === data.factory && values[i][2] === data.title) {
        targetRow = i + 3;
        break;
      }
    }
  }

  if (targetRow === -1) {
    // 새 행 추가
    targetRow = lastRow + 1;
    sheet.getRange(targetRow, 1, 1, 5).setValues([[
      data.factory, data.company, data.title, data.grade, data.workType
    ]]);
    sheet.getRange(targetRow, 6).setValue(record);
  } else {
    // 기록1~기록8 중 빈 칸에 순서대로 기록
    for (let col = 6; col <= 13; col++) {
      if (!sheet.getRange(targetRow, col).getValue()) {
        sheet.getRange(targetRow, col).setValue(record);
        break;
      }
    }
  }
}
