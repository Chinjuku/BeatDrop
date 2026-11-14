/**
 * Expired Deezer preview links: strict URL validation, play-time re-signing, proxy routing.
 * No network: every upstream call goes through a fake `fetch`.
 *
 * Run: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedAppleAudioUrl,
  isDeezerPreviewUrl,
  parseDeezerPreviewUrl,
  proxiedAudioUrl,
} from '../lib/audioProxyUtils';
import { createDeezerPreviewResolver, deezerTrackIdFromSongId } from '../lib/engine/deezerPreview';
import type { Song } from '../shared/types';

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const KEY = 'aeb58f2f63ee57fb9c47cbe8fb5ccdaa';

function deezerUrl(expSeconds: number, key = KEY, host = 'cdnt-preview.dzcdn.net'): string {
  return (
    `https://${host}/api/1/1/a/e/b/0/${key}.mp3?hdnea=exp=${expSeconds}` +
    `~acl=/api/1/1/a/e/b/0/${key}.mp3*~data=user_id=0,application_id=42~hmac=abc123`
  );
}

const EXPIRED = deezerUrl(Math.floor(Date.UTC(2026, 10, 1) / 1000));
const FRESH = deezerUrl(Math.floor(NOW / 1000) + 900);

function song(id: string, previewUrl: string): Song {
  return {
    id,
    title: 'Without Me',
    artistName: 'Eminem',
    albumName: 'Single',
    releaseYear: 2002,
    genre: 'Hip-Hop',
    category: 'international',
    previewUrl,
    artworkUrl: '',
    popularityScore: 50,
  } as Song;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeResolver(opts: {
  local?: Song[];
  remote?: (key: string) => Promise<string | null>;
  api?: (url: string) => Response | Promise<Response>;
}) {
  const calls: string[] = [];
  const resolver = createDeezerPreviewResolver({
    getLocalSongs: () => opts.local ?? [],
    findRemoteSongId: opts.remote ?? (async () => null),
    fetch: async (url) => {
      calls.push(String(url));
      if (!opts.api) throw new Error('unexpected fetch');
      return opts.api(String(url));
    },
    now: () => NOW,
  });
  return { resolver, calls };
}

describe('parseDeezerPreviewUrl', () => {
  it('reads the stable file key and the signed expiry', () => {
    const ref = parseDeezerPreviewUrl(EXPIRED);
    assert.deepEqual(ref, { fileKey: KEY, expiresAtMs: Date.UTC(2026, 10, 1) });
  });

  it('accepts other Deezer preview CDN hosts', () => {
    assert.ok(isDeezerPreviewUrl(deezerUrl(1, KEY, 'cdns-preview-e.dzcdn.net')));
  });

  it('rejects anything that is not a Deezer preview link', () => {
    for (const bad of [
      deezerUrl(1).replace('https:', 'http:'),
      deezerUrl(1, KEY, 'evil.dzcdn.net.attacker.com'),
      deezerUrl(1, KEY, 'cdnt-preview.dzcdn.net:8443'),
      deezerUrl(1).replace('https://', 'https://user:pw@'),
      `https://cdnt-preview.dzcdn.net/api/1/1/a/e/b/0/${KEY}.mp3/../../../etc/passwd`,
      'https://cdnt-preview.dzcdn.net/other/path.mp3',
      'https://api.deezer.com/track/1',
      'https://169.254.169.254/latest/meta-data/',
      'not-a-url',
    ]) {
      assert.equal(parseDeezerPreviewUrl(bad), null, bad);
    }
  });

  it('keeps the Apple allow-list unchanged (Deezer is not an Apple host)', () => {
    assert.equal(isAllowedAppleAudioUrl(EXPIRED), false);
    assert.equal(isAllowedAppleAudioUrl('https://audio-ssl.itunes.apple.com/x.m4a'), true);
  });
});

describe('proxiedAudioUrl', () => {
  it('routes Deezer links to the re-signing route and Apple links to the edge proxy', () => {
    assert.ok(proxiedAudioUrl(EXPIRED).startsWith('/api/proxy/deezer?url='));
    assert.ok(proxiedAudioUrl('https://audio-ssl.itunes.apple.com/x.m4a').startsWith('/api/proxy/audio?url='));
  });
});

describe('deezerTrackIdFromSongId', () => {
  it('only accepts dz_ numeric ids', () => {
    assert.equal(deezerTrackIdFromSongId('dz_916424'), '916424');
    assert.equal(deezerTrackIdFromSongId('916424'), null);
    assert.equal(deezerTrackIdFromSongId('dz_1/../2'), null);
  });
});

describe('createDeezerPreviewResolver', () => {
  it('passes a still-valid link through without any network call', async () => {
    const { resolver, calls } = makeResolver({});
    assert.deepEqual(await resolver.resolve(FRESH), { ok: true, url: FRESH, refreshed: false });
    assert.equal(calls.length, 0);
  });

  it('re-signs an expired link via the local catalog and caches the result', async () => {
    const { resolver, calls } = makeResolver({
      local: [song('123', 'https://audio-ssl.itunes.apple.com/x.m4a'), song('dz_916424', EXPIRED)],
      api: () => jsonResponse({ id: 916424, preview: FRESH }),
    });
    assert.deepEqual(await resolver.resolve(EXPIRED), { ok: true, url: FRESH, refreshed: true });
    assert.deepEqual(await resolver.resolve(EXPIRED), { ok: true, url: FRESH, refreshed: true });
    assert.deepEqual(calls, ['https://api.deezer.com/track/916424']);
  });

  it('falls back to the cloud catalog when the song is not loaded locally', async () => {
    const seen: string[] = [];
    const { resolver } = makeResolver({
      remote: async (key) => {
        seen.push(key);
        return 'dz_916424';
      },
      api: () => jsonResponse({ id: 916424, preview: FRESH }),
    });
    const result = await resolver.resolve(EXPIRED);
    assert.equal(result.ok, true);
    assert.deepEqual(seen, [KEY]);
  });

  it('reports an unknown track instead of guessing', async () => {
    const { resolver, calls } = makeResolver({});
    assert.deepEqual(await resolver.resolve(EXPIRED), { ok: false, reason: 'unknown-track' });
    assert.equal(calls.length, 0);
  });

  it('rejects Deezer API answers that are errors, for another track, off-host, or already expired', async () => {
    for (const body of [
      { error: { type: 'DataException', message: 'no data', code: 800 } },
      { id: 999, preview: FRESH },
      { id: 916424, preview: 'https://evil.example.com/a.mp3' },
      { id: 916424, preview: EXPIRED },
      { id: 916424, preview: '' },
    ]) {
      const { resolver } = makeResolver({
        local: [song('dz_916424', EXPIRED)],
        api: () => jsonResponse(body),
      });
      assert.deepEqual(await resolver.resolve(EXPIRED), { ok: false, reason: 'upstream-unavailable' }, JSON.stringify(body));
    }
  });

  it('survives upstream HTTP and network failures', async () => {
    for (const api of [() => jsonResponse({}, 503), () => Promise.reject(new Error('offline'))]) {
      const { resolver } = makeResolver({ local: [song('dz_916424', EXPIRED)], api });
      assert.deepEqual(await resolver.resolve(EXPIRED), { ok: false, reason: 'upstream-unavailable' });
    }
  });

  it('shares one upstream request between concurrent plays of the same track', async () => {
    const { resolver, calls } = makeResolver({
      local: [song('dz_916424', EXPIRED)],
      api: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return jsonResponse({ id: 916424, preview: FRESH });
      },
    });
    const results = await Promise.all([resolver.resolve(EXPIRED), resolver.resolve(EXPIRED), resolver.resolve(EXPIRED)]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(calls.length, 1);
  });

  it('rejects non-Deezer input without touching the catalog', async () => {
    const { resolver } = makeResolver({});
    assert.deepEqual(await resolver.resolve('https://audio-ssl.itunes.apple.com/x.m4a'), {
      ok: false,
      reason: 'invalid-url',
    });
  });
});

describe('edge audio proxy', () => {
  it('redirects Deezer links to the re-signing route instead of rejecting them', async () => {
    const proxy = await import('../app/api/proxy/audio/route');
    const req = { nextUrl: new URL(`http://localhost:3000/api/proxy/audio?url=${encodeURIComponent(EXPIRED)}`) };
    for (const handler of [proxy.GET, proxy.HEAD]) {
      const res = await handler(req as never);
      assert.equal(res.status, 307);
      const location = new URL(res.headers.get('location') || '');
      assert.equal(location.pathname, '/api/proxy/deezer');
      assert.equal(location.searchParams.get('url'), EXPIRED);
    }
  });

  it('still rejects unknown hosts', async () => {
    const proxy = await import('../app/api/proxy/audio/route');
    const req = { nextUrl: new URL('http://localhost:3000/api/proxy/audio?url=https%3A%2F%2Fevil.com%2Fa.mp3') };
    assert.equal((await proxy.GET(req as never)).status, 400);
  });
});
