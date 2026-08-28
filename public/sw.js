/**
 * MMEEC 포켓보드 — 서비스워커 정리 전용 (v2.53~)
 *
 * 오프라인 캐시 기능은 v2.53에서 제거되었습니다.
 *  · 현장에서 인터넷이 끊기는 경우가 거의 없어 실익이 적었고,
 *  · 캐시가 꼬이면 홈화면 아이콘에서 ERR_FAILED가 반복되며
 *    앱을 지우고 재설치해도 풀리지 않는 문제가 반복 발생했습니다.
 *
 * 이 파일은 예전 버전을 쓰던 기기에 이미 설치된 서비스워커를
 * 스스로 지우기 위해서만 남아 있습니다. 아무것도 캐시하지 않습니다.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n).catch(() => {})));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      try {
        const clientList = await self.clients.matchAll({ type: "window" });
        clientList.forEach((client) => client.navigate(client.url));
      } catch (e) {}
    })()
  );
});
