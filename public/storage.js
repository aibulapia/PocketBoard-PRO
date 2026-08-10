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
    // (v2.5g) 서버에 저장소가 있으면 **비어 있어도** 그것이 정답이다.
    //  예전에는 items가 0건이면 "못 불러온 것"으로 보고 기기에 남은 옛 목록을 썼다.
    //  그래서 초기화·시즌 종료로 서버를 비워도 다른 기기에는 옛 목록이 그대로 보이고,
    //  그 기기가 저장하는 순간 옛 데이터 전체가 서버에 되살아났다.
    //  저장소 자체가 없을 때(loadCloud가 null)만 기기 데이터로 폴백한다.
    if (cloud) {
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

// (v2.5g) 저장 직전 공통 필터 — 앱(index.html)이 "시즌이 끝났으면 비운다" 규칙을 주입한다.
//  병합(mergeByUpdatedAt)은 카드별로 최신 것을 남기는 방식이라 **삭제를 표현하지 못한다**.
//  그래서 지운 카드가 서버에서 계속 되살아나 삭제↔부활이 무한 반복됐고,
//  그 반복 중 조회가 한 번만 실패하면 목록 전체가 날아갔다.
//  → 합친 "결과"에 같은 규칙을 한 번 더 적용해, 어느 기기에서 올려도 결론이 같아지게 한다.
//  ⚠️ 안전 우선: 필터가 등록되지 않았거나 오류가 나면 아무것도 지우지 않는다(원본 그대로).
let postMergeFilter = null;
function setPostMergeFilter(fn) {
  postMergeFilter = typeof fn === "function" ? fn : null;
}
function applyPostMergeFilter(list) {
  if (!postMergeFilter) return list;
  try {
    const out = postMergeFilter(list);
    return Array.isArray(out) ? out : list;
  } catch (e) {
    console.warn("저장 전 필터 오류 — 원본 유지:", e);
    return list;
  }
}

// (v2.5d) 카드 단위 병합 — "목록 통째로 덮어쓰기"가 남의 기록을 지우던 문제 수정.
//  각 카드에 마지막으로 고친 시각(updatedAt)을 찍어두고, 저장 직전 서버 것과 비교해
//  **카드마다 더 최신인 쪽만** 남긴다. 내가 안 건드린 카드는 남의 최신 기록이 보존된다.
//  ⚠️ 구버전 호환: updatedAt이 없는 옛 데이터는 0으로 취급 → 새로 고친 쪽이 항상 이긴다.
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

// 서버 최신본을 읽어와 내 변경분과 합친 결과를 돌려준다.
// 읽기에 실패하면(오프라인 등) 합치지 못하므로 내 것 그대로 반환한다.
async function mergeWithCloud(items) {
  try {
    const cloud = await loadCloud(getSessionId());
    if (cloud && Array.isArray(cloud.items)) {
      return mergeByUpdatedAt(cloud.items, items);
    }
  } catch (e) {
    console.warn("병합용 서버 조회 실패 — 내 목록 그대로 저장:", e);
  }
  return items;
}

// 인터넷이 돌아왔을 때 대기 중인 기록을 서버로 올린다.
// (v2.5d) 그대로 덮어쓰지 않고 서버 최신본과 병합해서 올린다.
//  예전에는 신호 약한 곳에서 저장된 옛 목록이 나중에 통째로 올라가면서
//  그 사이 다른 사람이 한 체크를 지워버렸다.
async function flushPending() {
  const p = getPending();
  if (!p || !isCloudEnabled()) return { flushed: false };
  try {
    const cloud = await loadCloud(getSessionId());

    // (v2.5g) 서버가 비어 있고, 그 "비움"이 내 대기 기록보다 **나중**이라면
    //  초기화(또는 시즌 종료 삭제)가 나중에 일어난 것이므로 옛 기록을 되살리지 않는다.
    //  예전에는 신호 약한 곳에서 대기하던 옛 목록이 초기화 직후 통째로 올라가 되살아났다.
    //  반대로 비움보다 내 기록이 나중이면(초기화 뒤에 새로 입력) 정상 전송한다.
    if (cloud && Array.isArray(cloud.items) && cloud.items.length === 0) {
      const serverAt = Date.parse(cloud.meta && cloud.meta.updatedAt ? cloud.meta.updatedAt : 0) || 0;
      if (serverAt > Number(p.at || 0)) {
        clearPending();
        saveLocal([], { sheetTitle: null });
        return { flushed: true, discarded: true, at: p.at, items: [] };
      }
    }

    const base = (cloud && Array.isArray(cloud.items))
      ? mergeByUpdatedAt(cloud.items, p.items)
      : p.items;
    const merged = applyPostMergeFilter(base);
    await saveCloud(getSessionId(), merged, p.meta);
    saveLocal(merged, p.meta);
    clearPending();
    return { flushed: true, at: p.at, items: merged };
  } catch (e) {
    return { flushed: false, error: e };
  }
}

async function save(items, meta) {
  const sessionId = getSessionId();
  saveLocal(items, meta);   // 기기에는 무조건 먼저 저장 — 어떤 경우에도 입력을 잃지 않는다

  if (!isCloudEnabled()) {
    return { sessionId, mode: "local", items };
  }

  try {
    // (v2.5d) 서버 최신본과 합치고 → (v2.5g) 합친 결과에 시즌 종료 규칙을 한 번 더 적용
    const merged = applyPostMergeFilter(await mergeWithCloud(items));
    await saveCloud(sessionId, merged, meta);
    saveLocal(merged, meta);   // 합쳐진 결과를 기기에도 반영
    clearPending();
    return { sessionId, mode: "cloud", items: merged };
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
  // (v2.5g) 전송 대기 중인 옛 기록도 함께 버린다.
  //  예전에는 초기화 뒤 대기 기록이 나중에 올라가 지운 데이터가 되살아났다.
  clearPending();

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

function mergeItems(existing, parsed) {
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
// (v2.5g) 연결 유지 신호(heartbeat)와 자동 재연결 추가.
//  예전에는 접속만 하고 아무 신호도 보내지 않아 서버가 약 1분 뒤 연결을 끊었고,
//  끊긴 것을 알아채는 곳도 없어 "다른 사람 기록이 자동으로 안 뜨는" 상태가 조용히 이어졌다.
//  반환값은 { close() } — 기존 호출부(socket.close())와 그대로 호환된다.
function subscribeRealtime(sessionId, onUpdate) {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;

  const wsUrl =
    cfg.supabaseUrl.replace("https://", "wss://") +
    `/realtime/v1/websocket?apikey=${cfg.supabaseKey}&vsn=1.0.0`;

  let socket = null;
  let heartbeat = null;
  let retryTimer = null;
  let tries = 0;
  let closed = false;

  const stopHeartbeat = () => { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;
    tries = Math.min(tries + 1, 5);
    const wait = Math.min(30000, 2000 * Math.pow(2, tries - 1)); // 2초 → 최대 30초
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, wait);
  };

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(wsUrl);
    } catch (e) {
      console.warn("Realtime 연결 실패:", e);
      scheduleRetry();
      return;
    }

    socket.onopen = () => {
      tries = 0;
      try {
        socket.send(JSON.stringify({
          topic: `realtime:public:pocket_sessions:session_id=eq.${sessionId}`,
          event: "phx_join",
          payload: {},
          ref: "1",
        }));
      } catch (e) { console.warn("Realtime 구독 요청 실패:", e); }

      stopHeartbeat();
      heartbeat = setInterval(() => {
        if (!socket || socket.readyState !== 1) return;
        try {
          socket.send(JSON.stringify({
            topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()),
          }));
        } catch (e) { console.warn("Realtime 유지 신호 실패:", e); }
      }, 25000);
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

    socket.onclose = () => {
      stopHeartbeat();
      scheduleRetry();
    };
  }

  connect();

  return {
    close() {
      closed = true;
      stopHeartbeat();
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      try { if (socket) socket.close(); } catch {}
    },
  };
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
  // (v2.5g) 저장 직전 공통 필터 등록 (시즌 종료 규칙 주입용)
  setPostMergeFilter,
  // (v2.5c) 오프라인 대기열
  hasPending,
  flushPending,
  getPending,
};
})();