import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import manifestFactory from '../app/manifest';

const manifest = manifestFactory();
assert.equal(manifest.name, 'BeatDrop — Thai & International Music Quiz');
assert.equal(manifest.short_name, 'BeatDrop');
assert.equal(manifest.start_url, '/play');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#030704');
assert.equal(manifest.background_color, '#030704');
assert.ok(manifest.icons?.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons?.some((icon) => icon.sizes === '512x512'));
assert.ok(manifest.icons?.some((icon) => icon.purpose === 'maskable'));

for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  const png = fs.readFileSync(path.join(process.cwd(), 'public/icons', file));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} must be a PNG`);
  assert.equal(png.readUInt32BE(16), size, `${file} width`);
  assert.equal(png.readUInt32BE(20), size, `${file} height`);
}

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
new vm.Script(workerSource, { filename: 'public/sw.js' });

type Listener = (event: any) => void;
const listeners = new Map<string, Listener>();
const cacheData = new Map<string, Map<string, Response>>();
const deletedCaches: string[] = [];
let fetchImpl: (request: RequestLike) => Promise<Response> = async () => new Response('ok');
let skipWaitingCount = 0;
let clientsClaimed = false;
const clientMessages: unknown[] = [];

interface RequestLike {
  method: string;
  url: string;
  mode: string;
  headers: Headers;
}

const cachesMock = {
  async open(name: string) {
    let entries = cacheData.get(name);
    if (!entries) {
      entries = new Map();
      cacheData.set(name, entries);
    }
    return {
      async addAll(urls: string[]) {
        for (const url of urls) {
          const body = url === '/offline.html'
            ? fs.readFileSync(path.join(process.cwd(), 'public/offline.html'), 'utf8')
            : 'asset';
          entries!.set(url, new Response(body, { status: 200 }));
        }
      },
      async match(request: string | RequestLike) {
        return entries!.get(typeof request === 'string' ? request : request.url);
      },
      async put(request: string | RequestLike, response: Response) {
        entries!.set(typeof request === 'string' ? request : request.url, response);
      },
    };
  },
  async keys() { return [...cacheData.keys()]; },
  async delete(name: string) {
    deletedCaches.push(name);
    return cacheData.delete(name);
  },
  async match(request: string | RequestLike) {
    const key = typeof request === 'string' ? request : request.url;
    for (const entries of cacheData.values()) {
      const response = entries.get(key);
      if (response) return response;
    }
    return undefined;
  },
};

const selfMock = {
  location: { href: 'https://beatdrop.example/sw.js?v=test-build', origin: 'https://beatdrop.example' },
  clients: {
    claim: async () => { clientsClaimed = true; },
    matchAll: async () => [{ postMessage: (message: unknown) => clientMessages.push(message) }],
  },
  addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  skipWaiting: async () => { skipWaitingCount += 1; },
};

vm.runInNewContext(workerSource, {
  self: selfMock,
  caches: cachesMock,
  fetch: (request: RequestLike) => fetchImpl(request),
  URL,
  Headers,
  Response,
  Promise,
  Set,
  Map,
});

async function dispatch(type: string, event: Record<string, any>) {
  listeners.get(type)?.(event);
  if (event.waitUntilPromise) await event.waitUntilPromise;
  return event.responsePromise ? event.responsePromise : undefined;
}

await dispatch('install', {
  waitUntil(promise: Promise<unknown>) { this.waitUntilPromise = promise; },
});
assert.ok(cacheData.has('beatdrop-shell-test-build'));
assert.ok(cacheData.get('beatdrop-shell-test-build')?.has('/offline.html'));

cacheData.set('beatdrop-pages-old-build', new Map());
cacheData.set('unrelated-app-data', new Map());
await dispatch('activate', {
  waitUntil(promise: Promise<unknown>) { this.waitUntilPromise = promise; },
});
assert.deepEqual(deletedCaches, ['beatdrop-pages-old-build']);
assert.equal(cacheData.has('unrelated-app-data'), true, 'Do not delete other app/site data');
assert.equal(clientsClaimed, true);

await dispatch('message', { data: { type: 'SKIP_WAITING' } });
assert.equal(skipWaitingCount, 1);
await dispatch('activate', {
  waitUntil(promise: Promise<unknown>) { this.waitUntilPromise = promise; },
});
assert.equal(JSON.stringify(clientMessages), JSON.stringify([{ type: 'BEATDROP_UPDATE_ACTIVATED' }]));

let apiResponded = false;
listeners.get('fetch')?.({
  request: { method: 'GET', url: 'https://beatdrop.example/api/daily', mode: 'cors', headers: new Headers() },
  respondWith() { apiResponded = true; },
});
assert.equal(apiResponded, false, 'API responses must remain network-only');

const staticRequest: RequestLike = {
  method: 'GET',
  url: 'https://beatdrop.example/_next/static/chunk.js',
  mode: 'no-cors',
  headers: new Headers(),
};
fetchImpl = async () => new Response('error', { status: 503 });
let responsePromise: Promise<Response> | null = null;
listeners.get('fetch')?.({ request: staticRequest, respondWith(promise: Promise<Response>) { responsePromise = promise; } });
await responsePromise;
assert.equal(cacheData.get('beatdrop-static-test-build')?.size || 0, 0, 'Do not cache errors');

fetchImpl = async () => new Response('personalized', {
  status: 200,
  headers: { 'content-type': 'text/javascript', vary: 'Cookie' },
});
responsePromise = null;
listeners.get('fetch')?.({ request: staticRequest, respondWith(promise: Promise<Response>) { responsePromise = promise; } });
await responsePromise;
assert.equal(cacheData.get('beatdrop-static-test-build')?.size || 0, 0, 'Do not cache Vary: Cookie responses');

fetchImpl = async () => new Response('offline', { status: 200, headers: { 'content-type': 'text/javascript' } });
responsePromise = null;
listeners.get('fetch')?.({ request: staticRequest, respondWith(promise: Promise<Response>) { responsePromise = promise; } });
await responsePromise;
assert.equal(cacheData.get('beatdrop-static-test-build')?.size, 1);

fetchImpl = async () => { throw new Error('offline'); };
const navigationRequest: RequestLike = {
  method: 'GET',
  url: 'https://beatdrop.example/play',
  mode: 'navigate',
  headers: new Headers({ accept: 'text/html' }),
};
responsePromise = null;
listeners.get('fetch')?.({ request: navigationRequest, respondWith(promise: Promise<Response>) { responsePromise = promise; } });
const offlineResponse = await responsePromise;
assert.equal(offlineResponse?.status, 200);
assert.ok((await offlineResponse?.text())?.includes('BeatDrop is offline'));

console.log('PWA manifest, icon assets, worker cache policy, update activation, and offline fallback checks passed.');
