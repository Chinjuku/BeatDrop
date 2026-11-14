/**
 * Live rooms must not hand clients anything that identifies the song before the reveal:
 * the room view carries an opaque, round-scoped audio path, the audio route streams the clip
 * server-side, and autocomplete no longer returns preview URLs.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-room-audio-test-'));
fs.copyFileSync(path.resolve('data/beatdrop.db'), path.join(tempDir, 'room-audio-test.db'));
process.env.BEATDROP_SQLITE_PATH = path.join(tempDir, 'room-audio-test.db');
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) {
  delete process.env[key];
}
(process.env as Record<string, string>).NODE_ENV = 'test';

const APPLE_URL = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/secret-song-0.m4a';
const upstreamCalls: { url: string; range: string | null }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const range = new Headers(init?.headers).get('range');
  upstreamCalls.push({ url, range });
  if (!url.startsWith('https://audio-ssl.itunes.apple.com/')) throw new Error(`unexpected fetch ${url}`);
  if (range) {
    return new Response('bc', {
      status: 206,
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '2', 'Content-Range': 'bytes 1-2/4', 'X-Upstream': url },
    });
  }
  return new Response('abcd', { status: 200, headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '4', 'X-Upstream': url } });
}) as typeof fetch;

const { ROOM_LIMITS, DEFAULT_ROOM_SETTINGS } = await import('../shared/roomTypes');
const timeline = await import('../lib/rooms/timeline');
const roomAudio = await import('../lib/rooms/audio');
const { getRoomStore } = await import('../lib/rooms/store');
const audioRoute = await import('../app/api/rooms/[code]/audio/route');
const autocompleteRoute = await import('../app/api/autocomplete/route');

type RoomState = import('../lib/rooms/timeline').RoomState;

before(async () => {
  const { ensureCatalogLoaded } = await import('../lib/engine/songPool');
  ensureCatalogLoaded();
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const C = ROOM_LIMITS.countdownMs;
const A = DEFAULT_ROOM_SETTINGS.answerSeconds * 1000;
const R = ROOM_LIMITS.revealMs;

function baseRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'AUDZZ',
    version: 1,
    createdAt: 0,
    hostId: 'h',
    settings: { ...DEFAULT_ROOM_SETTINGS },
    players: [
      { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
      { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
    ],
    status: 'playing',
    startedAt: 1_000,
    rounds: [0, 1].map((i) => ({
      songId: `song-${i}`,
      audioUrl: APPLE_URL.replace('-0', `-${i}`),
      reveal: { id: `song-${i}`, title: `Song ${i}`, artistName: 'Artist' },
      answers: {},
    })),
    ...overrides,
  };
}

function keyFrom(audioUrl: string): { round: string; k: string } {
  const u = new URL(audioUrl, 'http://localhost');
  return { round: u.searchParams.get('round') ?? '', k: u.searchParams.get('k') ?? '' };
}

describe('room view audio URL', () => {
  it('is an opaque same-origin path that never carries the preview URL or song id', () => {
    const room = baseRoom();
    for (const at of [1_000 + 10, 1_000 + C + 10, 1_000 + C + A + 10]) {
      const view = timeline.buildView(room, 'p', at);
      assert.ok(view.audioUrl, 'clients still get a clip to preload');
      assert.match(view.audioUrl!, /^\/api\/rooms\/AUDZZ\/audio\?round=0&k=[\w-]+$/);
      const json = JSON.stringify(view.phase === 'reveal' ? { ...view, reveal: undefined } : view);
      assert.ok(!json.includes('itunes.apple.com'), 'no upstream audio host in the view');
      assert.ok(!json.includes('song-0'), 'no song id in the view');
    }
  });

  it('changes per round and per game (rematch with the same code)', () => {
    const room = baseRoom();
    const first = timeline.buildView(room, 'p', 1_000 + 10).audioUrl!;
    const second = timeline.buildView(room, 'p', 1_000 + C + A + R + 10).audioUrl!;
    assert.notEqual(first, second);
    const rematch = timeline.buildView(baseRoom({ startedAt: 50_000 }), 'p', 50_000 + 10).audioUrl!;
    assert.notEqual(first, rematch);
  });
});

describe('resolveRoomAudio', () => {
  it('serves the current round and earlier ones, never a future round', () => {
    const room = baseRoom();
    const r0 = keyFrom(roomAudio.roomAudioPath(room, 0));
    const r1 = keyFrom(roomAudio.roomAudioPath(room, 1));
    const ok = roomAudio.resolveRoomAudio(room, r0.round, r0.k, 1_000 + 10);
    assert.deepEqual(ok, { ok: true, sourceUrl: room.rounds[0].audioUrl });
    assert.equal(roomAudio.resolveRoomAudio(room, r1.round, r1.k, 1_000 + 10).ok, false, 'next round is not playable yet');
    assert.equal(roomAudio.resolveRoomAudio(room, r1.round, r1.k, 1_000 + C + A + R + 10).ok, true);
    assert.equal(roomAudio.resolveRoomAudio(room, r0.round, r0.k, 1_000 + C + A + R + 10).ok, true, 'past rounds stay playable');
  });

  it('rejects forged keys, swapped rounds, lobbies and stale games', () => {
    const room = baseRoom();
    const r0 = keyFrom(roomAudio.roomAudioPath(room, 0));
    const now = 1_000 + C + A + R + 10;
    assert.equal(roomAudio.resolveRoomAudio(room, r0.round, 'forged', now).ok, false);
    assert.equal(roomAudio.resolveRoomAudio(room, '1', r0.k, now).ok, false, 'a key only opens its own round');
    assert.equal(roomAudio.resolveRoomAudio(room, 'x', r0.k, now).ok, false);
    assert.equal(roomAudio.resolveRoomAudio(room, '-1', r0.k, now).ok, false);
    assert.equal(roomAudio.resolveRoomAudio(baseRoom({ status: 'lobby' }), r0.round, r0.k, now).ok, false);
    assert.equal(roomAudio.resolveRoomAudio(baseRoom({ startedAt: 900 }), r0.round, r0.k, now).ok, false, 'old game key');
  });
});

describe('GET /api/rooms/[code]/audio', () => {
  type Handler = (req: Request, ctx: { params: Promise<{ code: string }> }) => Promise<Response>;
  let ip = 1;
  async function get(code: string, query: string, headers: Record<string, string> = {}) {
    return (audioRoute.GET as Handler)(
      new Request(`http://localhost/api/rooms/${code}/audio${query}`, {
        headers: { 'x-forwarded-for': `10.9.0.${ip++ % 250}`, ...headers },
      }),
      { params: Promise.resolve({ code }) }
    );
  }

  it('streams the clip without exposing where it came from, with range support', async () => {
    const now = Date.now();
    const room = baseRoom({ code: 'AUDZQ', startedAt: now - 10 });
    assert.ok(await getRoomStore()!.create(room));
    const audioUrl = timeline.buildView(room, 'p', now).audioUrl!;
    const query = audioUrl.slice(audioUrl.indexOf('?'));

    const full = await get('AUDZQ', query);
    assert.equal(full.status, 200);
    assert.equal(await full.text(), 'abcd');
    assert.equal(full.headers.get('content-type'), 'audio/mp4');
    assert.match(full.headers.get('cache-control') ?? '', /private/);
    assert.equal(full.headers.get('x-upstream'), null, 'upstream headers are not passed through');
    for (const [, value] of full.headers) assert.ok(!value.includes('apple.com'), `header leaks upstream: ${value}`);

    const partial = await get('AUDZQ', query, { range: 'bytes=1-2' });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 1-2/4');
    assert.equal(await partial.text(), 'bc');
    assert.equal(upstreamCalls.at(-1)?.range, 'bytes=1-2', 'range is forwarded upstream');

    assert.equal((await get('AUDZQ', '?round=0&k=forged')).status, 404);
    assert.equal((await get('ZZZZZ', query)).status, 404);
    const next = keyFrom(roomAudio.roomAudioPath(room, 1));
    assert.equal((await get('AUDZQ', `?round=1&k=${next.k}`)).status, 404, 'next round is locked');
  });
});

describe('autocomplete', () => {
  it('does not return preview URLs', async () => {
    const res = await (autocompleteRoute.GET as (req: Request) => Promise<Response>)(
      new Request('http://localhost/api/autocomplete?q=a&category=all&limit=10', {
        headers: { 'x-forwarded-for': '10.8.0.1' },
      })
    );
    const json = await res.json();
    assert.equal(json.code, 0);
    assert.ok(Array.isArray(json.data) && json.data.length > 0, 'catalog has suggestions');
    for (const s of json.data) {
      assert.equal('previewUrl' in s, false, `suggestion ${s.id} leaks previewUrl`);
      assert.ok(s.id && s.title && s.artistName, 'still carries what the guess box needs');
    }
  });
});
