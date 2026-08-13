



















const SHARED_TOKEN = "MMEEC-2607-HEAT";
const SUPABASE_URL = "https://ojmpeuuldpsfuilnneui.supabase.co";
const SUPABASE_KEY = "sb_publishable_4fsA55-lJq9glbcg9Lqd6A__XmIJwIa";
const BACKUP_TOKEN = "backup-mmeecsafe-1895"; 


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


function workdayTabName(now) {
  const t = new Date(now.getTime());
  if (t.getHours() < 6) t.setDate(t.getDate() - 1);
  const yy = String(t.getFullYear()).slice(2);
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return yy + mm + "-" + dd; 
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






function createDailyTrigger() {
  
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "dailyBackup") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyBackup")
    .timeBased().everyDays(1).atHour(5)   
    .create();
  Logger.log("매일 05시 자동백업 트리거 등록 완료");
}


function dailyBackup() {
  
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
    if (sheet) ss.deleteSheet(sheet); 
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
