/**
 * MMEEC 포켓보드 PRO 2.5 — Apps Script 통합본 (v3)
 * ─────────────────────────────────────────────────
 *  기능 A) 체감온도 실시간 기록 (doPost, v2와 동일 + 토큰 검증)
 *  기능 B) 매일 06:00 전체 진행기록 자동백업 (dailyBackup)
 *
 * 적용 방법:
 *  1. 구글 시트 → 확장 프로그램 → Apps Script → 기존 코드 전체를 이 파일로 교체
 *  2. 아래 상수 3개를 본인 값으로 수정
 *     - SHARED_TOKEN  : config.js 의 sheetsToken 과 동일하게
 *     - SUPABASE_URL / SUPABASE_KEY : config.js 값 그대로
 *     - BACKUP_TOKEN  : supabase-master-v3.sql 에서 정한 백업 토큰과 동일하게
 *  3. 상단 함수 선택에서 `createDailyTrigger` 선택 → 실행 (1회만)
 *     → 매일 06시 자동백업 트리거가 등록됩니다 (권한 승인 팝업 허용)
 *  4. 배포 → 새 배포 → 웹 앱 → 재배포 (URL 바뀌면 config.js 갱신)
 */

// ══ 설정 (반드시 수정) ══════════════════════════════
const SHARED_TOKEN = "MMEEC-2607-HEAT";
const SUPABASE_URL = "https://ojmpeuuldpsfuilnneui.supabase.co";
const SUPABASE_KEY = "sb_publishable_4fsA55-lJq9glbcg9Lqd6A__XmIJwIa";
const BACKUP_TOKEN = "backup-mmeecsafe-1895"; // ← SQL과 동일하게 변경!

// ══ 기능 A: 체감온도 실시간 기록 ════════════════════
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data.token || data.token !== SHARED_TOKEN) {
      return jsonOut({ ok: false, error: "unauthorized" });
    }
    recordHeatToSheet(data);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ══ 기능 C: 기상청 API 프록시 (브라우저 CORS 우회) ══
// 앱에서 직접 호출이 CORS로 막힐 때 이 경유로 자동 폴백됩니다.
// 보안: apis.data.go.kr 로만 중계 허용
function doGet(e) {
  try {
    const target = e && e.parameter && e.parameter.proxy;
    if (!target) return jsonOut({ ok: true, service: "pocketboard" });
    if (target.indexOf("https://apis.data.go.kr/") !== 0) {
      return jsonOut({ ok: false, error: "forbidden target" });
    }
    const res = UrlFetchApp.fetch(target, { muteHttpExceptions: true });
    return ContentService.createTextOutput(res.getContentText())
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 06시 체계 기준 탭 이름 (새벽 06시 이전 = 전날) */
function workdayTabName(now) {
  const t = new Date(now.getTime());
  if (t.getHours() < 6) t.setDate(t.getDate() - 1);
  const yy = String(t.getFullYear()).slice(2);
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return yy + mm + "-" + dd; // 예: 2607-18
}

function recordHeatToSheet(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const tabName = workdayTabName(now);

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
  const record = time + "\n" + icon + data.level + " " + data.value + "℃";

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
    targetRow = lastRow + 1;
    sheet.getRange(targetRow, 1, 1, 5).setValues([[
      data.factory, data.company, data.title, data.grade, data.workType
    ]]);
    sheet.getRange(targetRow, 6).setValue(record);
  } else {
    for (let col = 6; col <= 13; col++) {
      if (!sheet.getRange(targetRow, col).getValue()) {
        sheet.getRange(targetRow, col).setValue(record);
        break;
      }
    }
  }
}

// ══ 기능 B: 매일 06:00 전체 자동백업 ═══════════════

/** 1회 실행: 매일 06시 트리거 등록 */
function createDailyTrigger() {
  // 중복 방지: 기존 dailyBackup 트리거 제거
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "dailyBackup") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyBackup")
    .timeBased().everyDays(1).atHour(6)   // 06:00 ~ 07:00 사이 실행
    .create();
  Logger.log("매일 06시 자동백업 트리거 등록 완료");
}

/** 매일 06시 실행: 등록소의 전체 세션 진행기록을 시트에 백업 */
function dailyBackup() {
  // Supabase RPC 호출 (backup_export)
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/backup_export", {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
    },
    payload: JSON.stringify({ p_token: BACKUP_TOKEN }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("백업 실패: " + res.getContentText());
    return;
  }
  const sessions = JSON.parse(res.getContentText()) || [];
  if (sessions.length === 0) { Logger.log("백업할 세션 없음"); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 직전 하루(06시 체계) 날짜 = 지금-6h 에서 하루 전
  const now = new Date();
  const wd = new Date(now.getTime() - 6 * 3600 * 1000);
  wd.setDate(wd.getDate() - 1);
  const dateTag = String(wd.getFullYear()).slice(2)
    + String(wd.getMonth() + 1).padStart(2, "0") + "-"
    + String(wd.getDate()).padStart(2, "0");

  const HEADERS = ["공장","사업장","공사명","등급","작업","공사위치","감독자",
                   "직영","일용","협력사","협력인원","상태","연장","작업일수","메모","체감온도기록"];

  sessions.forEach(s => {
    const items = Array.isArray(s.items) ? s.items : [];
    const safeName = String(s.site_name || s.session_id).slice(0, 20).replace(/[\\\/\?\*\[\]:]/g, "_");
    const tabName = "백업_" + dateTag + "_" + safeName;

    let sheet = ss.getSheetByName(tabName);
    if (sheet) ss.deleteSheet(sheet); // 재실행 시 갱신
    sheet = ss.insertSheet(tabName);

    const rows = [HEADERS];
    items.forEach(it => {
      const heat = (it.heatResults || []).slice().reverse()
        .map(r => (r.hm || r.time || "") + " " + Number(r.value).toFixed(1) + "℃(" + r.level + ")")
        .join(" | ");
      const ext = (it.extendHour !== null && it.extendHour !== undefined)
        ? String(it.extendHour).padStart(2, "0") + "시연장" : "";
      rows.push([
        it.factory || "", it.company || "", it.title || "", it.grade || "", it.workType || "",
        it.spotLocation || "", it.assignedSupervisor || "",
        it.directWorkers || "", it.dailyWorkers || "", it.partnerName || "", it.partnerWorkers || "",
        it.status === "checked" ? "공사중" : "확인필요",
        ext, it.pastWorkDays || "", it.memo || "", heat
      ]);
    });
    sheet.getRange(1, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  });

  Logger.log("자동백업 완료: " + sessions.length + "개 세션");
}
