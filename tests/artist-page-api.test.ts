/**
 * Artist page API (SQLite path): the song list matches Artist Mode, no preview/store link
 * leaves the server, audio goes through opaque tokens, and unlinkable ids 404.
 * Offline, throwaway DB copy.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-artist-page-test-'));
fs.copyFileSync(path.resolve('data/beatdrop.db'), path.join(tempDir, 'artist-page-test.db'));
process.env.BEATDROP_SQLITE_PATH = path.join(tempDir, 'artist-page-test.db');
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) {
  delete process.env[key];
}
(process.env as Record<string, string>).NODE_ENV = 'test';
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('network disabled in artist page tests');
}) as typeof fetch;

const { songPool, ensureCatalogLoaded } = await import('../lib/engine/songPool');
const { verifyAudioToken } = await import('../lib/engine/audioToken');
const { matchesArtistFilter } = await import('../lib/engine/roundEngine');
const { isJunkTrack } = await import('../lib/itunes');
const artistRoute = await import('../app/api/artists/[id]/route');
const previewRoute = await import('../app/api/artists/preview/route');
const { getMergedArtists } = await import('../lib/engine/artistRoutes');

ensureCatalogLoaded();
// Ids come from the library (a custom-artist row can supersede a curated id), so look them up.
async function artistIdFor(name: string): Promise<string> {
  const found = (await getMergedArtists()).find((a) => a.name === name);
  assert.ok(found, `${name} is in the library`);
  return found.id;
}
const BODYSLAM = await artistIdFor('Bodyslam');
const TAYLOR = await artistIdFor('Taylor Swift');

type ApiSong = { id: string; audioUrl: string; isCollab: boolean; title: string };
type ApiBody = { code: number; data?: { artist: { id: string; name: string; trackCount: number }; songs: ApiSong[] } };

let ip = 1;
async function getArtist(id: string): Promise<{ status: number; text: string; body: ApiBody }> {
  const res = await artistRoute.GET(
    new Request(`http://localhost/api/artists/${encodeURIComponent(id)}`, { headers: { 'x-forwarded-for': `10.7.0.${ip++}` } }),
    { params: Promise.resolve({ id }) }
  );
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as ApiBody };
}

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/artists/[id]', () => {
  it('returns the artist and the songs Artist Mode can draw, newest tokens, no raw links', async () => {
    const { status, text, body } = await getArtist(BODYSLAM);
    assert.equal(status, 200);
    assert.equal(body.code, 0);
    assert.equal(body.data?.artist.name, 'Bodyslam');
    const songs = body.data!.songs;
    assert.ok(songs.length > 0, 'Bodyslam has songs in the seed catalog');
    assert.equal(body.data!.artist.trackCount, songs.length);

    assert.ok(!/previewUrl|trackViewUrl/.test(text), 'no preview/store link fields');
    assert.ok(!/audio-ssl\.itunes|\.m4a|\.mp3|dzcdn|cdns-preview/i.test(text), 'no upstream audio hosts');

    ensureCatalogLoaded();
    for (const s of songs) {
      assert.match(s.audioUrl, /^\/api\/artists\/preview\?t=ba1\./);
      const source = verifyAudioToken(new URL(s.audioUrl, 'http://localhost').searchParams.get('t'));
      const poolSong = songPool.get(s.id);
      assert.ok(poolSong, `song ${s.id} comes from the catalog`);
      assert.equal(source, poolSong!.previewUrl, 'token decodes to that song’s preview');
      assert.ok(matchesArtistFilter(poolSong!, 'Bodyslam'), `${s.title} is a Bodyslam song per Artist Mode`);
      assert.ok(!isJunkTrack(poolSong!.title, poolSong!.albumName, poolSong!.artistName));
    }
  });

  it('gives each request fresh audio tokens (no stable URL to match a round against)', async () => {
    const a = (await getArtist(BODYSLAM)).body.data!.songs[0];
    const b = (await getArtist(BODYSLAM)).body.data!.songs.find((s) => s.id === a.id)!;
    assert.notEqual(a.audioUrl, b.audioUrl);
  });

  it('flags collaborations from track–artist credits', async () => {
    const { body } = await getArtist(TAYLOR);
    const songs = body.data?.songs ?? [];
    for (const s of songs) {
      const credits = songPool.get(s.id)?.artists ?? [];
      if (credits.length > 0) {
        assert.equal(s.isCollab, new Set(credits.map((c) => c.artistId)).size > 1, s.title);
      }
    }
  });

  it('drops songs without a preview', async () => {
    ensureCatalogLoaded();
    const sample = Array.from(songPool.values()).find((s) => matchesArtistFilter(s, 'Bodyslam'))!;
    const noPreview = { ...sample, id: 'test-no-preview', title: 'Silent Track Test', previewUrl: '' };
    songPool.set(noPreview.id, noPreview);
    try {
      const { body } = await getArtist(BODYSLAM);
      assert.ok(!body.data!.songs.some((s) => s.id === 'test-no-preview'));
    } finally {
      songPool.delete(noPreview.id);
    }
  });

  it('404s for discovered, unknown and empty ids', async () => {
    assert.equal((await getArtist('discovered-abc12345')).status, 404);
    assert.equal((await getArtist('artist_does_not_exist_zzz')).status, 404);
    assert.equal((await getArtist('')).status, 404);
  });
});

describe('GET /api/artists/preview', () => {
  it('404s for a missing or forged token', async () => {
    for (const q of ['', '?t=', '?t=ba1.AAAA.BBBB.CCCC', '?t=https://audio-ssl.itunes.apple.com/x.m4a']) {
      const res = await previewRoute.GET(new Request(`http://localhost/api/artists/preview${q}`));
      assert.equal(res.status, 404, q);
    }
  });
});
