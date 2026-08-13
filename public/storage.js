(function () {
const LOCAL_ITEMS_KEY = "MMEEC_POCKET_BOARD_DATA";
const LOCAL_SESSION_KEY = "MMEEC_SESSION_ID";
const LOCAL_META_KEY = "MMEEC_SESSION_META";

function getConfig() {
  return window.APP_CONFIG || {};
}

function isCloudEnabled() {
  const cfg = getConfig();
  return Boolean(cfg.supabaseUrl && cfg.supabaseKey);
}







const FIXED_SESSION_ID = "default";

function getSessionId() {
  return FIXED_SESSION_ID;
}


function setSessionId() {
  return false;
}

function saveLocal(items, meta) {
  localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
  if (meta) localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
}

function loadLocal() {
  try {
    const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || "[]");
    const meta = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "null");
    return { items: Array.isArray(items) ? items : [], meta };
  } catch {
    return { items: [], meta: null };
  }
}

async function loadCloud(sessionId) {
  const cfg = getConfig();
  const url =
    `${cfg.supabaseUrl}/rest/v1/pocket_sessions?session_id=eq.${encodeURIComponent(sessionId)}` +
    "&select=items,sheet_title,period_start,period_end,updated_at";

  const res = await fetch(url, {
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
    },
  });

  if (!res.ok) throw new Error(`클라우드 불러오기 실패 (${res.status})`);
  const rows = await res.json();
  if (!rows.length) return null;
  return {
    items: rows[0].items || [],
    meta: {
      sheetTitle: rows[0].sheet_title,
      periodStart: rows[0].period_start || null,
      periodEnd: rows[0].period_end || null,
      updatedAt: rows[0].updated_at,
    },
  };
}

