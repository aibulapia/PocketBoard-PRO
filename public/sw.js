














const APP_VERSION = "2.5H";
const CACHE_NAME = `pocketboard-v${APP_VERSION}`;


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





const createFallbackResponse = () => new Response(
  "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
  "<body style='font-family:sans-serif;text-align:center;padding:60px 20px;color:#334155'>" +
  "<h2>일시적으로 연결할 수 없습니다</h2><p>인터넷 연결을 확인한 뒤<br>화면을 아래로 당기거나 새로고침 해주세요.</p></body>",
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
);

self.addEventListener("fetch", (event) => {
  const req = event.request;

  
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  
  
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(req).catch(() => null);

        
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);

        
        if (cached) return cached;

        const res = await network;
        if (res) return res;

        
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html").catch(() => null);
          if (shell) return shell;
        }
        return createFallbackResponse();
      } catch (e) {
        
        
        
        return fetch(req).catch(() => FALLBACK_HTML);
      }
    })()
  );
});
