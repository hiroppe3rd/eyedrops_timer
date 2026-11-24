// PWA インストール要件を満たす最小構成の Service Worker
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  // 同一オリジン以外のリクエストは横取りしない
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});
