/**
 * API contract tests: call the real Route Handler modules with Web `Request`s against a
 * throwaway copy of the SQLite catalog. Never touches Supabase, Upstash or iTunes.
 *
 * Run: npm test
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-api-test-'));
const dbCopy = path.join(tempDir, 'api-test.db');
fs.copyFileSync(path.resolve('data/beatdrop.db'), dbCopy);
process.env.BEATDROP_SQLITE_PATH = dbCopy;
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
// Force offline mode: these suites must never reach a cloud service.
for (const key of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
]) {
  delete process.env[key];
}
process.env.ADMIN_API_KEY = 'test-admin-key';
(process.env as Record<string, string>).NODE_ENV = 'test';

const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('network disabled in API contract tests');
}) as typeof fetch;

type Handler = (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;
type RouteModule = Partial<Record<'GET' | 'POST' | 'DELETE', Handler>>;

/** Path → Route Handler module that serves it (mirrors app/api). */
const ROUTES: Array<{ pattern: RegExp; module: string; params?: (m: RegExpMatchArray) => Record<string, string> }> = [
  { pattern: /^\/api\/songs$/, module: '../app/api/songs/route' },
  { pattern: /^\/api\/autocomplete$/, module: '../app/api/autocomplete/route' },
  { pattern: /^\/api\/admin\/verify$/, module: '../app/api/admin/verify/route' },
  { pattern: /^\/api\/round\/start$/, module: '../app/api/round/start/route' },
  { pattern: /^\/api\/round\/guess$/, module: '../app/api/round/guess/route' },
  { pattern: /^\/api\/round\/skip$/, module: '../app/api/round/skip/route' },
  { pattern: /^\/api\/rounds\/start$/, module: '../app/api/rounds/start/route' },
  { pattern: /^\/api\/songspot\/round$/, module: '../app/api/songspot/round/route' },
  { pattern: /^\/api\/songspot\/search$/, module: '../app/api/songspot/search/route' },
  { pattern: /^\/api\/songspot\/guess$/, module: '../app/api/songspot/guess/route' },
  { pattern: /^\/api\/songspot\/skip$/, module: '../app/api/songspot/skip/route' },
  { pattern: /^\/api\/daily$/, module: '../app/api/daily/route' },
  { pattern: /^\/api\/daily\/round$/, module: '../app/api/daily/round/route' },
  { pattern: /^\/api\/daily\/expire$/, module: '../app/api/daily/expire/route' },
  { pattern: /^\/api\/daily\/submit$/, module: '../app/api/daily/submit/route' },
  { pattern: /^\/api\/daily\/leaderboard$/, module: '../app/api/daily/leaderboard/route' },
  { pattern: /^\/api\/leaderboard$/, module: '../app/api/leaderboard/route' },
  { pattern: /^\/api\/artists$/, module: '../app/api/artists/route' },
  { pattern: /^\/api\/artists\/([^/]+)$/, module: '../app/api/artists/[id]/route', params: (m) => ({ id: m[1] }) },
];

