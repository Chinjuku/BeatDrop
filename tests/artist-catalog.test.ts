/**
 * Artist Mode catalog coverage: an artist's songs must come from the cloud catalog even when the
 * bundled SQLite seed already holds a few loosely related tracks.
 *
 * Reproduces the BUS bug: the seed has no BUS songs, only two features by members
 * ("… feat. PEEMWASU OF BUS", "… feat. KHUNPOL OF BUS"). Those used to count as BUS songs, so the
 * cloud catalog (where BUS's own songs live) was never queried and Artist Mode showed 0–2 songs.
 *
 * Runs against a throwaway copy of the SQLite catalog and a fake Supabase REST endpoint.
 * No real network or cloud service is touched.
 *
 * Run: npm test
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-artist-catalog-test-'));
const dbCopy = path.join(tempDir, 'artist-catalog-test.db');
fs.copyFileSync(path.resolve('data/beatdrop.db'), dbCopy);
process.env.BEATDROP_SQLITE_PATH = dbCopy;
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'VERCEL',
  'DB_LOCAL',
  'SUPABASE_ANON_KEY',
]) {
  delete process.env[key];
}
// A fake cloud catalog: every request below is answered by `fakeFetch`, never by the network.
process.env.SUPABASE_URL = 'https://fake-project.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
(process.env as Record<string, string>).NODE_ENV = 'test';

interface CloudRow {
  id: string;
  title: string;
  artist_id: string | null;
  artist_name: string;
  album_name: string | null;
  release_year: number | null;
  release_date: string | null;
  genre: string | null;
  category: 'thai' | 'international';
  preview_url: string;
  artwork_url: string | null;
  track_view_url: string | null;
  popularity_score: number | null;
}

function cloudRow(id: string, title: string, artistName: string): CloudRow {
  return {
    id,
    title,
    artist_id: null,
    artist_name: artistName,
    album_name: 'Single',
    release_year: 2024,
    release_date: null,
    genre: 'T-Pop',
    category: 'thai',
    preview_url: `https://audio-ssl.itunes.apple.com/itunes-assets/fake/${id}.m4a`,
    artwork_url: null,
    track_view_url: null,
    popularity_score: 80,
  };
}

const BUS_CLOUD_ROWS: CloudRow[] = [
  ...Array.from({ length: 22 }, (_, i) => cloudRow(`9100000${i + 10}`, `BUS Song ${i + 1}`, 'BUS')),
  ...Array.from({ length: 4 }, (_, i) => cloudRow(`9200000${i + 10}`, `BUS & DICE Song ${i + 1}`, 'BUS & DICE')),
  cloudRow('930000010', 'Member Solo', 'MARCKRIS OF BUS'),
];
// Lipta: the seed only has collaborations / features, the cloud has the full solo catalog.
const LIPTA_CLOUD_ROWS: CloudRow[] = Array.from({ length: 12 }, (_, i) =>
  cloudRow(`9400000${i + 10}`, `Lipta Song ${i + 1}`, 'Lipta')
);

const cloudSongQueries: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = decodeURIComponent(String(input instanceof Request ? input.url : input));
  if (!url.startsWith(process.env.SUPABASE_URL!)) {
    throw new Error(`network disabled in artist catalog tests: ${url}`);
  }
  const ilike = url.match(/\/rest\/v1\/songs\?artist_name=ilike\.\*([^*]+)\*/);
  if (ilike) {
    cloudSongQueries.push(ilike[1]);
    const needle = ilike[1].toLowerCase();
    const rows = [...BUS_CLOUD_ROWS, ...LIPTA_CLOUD_ROWS].filter((r) =>
      r.artist_name.toLowerCase().includes(needle)
    );
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  // Any other cloud call (writes, counts, optional tables) succeeds with nothing to report.
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const { checkArtistStrictMatch } = await import('../lib/itunes');
const songPoolModule = await import('../lib/engine/songPool');
const { songPool } = songPoolModule;
const { matchesArtistFilter, handleAutocomplete } = await import('../lib/engine/roundEngine');

type Json = { code: number; data: Array<{ id: string; title: string; artistName: string }> };

async function autocomplete(query: Record<string, string>): Promise<Json> {
  let payload: unknown = null;
  const res = {
    status() {
      return res;
    },
    json(body: unknown) {
      payload = body;
      return res;
    },
  };
  await handleAutocomplete(
    { query, headers: {}, body: undefined } as unknown as Parameters<typeof handleAutocomplete>[0],
    res as unknown as Parameters<typeof handleAutocomplete>[1]
  );
  return payload as Json;
}

before(() => {
  songPoolModule.ensureCatalogLoaded();
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('artist name matching', () => {
  it('a band member credited as "<member> OF <band>" is a different artist', () => {
    assert.equal(checkArtistStrictMatch('PEEMWASU OF BUS', 'BUS'), false);
    assert.equal(checkArtistStrictMatch('KHUNPOL OF BUS', 'BUS'), false);
    assert.equal(checkArtistStrictMatch('JISOO OF BLACKPINK', 'BLACKPINK'), false);
    assert.equal(checkArtistStrictMatch('Jennie from BLACKPINK', 'BLACKPINK'), false);
  });

  it('a phrase that merely ends with the band name is not the band', () => {
    assert.equal(checkArtistStrictMatch('Wheels on the Bus', 'BUS'), false);
  });

  it('keeps matching the band itself, its collaborations and name extensions', () => {
    assert.equal(checkArtistStrictMatch('BUS', 'BUS'), true);
    assert.equal(checkArtistStrictMatch('BUS & DICE', 'BUS'), true);
    assert.equal(checkArtistStrictMatch('MARCKRIS OF BUS & BUS', 'BUS'), true);
    assert.equal(checkArtistStrictMatch('บัส', 'BUS'), true);
    assert.equal(checkArtistStrictMatch('Stamp Apiwat', 'Stamp'), true);
    assert.equal(checkArtistStrictMatch('The Weeknd', 'Weeknd'), true);
    assert.equal(checkArtistStrictMatch('Lipta & PURPEECH', 'Lipta'), true);
  });

  it('the seeded member features are not BUS songs in Artist Mode', () => {
    for (const id of ['1866795653', '1873476540']) {
      const song = songPool.get(id);
      assert.ok(song, `seed track ${id} is loaded`);
      assert.equal(matchesArtistFilter(song, 'BUS'), false, `${song.title} / ${song.artistName}`);
    }
  });
});

describe('Artist Mode loads the cloud catalog', () => {
  it('BUS: autocomplete lists the band songs stored only in the cloud', async () => {
    const res = await autocomplete({ artist: 'BUS', limit: '60' });
    assert.equal(res.code, 0);
    const ids = new Set(res.data.map((s) => s.id));
    for (const row of BUS_CLOUD_ROWS.filter((r) => r.artist_name !== 'MARCKRIS OF BUS')) {
      assert.ok(ids.has(row.id), `missing ${row.title} (${row.artist_name})`);
    }
    assert.ok(!ids.has('930000010'), 'member solo is not a BUS song');
    assert.ok(!ids.has('1866795653') && !ids.has('1873476540'), 'member features are not BUS songs');
  });

  it('Lipta: a few local collaborations do not hide the full cloud catalog', async () => {
    const localBefore = Array.from(songPool.values()).filter((s) => matchesArtistFilter(s, 'Lipta'));
    assert.ok(localBefore.length > 0, 'seed already holds some Lipta tracks');

    const res = await autocomplete({ artist: 'Lipta', limit: '60' });
    const ids = new Set(res.data.map((s) => s.id));
    for (const row of LIPTA_CLOUD_ROWS) {
      assert.ok(ids.has(row.id), `missing ${row.title}`);
    }
  });

  it('BUS: a live room picks only the band songs', async () => {
    const { pickRoomSongs } = await import('../lib/rooms/service');
    const { DEFAULT_ROOM_SETTINGS } = await import('../shared/roomTypes');
    await songPoolModule.loadArtistSongsFromCloud('BUS');
    const picked = pickRoomSongs({ ...DEFAULT_ROOM_SETTINGS, difficulty: 'hard', artistName: 'BUS' }, 10);
    assert.equal(picked.length, 10);
    for (const s of picked) {
      assert.ok(/^BUS( & DICE)?$/.test(s.artistName), `${s.title} / ${s.artistName}`);
    }
  });

  it('queries the cloud once per artist, not on every keystroke', async () => {
    const before = cloudSongQueries.filter((q) => q.toLowerCase() === 'lipta').length;
    await autocomplete({ artist: 'Lipta', q: 'Lip', limit: '10' });
    await autocomplete({ artist: 'Lipta', q: 'Lipta S', limit: '10' });
    const afterCount = cloudSongQueries.filter((q) => q.toLowerCase() === 'lipta').length;
    assert.equal(afterCount, before);
  });
});
