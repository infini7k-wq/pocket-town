// オフラインで遊べるようにするための Service Worker（npm run build:pages のときに out/sw.js として書き出される）
const VERSION = "__VERSION__";
const BASE = "__BASE__";
const CACHE = `pocket-town-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  // 新しい版は待機させ、画面の［更新］で切り替える（古い画面が新しいファイルを読みに行って壊れないように）
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 同じドメインの別のアプリのキャッシュは消さない（pocket-town- で始まる古い版だけ）
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("pocket-town-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // ページ本体：ネットワーク優先（3秒）。だめならキャッシュ
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await Promise.race([fetch(req), timeout(3000)]);
          if (res.ok) cache.put(`${BASE}/`, res.clone());
          return res;
        } catch {
          return (await cache.match(`${BASE}/`)) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
        }
      })(),
    );
    return;
  }

  // ハッシュ付きのファイル：中身が変わらないのでキャッシュ優先
  if (url.pathname.startsWith(`${BASE}/_next/static/`)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // そのほか（アイコン・manifest など）：キャッシュを返しつつ裏で取り直す
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })(),
  );
});