let ipCounter = 1;
/** Each call gets its own client IP unless one is given, so the shared limiter never trips by accident. */
async function call(
  method: 'GET' | 'POST' | 'DELETE',
  pathAndQuery: string,
  init: { body?: unknown; headers?: Record<string, string>; ip?: string } = {}
): Promise<{ status: number; headers: Headers; json: any }> {
  const url = new URL(pathAndQuery, 'http://localhost:3000');
  const route = ROUTES.find((r) => r.pattern.test(url.pathname));
  assert.ok(route, `no route registered for ${url.pathname}`);
  const match = url.pathname.match(route.pattern)!;
  const mod = (await import(route.module)) as RouteModule;
  const handler = mod[method];
  assert.ok(handler, `${method} not exported for ${url.pathname}`);

  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', init.ip ?? `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const req = new Request(url, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const res = await handler(req, { params: Promise.resolve(route.params ? route.params(match) : {}) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const { ensureCatalogLoaded } = await import('../lib/engine/songPool');
  ensureCatalogLoaded();
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('rounds', () => {
  it('GET /api/songs starts a round with a token and rate-limit headers', async () => {
    const res = await call('GET', '/api/songs?category=all&difficulty=medium');
    assert.equal(res.status, 200);
    assert.equal(res.json.code, 0);
    assert.equal(typeof res.json.data.roundToken, 'string');
    assert.ok(Array.isArray(res.json.data.stages));
    assert.ok(res.headers.get('x-ratelimit-limit'), 'round limiter headers present');
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  });

  it('POST /api/round/start and legacy aliases start rounds', async () => {
    for (const p of ['/api/round/start?category=all', '/api/rounds/start?category=all']) {
      const res = await call('POST', p, { body: {} });
      assert.equal(res.status, 200, p);
      assert.equal(typeof res.json.data.roundToken, 'string', p);
    }
    const legacy = await call('GET', '/api/songspot/round?category=all');
    assert.equal(legacy.status, 200);
  });

  it('wrong guess, then skip, then give up', async () => {
    const start = await call('GET', '/api/songs?category=all&difficulty=medium');
    const token = start.json.data.roundToken as string;
    await wait(60);
    const guess = await call('POST', '/api/round/guess', {
      body: { roundToken: token, candidateTrackId: 'definitely-not-a-track', candidateTitle: 'zzzz no match' },
    });
    assert.equal(guess.status, 200);
    assert.equal(guess.json.code, 0);
    assert.equal(guess.json.data.outcome, 'active');
    assert.equal(guess.json.data.stage, 1);
    assert.equal(guess.json.data.mistakes, 1);

    const skip = await call('POST', '/api/round/skip', { body: { roundToken: guess.json.data.roundToken } });
    assert.equal(skip.status, 200);
    assert.equal(skip.json.data.outcome, 'active');
    assert.equal(skip.json.data.stage, 2);

    const giveUp = await call('POST', '/api/round/skip', { body: { roundToken: skip.json.data.roundToken, giveUp: true } });
    assert.equal(giveUp.status, 200);
    assert.equal(giveUp.json.data.outcome, 'failed');
    assert.ok(giveUp.json.data.reveal?.id, 'give up reveals the song');

    const replay = await call('POST', '/api/round/skip', { body: { roundToken: skip.json.data.roundToken } });
    assert.equal(replay.status, 400, 'a used token cannot be replayed');
  });

  it('rejects malformed guess and skip bodies with 400', async () => {
    assert.equal((await call('POST', '/api/round/guess', { body: {} })).status, 400);
    assert.equal((await call('POST', '/api/round/skip', { body: { roundToken: 'nope' } })).status, 400);
    assert.equal((await call('POST', '/api/songspot/guess', { body: {} })).status, 400);
    assert.equal((await call('POST', '/api/songspot/skip', { body: {} })).status, 400);
  });

  it('round limiter returns 429 with Retry-After after 40 starts from one IP', async () => {
    const ip = '203.0.113.77';
    let last: Awaited<ReturnType<typeof call>> | null = null;
    for (let i = 0; i < 41; i++) last = await call('GET', '/api/songs?category=all', { ip });
    assert.equal(last!.status, 429);
    assert.equal(last!.json.code, 429);
    assert.ok(Number(last!.headers.get('retry-after')) >= 1);
  });

  it('admin key bypasses the round limiter', async () => {
    const ip = '203.0.113.77';
    const res = await call('GET', '/api/songs?category=all', { ip, headers: { 'x-admin-key': 'test-admin-key' } });
    assert.equal(res.status, 200);
  });
});

describe('artist mode', () => {
  it('keeps serving an artist that is only in the cloud catalog, round after round', async () => {
    // Artists added through Supabase are not in this instance's local library list; their
    // songs still reach songPool (cloud preload). Every round must stay on that artist.
    const { songPool } = await import('../lib/engine/songPool');
    const name = 'Cloud Only Singer';
    for (let i = 0; i < 12; i++) {
      songPool.set(`cloud-only-${i}`, {
        id: `cloud-only-${i}`,
        title: `Cloud Song ${i}`,
        artistId: 'cloud-only-singer',
        artistName: name,
        albumName: 'Cloud Album',
        releaseYear: 2024,
        genre: 'Pop',
        category: 'thai',
        previewUrl: `https://audio.test/cloud-${i}.m4a`,
        artworkUrl: '',
        popularityScore: 50,
      });
    }
    const query = new URLSearchParams({ category: 'all', difficulty: 'easy', mode: 'artist', artist: name });
    for (let round = 0; round < 4; round++) {
      const start = await call('GET', `/api/songs?${query}`);
      assert.equal(start.status, 200, `round ${round + 1} should start`);
      await wait(60);
      const reveal = await call('POST', '/api/round/skip', { body: { roundToken: start.json.data.roundToken, giveUp: true } });
      assert.equal(reveal.status, 200);
      assert.equal(reveal.json.data.reveal.artistName, name, `round ${round + 1} must be by ${name}`);
    }
  });
});

describe('autocomplete', () => {
  it('GET /api/autocomplete returns a list', async () => {
    const res = await call('GET', '/api/autocomplete?q=a&category=all&limit=5');
    assert.equal(res.status, 200);
    assert.equal(res.json.code, 0);
    assert.ok(Array.isArray(res.json.data));
    const legacy = await call('GET', '/api/songspot/search?q=a&category=all&limit=5');
    assert.equal(legacy.status, 200);
  });
});

describe('admin', () => {
  it('POST /api/admin/verify accepts the key and rejects others', async () => {
    assert.equal((await call('POST', '/api/admin/verify', { body: { adminKey: 'test-admin-key' } })).status, 200);
    const bad = await call('POST', '/api/admin/verify', { body: { adminKey: 'wrong' } });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.code, 403);
  });

  it('DELETE /api/artists/:id requires the admin key', async () => {
    const denied = await call('DELETE', '/api/artists/test-artist-id');
    assert.equal(denied.status, 403);
    const ok = await call('DELETE', '/api/artists/test-artist-id', { headers: { 'x-admin-key': 'test-admin-key' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.removedId, 'test-artist-id');
  });
});

describe('artists', () => {
  it('GET /api/artists lists artists', async () => {
    const res = await call('GET', '/api/artists?category=all');
    assert.equal(res.status, 200);
    assert.equal(res.json.code, 0);
    assert.ok(Array.isArray(res.json.data));
  });
});

describe('daily challenge', () => {
  it('GET /api/daily sets the player cookie and is stable for that player', async () => {
    const first = await call('GET', '/api/daily?category=all');
    assert.equal(first.status, 200);
    assert.equal(first.json.code, 0);
    const setCookie = first.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /beatdrop_daily_player=/);
    assert.match(setCookie, /HttpOnly/i);

    const cookie = setCookie.split(';')[0];
    const again = await call('GET', '/api/daily?category=all', { headers: { cookie } });
    assert.equal(again.status, 200);
    assert.equal(again.json.data.dateKey, first.json.data.dateKey);
  });

  it('rejects bad daily round / expire / submit requests', async () => {
    assert.equal((await call('POST', '/api/daily/round', { body: {} })).status, 400);
    assert.equal((await call('POST', '/api/daily/expire', { body: { roundToken: '' } })).status >= 400, true);
    assert.equal((await call('POST', '/api/daily/submit', { body: {} })).status, 400);
  });

  it('GET /api/daily/leaderboard returns a list', async () => {
    const res = await call('GET', '/api/daily/leaderboard?category=all');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.data));
  });
});

describe('leaderboard', () => {
  it('GET returns a sorted list and POST validates', async () => {
    const res = await call('GET', '/api/leaderboard?category=all');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.data));
    assert.equal((await call('POST', '/api/leaderboard', { body: {} })).status, 400);
  });
});
