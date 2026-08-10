/* 포켓보드 서비스워커 (v2.5c 신규)
 *
 * 목적: 인터넷이 끊겨도 앱 화면이 뜨고, 마지막으로 받아둔 공사 목록으로 계속 작업할 수 있게 한다.
 * (공장 지하·밀폐 공간처럼 신호가 약한 곳에서 화면조차 안 뜨던 문제 해결)
 *
 * 캐시 전략
 *  - 앱 껍데기(index.html, data.js, config.js, storage.js, 아이콘): 캐시 우선 + 백그라운드 갱신
 *    → 오프라인에서도 즉시 화면이 뜬다
 *  - Supabase/기상청 등 외부 API 요청: 캐시하지 않고 그대로 통과
 *    → 안전 데이터라 오래된 값을 조용히 보여주면 안 됨. 실패는 앱이 직접 처리한다
 *
 * 캐시 무효화: CACHE_NAME에 버전을 넣어, 배포로 버전이 바뀌면 새 캐시로 교체되고
 *             오래된 캐시는 activate 단계에서 자동 삭제된다.
 */

const APP_VERSION = "2.5g";
const CACHE_NAME = `pocketboard-v${APP_VERSION}`;

// 오프라인에도 화면이 뜨려면 반드시 있어야 하는 파일들
const APP_SHELL = [
  "./",
  "./index.html",
  "./data.js",
  "./config.js",
  "./storage.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // 일부 파일이 없어도 설치가 통째로 실패하지 않도록 개별 처리
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith("pocketboard-") && n !== CACHE_NAME)
             .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET 이외(저장 등)는 절대 건드리지 않는다 — 앱의 오프라인 대기열이 직접 처리
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 외부 API(Supabase·기상청·구글)는 캐시하지 않고 통과.
  // 안전 데이터라 오래된 값을 최신인 것처럼 보여주면 위험하다.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      // 백그라운드로 최신본을 받아 캐시를 갱신(다음 실행 때 최신 화면)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => null);

      // 캐시가 있으면 즉시 표시(빠름 + 오프라인 대응), 없으면 네트워크를 기다린다
      if (cached) return cached;
      return network.then((res) => {
        if (res) return res;
        // 완전 오프라인이고 캐시도 없을 때: 화면 이동 요청이면 저장된 앱 화면이라도 보여준다
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "offline" });
      });
    })
  );
});
