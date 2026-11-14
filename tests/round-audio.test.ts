/**
 * Solo rounds, Daily Challenge and Daily practice must not hand clients the preview URL
 * before the reveal: they get an opaque, encrypted `/api/round/audio?t=…` path instead, and
 * Daily no longer sends audio for rounds that have not started.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-round-audio-test-'));
fs.copyFileSync(path.resolve('data/beatdrop.db'), path.join(tempDir, 'round-audio-test.db'));
process.env.BEATDROP_SQLITE_PATH = path.join(tempDir, 'round-audio-test.db');
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) {
  delete process.env[key];
}
(process.env as Record<string, string>).NODE_ENV = 'test';

const realFetch = globalThis.fetch;
const upstreamCalls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  upstreamCalls.push(url);
  if (!url.startsWith('https://audio-ssl.itunes.apple.com/')) throw new Error(`network disabled (${url})`);
  return new Response('clip', { status: 200, headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '4', 'X-Upstream': url } });
}) as typeof fetch;

const audioToken = await import('../lib/engine/audioToken');
const { verifyRoundToken } = await import('../lib/token');
const { songPool, ensureCatalogLoaded } = await import('../lib/engine/songPool');
const roundEngine = await import('../lib/engine/roundEngine');
const { handleDaily } = await import('../lib/engine/dailyEngine');
const audioRoute = await import('../app/api/round/audio/route');

before(() => ensureCatalogLoaded());
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const LEAK = /itunes\.apple\.com|dzcdn\.net|mzstatic|audio-ssl/;

function mockResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    setHeader() {},
    json(body: unknown) { this.body = body; return this; },
  };
}

function tokenOf(audioUrl: string): string {
  const u = new URL(audioUrl, 'http://localhost');
  assert.equal(u.pathname, '/api/round/audio');
  return u.searchParams.get('t') ?? '';
}

describe('audio token', () => {
  const src = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/x.m4a';

  it('round-trips, hides the URL, and differs every time', () => {
    const a = audioToken.roundAudioPath(src);
    const b = audioToken.roundAudioPath(src);
    assert.notEqual(a, b, 'random IV: same song never gives the same URL');
    assert.ok(!LEAK.test(a));
    assert.equal(audioToken.verifyAudioToken(tokenOf(a)), src);
  });

  it('rejects forged, tampered and expired tokens', () => {
    const t = tokenOf(audioToken.roundAudioPath(src));
    assert.equal(audioToken.verifyAudioToken('ba1.forged'), null);
    assert.equal(audioToken.verifyAudioToken(t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA')), null);
    assert.equal(audioToken.verifyAudioToken(tokenOf(audioToken.roundAudioPath(src, -1))), null, 'expired');
    assert.equal(audioToken.verifyAudioToken(undefined), null);
  });
});

describe('solo round start', () => {
  it('sends an opaque audio path that resolves to the round track', async () => {
    const res = mockResponse();
    await roundEngine.handleStartRound({ query: { category: 'all', difficulty: 'easy', mode: 'standard' }, headers: {} } as never, res as never);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const data = (res.body as { data: { audioUrl: string; roundToken: string } }).data;
    assert.ok(!LEAK.test(JSON.stringify(data)), 'no upstream audio URL in the start response');
    const track = verifyRoundToken(data.roundToken)!.track;
    assert.equal(audioToken.verifyAudioToken(tokenOf(data.audioUrl)), track.previewUrl);
  });

  it('practice rounds (Daily archive) are opaque too', () => {
    const song = Array.from(songPool.values()).find((s) => s.previewUrl?.startsWith('http'))!;
    const round = roundEngine.issuePracticeRound(song, { stages: [1, 2], difficulty: 'easy', category: 'all' });
    assert.ok(!LEAK.test(round.audioUrl));
    assert.equal(audioToken.verifyAudioToken(tokenOf(round.audioUrl)), song.previewUrl);
  });
});

describe('Daily Challenge', () => {
  it('only sends audio for the current round, never the upstream URL', async () => {
    const res = mockResponse();
    await handleDaily({ query: { category: 'all' }, headers: {} } as never, res as never);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const info = (res.body as { data: { currentIndex: number; rounds: { audioUrl: string; roundToken: string }[] } }).data;
    assert.ok(!LEAK.test(JSON.stringify(info)), 'no upstream audio URL anywhere in the Daily payload');
    assert.equal(info.currentIndex, 0);
    const current = info.rounds[0];
    const track = verifyRoundToken(current.roundToken)!.track;
    assert.equal(audioToken.verifyAudioToken(tokenOf(current.audioUrl)), track.previewUrl);
    for (const later of info.rounds.slice(1)) {
      assert.equal(later.audioUrl, '', 'rounds that have not started carry no audio');
    }
  });
});

describe('GET /api/round/audio', () => {
  let ip = 1;
  const get = (query: string) =>
    (audioRoute.GET as (req: Request) => Promise<Response>)(
      new Request(`http://localhost/api/round/audio${query}`, { headers: { 'x-forwarded-for': `10.7.0.${ip++ % 250}` } })
    );

  it('streams a valid token and 404s anything else', async () => {
    const src = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/solo.m4a';
    const path = audioToken.roundAudioPath(src);
    const ok = await get(path.slice(path.indexOf('?')));
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'clip');
    assert.equal(upstreamCalls.at(-1), src);
    assert.equal(ok.headers.get('x-upstream'), null);
    assert.match(ok.headers.get('cache-control') ?? '', /private/);
    for (const [, value] of ok.headers) assert.ok(!LEAK.test(value), `header leaks upstream: ${value}`);

    assert.equal((await get('?t=ba1.forged')).status, 404);
    assert.equal((await get('')).status, 404);
  });
});
