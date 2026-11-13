/* BeatDrop Service Worker. Cache only app documents and immutable same-origin assets. */
const BUILD_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `beatdrop-shell-${BUILD_VERSION}`;
const STATIC_CACHE = `beatdrop-static-${BUILD_VERSION}`;
const PAGE_CACHE = `beatdrop-pages-${BUILD_VERSION}`;
const OWNED_CACHE_PREFIXES = ['beatdrop-shell-', 'beatdrop-static-', 'beatdrop-pages-'];
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
const OFFLINE_DOCUMENTS = new Set(['/','/play','/daily','/guesser','/categories','/privacy','/cookies']);
let updateApproved = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Updates wait until the user chooses “Refresh to update”.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => OWNED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
          ![SHELL_CACHE, STATIC_CACHE, PAGE_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(async () => {
        if (!updateApproved) return;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        windows.forEach((client) => client.postMessage({ type: 'BEATDROP_UPDATE_ACTIVATED' }));
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    updateApproved = true;
    self.skipWaiting();
  }
});

function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false;
  const headers = response.headers;
  const cacheControl = headers.get('cache-control') || '';
  const vary = headers.get('vary') || '';
  return !/private|no-store/i.test(cacheControl) &&
    vary.trim() !== '*' &&
    !/(^|,)\s*(cookie|authorization)\s*(,|$)/i.test(vary) &&
    !headers.has('set-cookie');
}

function pageKey(url) {
  return new URL(url.pathname, self.location.origin).href;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // APIs, including SQLite/Supabase-backed endpoints, are always network-only.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/')) return;
  if (request.headers.has('authorization') || request.headers.has('cookie')) return;

  if (request.mode === 'navigate') {
    if (!OFFLINE_DOCUMENTS.has(url.pathname)) return;
    event.respondWith((async () => {
      const key = pageKey(url);
      try {
        const response = await fetch(request);
        if (isCacheableResponse(response) &&
            (response.headers.get('content-type') || '').includes('text/html') &&
            !url.search) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put(key, response.clone());
        }
        return response;
      } catch {
        const cachedPage = await caches.match(key);
        if (cachedPage) return cachedPage;
        return (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  const isImmutableAsset = url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/');
  if (!isImmutableAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableResponse(response)) await cache.put(request, response.clone());
    return response;
  })());
});