async function saveCloud(sessionId, items, meta) {
  const cfg = getConfig();
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/pocket_sessions`, {
    method: "POST",
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      session_id: sessionId,
      items,
      sheet_title: meta?.sheetTitle || null,
      period_start: meta?.periodStart || null,
      period_end: meta?.periodEnd || null,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) throw new Error(`클라우드 저장 실패 (${res.status})`);
}

async function load() {
  const sessionId = getSessionId();

  if (!isCloudEnabled()) {
    const local = loadLocal();
    return { ...local, sessionId, source: "local" };
  }

  try {
    const cloud = await loadCloud(sessionId);
    if (cloud && cloud.items.length) {
      saveLocal(cloud.items, cloud.meta);
      return { ...cloud, sessionId, source: "cloud" };
    }
  } catch (e) {
    console.warn("Cloud load fallback to local:", e);
  }

  const local = loadLocal();
  return { ...local, sessionId, source: "local" };
}






const PENDING_KEY = "MMEEC_PENDING_SAVE";

function getPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); }
  catch { return null; }
}
function setPending(items, meta) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ items, meta, at: Date.now() }));
  } catch (e) { console.warn("대기열 저장 실패:", e); }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}
function hasPending() { return Boolean(getPending()); }





function mergeByUpdatedAt(serverItems, localItems) {
  const out = new Map();
  (serverItems || []).forEach(it => { if (it && it.id) out.set(it.id, it); });
  (localItems || []).forEach(it => {
    if (!it || !it.id) return;
    const s = out.get(it.id);
    if (!s) { out.set(it.id, it); return; }
    const sT = Number(s.updatedAt || 0);
    const lT = Number(it.updatedAt || 0);
    out.set(it.id, lT >= sT ? it : s);
  });
  return Array.from(out.values());
}



async function mergeWithCloud(items) {
  try {
    const cloud = await loadCloud(getSessionId());
    if (cloud && Array.isArray(cloud.items) && cloud.items.length) {
      return mergeByUpdatedAt(cloud.items, items);
    }
  } catch (e) {
    console.warn("병합용 서버 조회 실패 — 내 목록 그대로 저장:", e);
  }
  return items;
}





async function flushPending() {
  const p = getPending();
  if (!p || !isCloudEnabled()) return { flushed: false };
  try {
    const merged = await mergeWithCloud(p.items);
    await saveCloud(getSessionId(), merged, p.meta);
    clearPending();
    return { flushed: true, at: p.at, items: merged };
  } catch (e) {
    return { flushed: false, error: e };
  }
}

async function save(items, meta) {
  const sessionId = getSessionId();
  saveLocal(items, meta);   

  if (!isCloudEnabled()) {
    return { sessionId, mode: "local", items };
  }

  try {
    const merged = await mergeWithCloud(items);   
    await saveCloud(sessionId, merged, meta);
    saveLocal(merged, meta);   
    clearPending();
    return { sessionId, mode: "cloud", items: merged };
  } catch (e) {
    
    
    setPending(items, meta);
    return { sessionId, mode: "offline", error: e };
  }
}

async function clear(sessionId) {
  localStorage.removeItem(LOCAL_ITEMS_KEY);
  localStorage.removeItem(LOCAL_META_KEY);

  if (!isCloudEnabled()) return;

  
  await saveCloud(sessionId, [], { sheetTitle: null, periodStart: null, periodEnd: null });
}

function itemKey(item) {
  return `${item.no}|${item.factory}|${item.title}`;
}



function looseKey(item) {
  return `${item.no}|${item.factory}`;
}

function mergeItems(existing, parsed, urgentOnly) {
  const exactMap = new Map();
  const looseMap = new Map();
  existing.forEach((item) => {
    exactMap.set(itemKey(item), item);
    
    if (!item.isUrgent) {
      const lk = looseKey(item);
      
      looseMap.set(lk, looseMap.has(lk) ? null : item);
    }
  });

  const merged = parsed.map((p) => {
    const old = exactMap.get(itemKey(p)) || looseMap.get(looseKey(p)) || null;
    if (!old) return p;
    return {
      ...p,
      id: old.id,
      spotLocation: old.spotLocation || "",
      assignedSupervisor: old.assignedSupervisor || p.assignedSupervisor,
      memo: old.memo || "",
      status: old.status || "pending",
      directWorkers: old.directWorkers || "",
      dailyWorkers: old.dailyWorkers || "",
      partnerName: old.partnerName || "",
      partnerWorkers: old.partnerWorkers || "",
      heatResults: old.heatResults || [],
      lastHeatStatus: old.lastHeatStatus || null,
      
      pastWorkDays: old.pastWorkDays || 0,
      activeMark: old.activeMark || null,
      todayOff: old.todayOff || null,
      extendHour: (old.extendHour ?? null),
      dayKey: old.dayKey || null,
      reportStage: old.reportStage || "전",
      hasElderly: old.hasElderly || false,
      elderlyCount: old.elderlyCount || "1",
    };
  });

  const parsedKeys = new Set(parsed.map(itemKey));
  existing.forEach((item) => {
    if (item.isUrgent && !parsedKeys.has(itemKey(item))) {
      merged.push(item);
    }
  });

  return merged;
}


function subscribeRealtime(sessionId, onUpdate) {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;

  const wsUrl =
    cfg.supabaseUrl.replace("https://", "wss://") +
    `/realtime/v1/websocket?apikey=${cfg.supabaseKey}&vsn=1.0.0`;

  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      topic: `realtime:public:pocket_sessions:session_id=eq.${sessionId}`,
      event: "phx_join",
      payload: {},
      ref: "1",
    }));
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === "UPDATE" || msg.event === "INSERT") {
        onUpdate();
      }
    } catch {}
  };

  socket.onerror = (e) => console.warn("Realtime 연결 오류:", e);

  return socket;
}

window.MMEECStorage = {
  isCloudEnabled,
  getSessionId,
  setSessionId,
  load,
  save,
  clear,
  mergeItems,
  itemKey,
  subscribeRealtime,
  
  hasPending,
  flushPending,
  getPending,
};
})();