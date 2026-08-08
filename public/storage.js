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

// (v2.5c) 공사 코드 개념 폐지 — 데이터 저장소를 "default" 하나로 일원화.
//  이전에는 공사 코드마다 저장소가 통째로 갈려서, 코드를 바꾸면 다른 저장소로 이동해
//  방금 한 TODAY 체크·감독자·메모가 사라진 것처럼 보였다(실제로는 다른 세션을 본 것).
//  화면 필터는 이미 있는 🏭 내 공장 / 공장 탭이 담당하며, 이들은 데이터를 나누지 않는다.
//  ⚠️ 구버전 호환: 예전 기기에 남아있는 MMEEC_SESSION_ID나 URL의 ?session= 값은
//     무시하고 항상 default를 쓴다(있어도 오류 없이 그냥 무시됨).
const FIXED_SESSION_ID = "default";

function getSessionId() {
  return FIXED_SESSION_ID;
}

// 남아있는 호출부 호환용 — 더 이상 세션을 바꾸지 않는다(항상 default).
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

// ── (v2.5c) 오프라인 저장 대기열 ──────────────────────────────
//  신호가 약하거나 끊긴 곳에서도 입력이 사라지지 않게 한다.
//  저장은 항상 "목록 전체"를 통째로 보내는 방식이라, 대기열에 여러 건을 순서대로
//  쌓을 필요 없이 **가장 마지막 상태 하나만** 들고 있으면 충분하다.
//  (공사 1개 = 감독자 1명 전담 원칙이라 남의 기록과 겹칠 일이 없음)
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

// 인터넷이 돌아왔을 때 대기 중인 기록을 서버로 올린다.
// 오래된 기록도 사람 확인 없이 그대로 전송(2026-08-04 확정 사양).
async function flushPending() {
  const p = getPending();
  if (!p || !isCloudEnabled()) return { flushed: false };
  try {
    await saveCloud(getSessionId(), p.items, p.meta);
    clearPending();
    return { flushed: true, at: p.at };
  } catch (e) {
    return { flushed: false, error: e };
  }
}

async function save(items, meta) {
  const sessionId = getSessionId();
  saveLocal(items, meta);   // 기기에는 무조건 먼저 저장 — 어떤 경우에도 입력을 잃지 않는다

  if (!isCloudEnabled()) {
    return { sessionId, mode: "local" };
  }

  try {
    await saveCloud(sessionId, items, meta);
    clearPending();   // 서버까지 올라갔으면 대기열 비움
    return { sessionId, mode: "cloud" };
  } catch (e) {
    // (v2.5c) 네트워크 실패 시 예외를 던지지 않고 대기열에 넣는다.
    //  예전에는 여기서 그냥 실패해 "저장 실패" 토스트만 뜨고 기록이 서버에 영영 안 올라갔다.
    setPending(items, meta);
    return { sessionId, mode: "offline", error: e };
  }
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
      // v2.5 일일 사이클 필드 보존
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
  // (v2.5c) 오프라인 대기열
  hasPending,
  flushPending,
  getPending,
};
})();