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

function getSessionId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("session");
  if (fromUrl && fromUrl.trim()) {
    const sid = fromUrl.trim();
    localStorage.setItem(LOCAL_SESSION_KEY, sid);
    return sid;
  }
  return localStorage.getItem(LOCAL_SESSION_KEY) || "default";
}

function setSessionId(sessionId) {
  const sid = sessionId.trim();
  if (!sid) return false;
  localStorage.setItem(LOCAL_SESSION_KEY, sid);
  const url = new URL(window.location.href);
  url.searchParams.set("session", sid);
  window.history.replaceState({}, "", url.toString());
  return true;
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
    "&select=items,sheet_title,updated_at";

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
    meta: { sheetTitle: rows[0].sheet_title, updatedAt: rows[0].updated_at },
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

async function save(items, meta) {
  const sessionId = getSessionId();
  saveLocal(items, meta);

  if (!isCloudEnabled()) {
    return { sessionId, mode: "local" };
  }

  await saveCloud(sessionId, items, meta);
  return { sessionId, mode: "cloud" };
}

async function clear(sessionId) {
  localStorage.removeItem(LOCAL_ITEMS_KEY);
  localStorage.removeItem(LOCAL_META_KEY);

  if (!isCloudEnabled()) return;

  // RLS 강화(v2.1)로 DELETE가 차단되므로 빈 배열로 덮어쓰기 방식 사용
  await saveCloud(sessionId, [], { sheetTitle: null });
}

function itemKey(item) {
  return `${item.no}|${item.factory}|${item.title}`;
}

// 보조 키: 공사명 오탈자 수정 등으로 title이 바뀌어도
// NO+공장이 같으면 기존 입력(위치/감독자/메모)을 유지
function looseKey(item) {
  return `${item.no}|${item.factory}`;
}

function mergeItems(existing, parsed, urgentOnly) {
  const exactMap = new Map();
  const looseMap = new Map();
  existing.forEach((item) => {
    exactMap.set(itemKey(item), item);
    // 긴급공사는 NO가 "긴급"으로 동일하므로 보조 키 매칭에서 제외
    if (!item.isUrgent) {
      const lk = looseKey(item);
      // 동일 보조 키가 여러 개면 신뢰할 수 없으므로 무효 처리
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

// ── Realtime 구독 ──────────────────────────────────────
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
};
})();