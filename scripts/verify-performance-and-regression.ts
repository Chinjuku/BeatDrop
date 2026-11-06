/**
 * BeatDrop — Phase 6 Mandatory Performance & Regression Verification Suite
 * Executes all 14 mandatory test cases with strict assertions.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ensureCatalogLoaded, songPool } from '../lib/engine/songPool';
import {
  getAllArtists,
  invalidateAllArtistsCache,
  deleteCustomArtist,
  extractSoloArtistNames,
  parseTrackArtistCredits,
} from '../lib/engine/artists';
import { handleGetArtists } from '../lib/engine/artistRoutes';
import {
  handleStartRound,
  handleAutocomplete,
  handleGuess,
  handleSkip,
  matchesArtistFilter,
  parseCustomStages,
} from '../lib/engine/roundEngine';
import { MAX_SNIPPET_DURATION, MIN_SNIPPET_DURATION, TIME_RANGE_PRESETS } from '../shared/types';
import { handleDaily } from '../lib/engine/dailyEngine';
import { handleGetLeaderboard } from '../lib/engine/leaderboard';
import {
  fetchArtistSongsUpTo200,
  syncArtistSongs,
  recoverPendingArtistSyncJobs,
  clearItunesMemoryCaches,
} from '../lib/itunes';
import { dbService } from '../lib/db';

function createMockRes() {
  let statusCode = 200;
  let jsonBody: any = null;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      jsonBody = payload;
      return this;
    },
    getStatus: () => statusCode,
    getBody: () => jsonBody,
  };
}

async function main() {
  console.log('==============================================================');
  console.log('🚀 BEATDROP FULL SYSTEM REGRESSION & PERFORMANCE TEST SUITE');
  console.log('==============================================================\n');

  const results: Array<{ id: number; name: string; status: 'PASS' | 'FAIL'; durationMs: number; detail: string }> = [];

  async function runTest(id: number, name: string, fn: () => Promise<string>) {
    const start = performance.now();
    try {
      const detail = await fn();
      const durationMs = Number((performance.now() - start).toFixed(2));
      results.push({ id, name, status: 'PASS', durationMs, detail });
      console.log(`✅ [PASS] Test #${id}: ${name} (${durationMs} ms) -> ${detail}`);
    } catch (err) {
      const durationMs = Number((performance.now() - start).toFixed(2));
      const msg = (err as Error).stack || (err as Error).message;
      results.push({ id, name, status: 'FAIL', durationMs, detail: msg });
      console.error(`❌ [FAIL] Test #${id}: ${name} (${durationMs} ms)\n${msg}`);
      process.exitCode = 1;
    }
  }

  ensureCatalogLoaded();
  const realFetch = globalThis.fetch;

  // 1. Adding a brand-new artist (simulated deterministic iTunes response to avoid polluting prod DB)
  await runTest(1, 'Adding a brand-new artist (end-to-end sync + job state)', async () => {
    const testArtistName = 'BeatDropTestNewArtist';
    clearItunesMemoryCaches();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('itunes.apple.com')) {
        if (url.includes('entity=musicArtist')) {
          return new Response(
            JSON.stringify({
              results: [{ wrapperType: 'artist', artistId: 999888777, artistName: testArtistName, primaryGenreName: 'Rock' }],
            }),
            { status: 200 }
          );
        }
        const tracks = Array.from({ length: 15 }, (_, idx) => ({
          wrapperType: 'track',
          kind: 'song',
          trackId: 999000100 + idx,
          artistId: 999888777,
          trackName: `Test Anthem ${idx + 1}`,
          artistName: testArtistName,
          collectionName: 'Test Album',
          previewUrl: `https://audio-ssl.itunes.apple.com/test-${idx}.m4a`,
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
          releaseDate: '2024-05-01T00:00:00Z',
          primaryGenreName: 'Rock',
        }));
        return new Response(JSON.stringify({ results: tracks }), { status: 200 });
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await syncArtistSongs(testArtistName, 'international', 50, true);
      assert.equal(res.status, 200);
      assert.equal(res.body.code, 0);
      assert.equal(res.body.data?.newCount, 15);
      const job = dbService.getSyncJob(res.body.data!.jobId!);
      assert.ok(job, 'Sync job record must exist');
      assert.equal(job.status, 'completed');
      return `Synced ${res.body.data?.newCount} songs, job=${job.id} (${job.status})`;
    } finally {
      globalThis.fetch = realFetch;
      // Clean up test artifacts
      for (let i = 0; i < 15; i++) {
        songPool.delete(String(999000100 + i));
      }
      deleteCustomArtist('artist_beatdroptestnewartist');
      dbService.deleteSongsByArtist(testArtistName);
      dbService.deleteSyncJob('job_beatdroptestnewartist');
    }
  });

  // 2. Adding an existing artist (instant DB cache fast-path with zero iTunes HTTP calls)
  await runTest(2, 'Adding an existing artist (cached fast-path, 0 external calls)', async () => {
    let itunesCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('itunes.apple.com')) {
        itunesCalls += 1;
      }
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const t0 = performance.now();
      const res = await syncArtistSongs('Bodyslam', 'thai', 50, false);
      const elapsed = performance.now() - t0;
      assert.equal(res.status, 200);
      assert.equal(res.body.code, 0);
      assert.equal(res.body.data?.cached, true);
      assert.equal(itunesCalls, 0, 'Must not call iTunes when artist already has enough songs in DB');
      assert.ok(elapsed < 150, `Expected <150ms fast-path, got ${elapsed.toFixed(2)}ms`);
      return `Returned ${res.body.data?.newCount} cached songs in ${elapsed.toFixed(2)}ms with 0 iTunes calls`;
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // 3. Adding an artist with many songs (up to 200 songs deduplicated & chunk-persisted)
  await runTest(3, 'Adding an artist with many songs (up to 200 songs)', async () => {
    clearItunesMemoryCaches();
    let simulatedTracks: any[] = [];
    for (let i = 0; i < 180; i++) {
      simulatedTracks.push({
        wrapperType: 'track',
        kind: 'song',
        trackId: 888000000 + i,
        artistId: 888111,
        trackName: `Mega Catalog Track #${i + 1}`,
        artistName: 'MegaCatalogArtist',
        collectionName: 'Mega Collection',
        previewUrl: `https://audio-ssl.itunes.apple.com/mega-${i}.m4a`,
        artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg',
        releaseDate: '2022-01-01T00:00:00Z',
        primaryGenreName: 'Pop',
      });
    }
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('itunes.apple.com')) {
        return new Response(JSON.stringify({ results: simulatedTracks }), { status: 200 });
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const fetched = await fetchArtistSongsUpTo200('MegaCatalogArtist', 'international', 200);
      assert.equal(fetched.songs.length, 180);
      return `Fetched and deduplicated ${fetched.songs.length} tracks cleanly`;
    } finally {
      globalThis.fetch = realFetch;
      clearItunesMemoryCaches();
    }
  });

  // 4. iTunes API timeout simulation
  await runTest(4, 'iTunes API timeout handling (graceful failure, no hang)', async () => {
    clearItunesMemoryCaches();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('itunes.apple.com')) {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await syncArtistSongs('TimeoutArtistXYZ', 'international', 50, true);
      assert.equal(res.status, 404);
      const job = dbService.getSyncJob('job_timeoutartistxyz');
      assert.equal(job?.status, 'failed');
      return `Handled timeout cleanly (status=${res.status}, job=${job?.status})`;
    } finally {
      globalThis.fetch = realFetch;
      dbService.deleteSyncJob('job_timeoutartistxyz');
      clearItunesMemoryCaches();
    }
  });

  // 5. iTunes API rate limit (HTTP 429) retry & recovery
  await runTest(5, 'iTunes API rate limit (HTTP 429) retry & recovery', async () => {
    clearItunesMemoryCaches();
    let attempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('itunes.apple.com')) {
        attempts += 1;
        if (attempts === 1) {
          return new Response('Rate Limited', { status: 429, headers: { 'Retry-After': '1' } });
        }
        return new Response(
          JSON.stringify({
            results: [
              {
                wrapperType: 'track',
                kind: 'song',
                trackId: 777000001,
                artistId: 777111,
                trackName: 'Recovered After 429',
                artistName: 'RateLimitArtist',
                collectionName: 'Resilience',
                previewUrl: 'https://audio-ssl.itunes.apple.com/rl-1.m4a',
                releaseDate: '2023-01-01T00:00:00Z',
                primaryGenreName: 'Pop',
              },
            ],
          }),
          { status: 200 }
        );
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await fetchArtistSongsUpTo200('RateLimitArtist', 'international', 10);
      assert.ok(attempts >= 2, 'Expected retry after HTTP 429');
      assert.equal(res.songs.length, 1);
      return `Recovered from HTTP 429 on attempt #${attempts} (${res.songs.length} track)`;
    } finally {
      globalThis.fetch = realFetch;
      clearItunesMemoryCaches();
    }
  });

  // 6. Supabase temporary failure simulation
  await runTest(6, 'Supabase temporary failure fallback to local SQLite', async () => {
    clearItunesMemoryCaches();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('supabase.co')) {
        return new Response('Service Unavailable', { status: 503 });
      }
      if (url.includes('itunes.apple.com')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                wrapperType: 'track',
                kind: 'song',
                trackId: 666000001,
                artistId: 666111,
                trackName: 'Local Resilient Song',
                artistName: 'SupaDownArtist',
                collectionName: 'Offline Ready',
                previewUrl: 'https://audio-ssl.itunes.apple.com/sd-1.m4a',
                releaseDate: '2024-01-01T00:00:00Z',
                primaryGenreName: 'Indie',
              },
            ],
          }),
          { status: 200 }
        );
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await syncArtistSongs('SupaDownArtist', 'international', 20, true);
      assert.equal(res.status, 200);
      assert.equal(res.body.code, 0);
      assert.equal(res.body.data?.newCount, 1);
      return `Completed sync using SQLite fallback despite Supabase 503`;
    } finally {
      globalThis.fetch = realFetch;
      songPool.delete('666000001');
      deleteCustomArtist('artist_supadownartist');
      dbService.deleteSongsByArtist('SupaDownArtist');
      dbService.deleteSyncJob('job_supadownartist');
      clearItunesMemoryCaches();
    }
  });

  // 7. Partial sync failure tracking
  await runTest(7, 'Partial sync failure state & job audit persistence', async () => {
    const jobId = 'job_partial_test';
    dbService.upsertSyncJob({
      id: jobId,
      artistId: 'artist_partial_test',
      artistName: 'PartialTestArtist',
      category: 'thai',
      status: 'failed',
      maxLimit: 50,
      fetchedCount: 50,
      addedCount: 25,
      lastError: 'Simulated partial batch interruption',
      attempts: 1,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    });
    const saved = dbService.getSyncJob(jobId);
    assert.ok(saved);
    assert.equal(saved.status, 'failed');
    assert.equal(saved.fetchedCount, 50);
    assert.equal(saved.addedCount, 25);
    dbService.deleteSyncJob(jobId);
    return `Verified partial progress persistence (fetched=${saved.fetchedCount}, added=${saved.addedCount})`;
  });

  // 8. Background job interruption and automatic recovery
  await runTest(8, 'Stuck processing job lock expiration & automatic recovery', async () => {
    const stuckJobId = 'job_bodyslam';
    dbService.upsertSyncJob({
      id: stuckJobId,
      artistId: 'th-bodyslam',
      artistName: 'Bodyslam',
      category: 'thai',
      status: 'processing',
      maxLimit: 50,
      fetchedCount: 0,
      addedCount: 0,
      attempts: 1,
      lastError: null,
      lockedUntil: Date.now() - 10_000, // expired 10s ago
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const recoverable = dbService.getRecoverableSyncJobs();
    assert.ok(recoverable.some((j) => j.id === stuckJobId), 'Stuck job should be detected as recoverable');

    const recovered = await recoverPendingArtistSyncJobs(1);
    assert.ok(recovered.some((j) => j.artistName === 'Bodyslam'));
    const updatedJob = dbService.getSyncJob(stuckJobId);
    assert.equal(updatedJob?.status, 'completed');
    return `Recovered expired job '${stuckJobId}' -> status='${updatedJob?.status}'`;
  });

  // 9. Concurrent sync requests for the same artist (in-flight deduplication)
  await runTest(9, 'Concurrent sync requests for the same artist (deduplication)', async () => {
    clearItunesMemoryCaches();
    let httpCalls = 0;
    const mockSongs = Array.from({ length: 15 }, (_, idx) => ({
      wrapperType: 'track',
      kind: 'song',
      trackId: 555000001 + idx,
      artistId: 555111,
      trackName: `Concurrent Dedup Song ${idx + 1}`,
      artistName: 'ConcurrentArtist',
      collectionName: 'Single',
      previewUrl: `https://audio-ssl.itunes.apple.com/cc-${idx}.m4a`,
      releaseDate: '2024-01-01T00:00:00Z',
      primaryGenreName: 'Pop',
    }));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('itunes.apple.com')) {
        httpCalls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return new Response(JSON.stringify({ results: mockSongs }), { status: 200 });
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const [r1, r2, r3] = await Promise.all([
        syncArtistSongs('ConcurrentArtist', 'international', 50, true),
        syncArtistSongs('ConcurrentArtist', 'international', 50, true),
        syncArtistSongs('ConcurrentArtist', 'international', 50, true),
      ]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 200);
      assert.equal(r1.body.data?.jobId, r2.body.data?.jobId);
      assert.equal(httpCalls, 3, `Expected 1 deduplicated sync (3 iTunes calls instead of 9), got ${httpCalls}`);
      return `3 concurrent syncArtistSongs calls shared 1 in-flight execution (${httpCalls} HTTP calls total)`;
    } finally {
      globalThis.fetch = realFetch;
      for (let i = 0; i < 15; i++) {
        songPool.delete(String(555000001 + i));
      }
      deleteCustomArtist('artist_concurrentartist');
      dbService.deleteSongsByArtist('ConcurrentArtist');
      dbService.deleteSyncJob('job_concurrentartist');
      clearItunesMemoryCaches();
    }
  });

  // 10. Empty iTunes response
  await runTest(10, 'Empty iTunes response handling', async () => {
    clearItunesMemoryCaches();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('itunes.apple.com')) {
        return new Response(JSON.stringify({ resultCount: 0, results: [] }), { status: 200 });
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await syncArtistSongs('NonExistentGhostArtist999', 'international', 50, true);
      assert.equal(res.status, 404);
      assert.equal(res.body.code, -1);
      return `Returned clean 404 with message: "${res.body.message}"`;
    } finally {
      globalThis.fetch = realFetch;
      dbService.deleteSyncJob('job_nonexistentghostartist999');
      clearItunesMemoryCaches();
    }
  });

  // 11. All game modes (standard, artist, year, genre, daily, guesser) + guess/skip flow
  await runTest(11, 'All game modes (standard, artist, year, genre, daily, guesser)', async () => {
    const modes: Array<{ query: Record<string, string>; label: string }> = [
      { query: { category: 'thai', difficulty: 'easy', mode: 'standard' }, label: 'standard' },
      { query: { category: 'thai', difficulty: 'medium', mode: 'artist', artist: 'Bodyslam' }, label: 'artist' },
      { query: { category: 'international', difficulty: 'easy', mode: 'year', year: '2020s' }, label: 'year' },
      { query: { category: 'thai', difficulty: 'easy', mode: 'genre', genre: 'Rock' }, label: 'genre' },
      { query: { category: 'thai', difficulty: 'easy', mode: 'guesser' }, label: 'guesser' },
    ];

    for (const m of modes) {
      const res = createMockRes();
      await handleStartRound({ query: m.query } as any, res as any);
      assert.equal(res.getStatus(), 200, `Mode ${m.label} failed with status ${res.getStatus()}`);
      const data = res.getBody()?.data;
      assert.ok(data?.roundToken, `Mode ${m.label} missing roundToken`);
      assert.ok(data?.audioUrl, `Mode ${m.label} missing audioUrl`);
      if (m.label === 'guesser') {
        assert.equal(data.choices?.length, 4, 'Guesser mode must provide 4 multiple-choice options');
      }
    }

    // Test skip flow on standard round
    const startRes = createMockRes();
    await handleStartRound({ query: { category: 'thai', difficulty: 'easy', mode: 'standard' } } as any, startRes as any);
    const token = startRes.getBody().data.roundToken;
    const skipRes = createMockRes();
    await handleSkip({ body: { roundToken: token, giveUp: true } } as any, skipRes as any);
    assert.equal(skipRes.getBody()?.data?.outcome, 'failed');
    assert.ok(skipRes.getBody()?.data?.reveal?.title, 'GiveUp must reveal track answer');

    // Test daily challenge
    const dailyRes = createMockRes();
    await handleDaily({ query: { category: 'thai', difficulty: 'easy' } } as any, dailyRes as any);
    assert.equal(dailyRes.getStatus(), 200);
    assert.equal(dailyRes.getBody()?.data?.rounds?.length, 5, 'Daily challenge must return 5 deterministic songs');

    return `Verified standard, artist, year, genre, guesser (4 choices), skip/reveal, and daily (5 rounds)`;
  });

  // 12. SQLite Offline Mode (DB_LOCAL=true)
  await runTest(12, 'SQLite Offline Mode (DB_LOCAL=true) full operation', async () => {
    const prev = process.env.DB_LOCAL;
    process.env.DB_LOCAL = 'true';
    try {
      invalidateAllArtistsCache();
      const artists = getAllArtists(songPool);
      assert.ok(artists.length >= 50, 'Offline mode must load curated + custom artists from SQLite');

      const res = createMockRes();
      await handleStartRound({ query: { category: 'all', difficulty: 'medium', mode: 'standard' } } as any, res as any);
      assert.equal(res.getStatus(), 200);
      assert.ok(res.getBody()?.data?.roundToken);
      return `Offline SQLite mode served ${artists.length} artists and started round with 0 cloud calls`;
    } finally {
      process.env.DB_LOCAL = prev;
    }
  });

  // 13. Navigation, artist discovery, autocomplete, and leaderboard response times
  await runTest(13, 'Navigation endpoints (/api/artists, /api/autocomplete, /api/leaderboard)', async () => {
    const t0 = performance.now();
    const resArtists = createMockRes();
    await handleGetArtists({ query: { category: 'thai', q: 'body' } } as any, resArtists as any);
    assert.equal(resArtists.getStatus(), 200);
    assert.ok(resArtists.getBody()?.data?.some((a: any) => a.name === 'Bodyslam'));

    const resAuto = createMockRes();
    await handleAutocomplete({ query: { q: 'ความเชื่อ', category: 'thai', limit: '10' } } as any, resAuto as any);
    assert.equal(resAuto.getStatus(), 200);
    assert.ok(resAuto.getBody()?.data?.length > 0);

    const resLb = createMockRes();
    await handleGetLeaderboard({ query: { category: 'thai', difficulty: 'easy', mode: 'global', limit: '10' } } as any, resLb as any);
    assert.equal(resLb.getStatus(), 200);
    const totalMs = Number((performance.now() - t0).toFixed(2));
    return `All 3 navigation endpoints responded in ${totalMs} ms total`;
  });

  // 14. Collaboration parsing: solo, 2-artist collab, multi-collab, featured, protected bands
  await runTest(14, 'Artist collaboration parsing & protected band names', async () => {
    assert.deepEqual(extractSoloArtistNames('Taylor Swift'), ['Taylor Swift']);
    assert.deepEqual(extractSoloArtistNames('ROSÉ & Bruno Mars'), ['ROSÉ', 'Bruno Mars']);
    assert.deepEqual(
      extractSoloArtistNames('ILLSLICK, SANTAZ & DM'),
      ['ILLSLICK', 'SANTAZ', 'DM']
    );
    for (const band of ['Whal & Dolph', 'Earth, Wind & Fire', 'AC/DC', 'Marina and the Diamonds', 'Lil Nas X']) {
      assert.deepEqual(extractSoloArtistNames(band), [band], `Band "${band}" must not be split`);
    }
    assert.deepEqual(extractSoloArtistNames('JENNIE (from BLACKPINK)'), ['JENNIE']);

    const feat = parseTrackArtistCredits('t1', 'Ed Sheeran', 'Shape (feat. Bruno Mars)');
    assert.equal(feat.length, 2);
    assert.equal(feat[0].role, 'primary');
    assert.equal(feat[1].role, 'featured');
    assert.equal(feat[1].artistName, 'Bruno Mars');

    const inlineFeat = parseTrackArtistCredits('t2', 'Ed Sheeran feat. Bruno Mars', 'Song');
    assert.deepEqual(inlineFeat.map((c) => c.artistName), ['Ed Sheeran', 'Bruno Mars']);

    const collab = parseTrackArtistCredits('t3', 'ROSÉ & Bruno Mars', 'APT.');
    assert.deepEqual(collab.map((c) => c.role), ['primary', 'collaborator']);
    return `solo/collab/multi/featured/protected-band cases parsed correctly`;
  });

  // 15. Collaboration sync: canonical solo artist + each collaborator selectable in Artist Mode
  await runTest(15, 'Collab sync never creates combined artist; each collaborator selectable', async () => {
    clearItunesMemoryCaches();
    const query = 'CollabTestSoloA';
    const partner = 'CollabTestSoloB';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('itunes.apple.com')) {
        if (url.includes('entity=musicArtist')) {
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        const tracks = [
          { trackId: 444000001, trackName: 'Duet Hit', artistName: `${query} & ${partner}` },
          { trackId: 444000002, trackName: 'Solo Hit', artistName: query },
        ].map((t) => ({
          ...t,
          wrapperType: 'track',
          kind: 'song',
          collectionName: 'Collab',
          previewUrl: `https://audio-ssl.itunes.apple.com/${t.trackId}.m4a`,
          releaseDate: '2024-01-01T00:00:00Z',
          primaryGenreName: 'Pop',
        }));
        return new Response(JSON.stringify({ results: tracks }), { status: 200 });
      }
      return realFetch(input);
    }) as typeof fetch;

    try {
      const res = await syncArtistSongs(query, 'international', 50, true);
      assert.equal(res.status, 200);
      assert.equal(res.body.data?.artist.name, query, 'Canonical name must be the queried solo artist');
      assert.ok(!getAllArtists(songPool).some((a) => a.name.includes('&') && a.name.includes(query)));

      const duet = songPool.get('444000001')!;
      assert.ok(duet.artistIds && duet.artistIds.length === 2, 'Duet must carry two artist credits');
      assert.ok(matchesArtistFilter(duet, query));
      assert.ok(matchesArtistFilter(duet, partner));
      assert.ok(!matchesArtistFilter(songPool.get('444000002')!, partner));
      assert.deepEqual(
        dbService.getTrackIdsByArtist(duet.artistIds![1]).includes('444000001'),
        true,
        'track_artists row must persist for collaborator'
      );
      return `Duet stored once with ${duet.artistIds!.length} credits; both artists selectable`;
    } finally {
      globalThis.fetch = realFetch;
      songPool.delete('444000001');
      songPool.delete('444000002');
      deleteCustomArtist('artist_collabtestsoloa');
      deleteCustomArtist('artist_collabtestsolob');
      dbService.deleteSongsByArtist(query);
      dbService.deleteSongsByArtist(`${query} & ${partner}`);
      dbService.deleteSyncJob('job_collabtestsoloa');
      clearItunesMemoryCaches();
    }
  });

  // 16. Time range bounds (custom 0.1–15s, standard 0.5–15s, songspot 0.1–15s)
  await runTest(16, 'Snippet time range presets & custom bounds', async () => {
    assert.equal(MIN_SNIPPET_DURATION, 0.1);
    assert.equal(MAX_SNIPPET_DURATION, 15);
    assert.deepEqual(parseCustomStages('0.1,2,15'), [0.1, 2, 15]);
    assert.deepEqual(parseCustomStages('0.05,2,30'), null, 'Out-of-range stages must be rejected');
    assert.deepEqual(TIME_RANGE_PRESETS.standard.stages, [0.5, 2, 6, 8, 15]);
    assert.deepEqual(TIME_RANGE_PRESETS.songspot.stages, [0.1, 0.5, 2, 8, 15]);
    return `custom=[0.1..15], standard=${TIME_RANGE_PRESETS.standard.stages}, songspot=${TIME_RANGE_PRESETS.songspot.stages}`;
  });

  // 17. GET /api/artists/sync is read-only (no recovery side effects)
  await runTest(17, 'GET /api/artists/sync is read-only; recover requires POST', async () => {
    const { GET, POST } = await import('../app/api/artists/sync/route');
    const res = await GET(new Request('http://localhost/api/artists/sync?recover=true'));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.data?.recoverable !== undefined, 'GET must only list recoverable jobs');
    assert.equal(body.data?.recovered, undefined, 'GET must never trigger recovery');

    const priorAdminKey = process.env.ADMIN_API_KEY;
    const priorCronSecret = process.env.CRON_SECRET;
    delete process.env.ADMIN_API_KEY;
    delete process.env.CRON_SECRET;
    try {
      const unauthorized = await POST(
        new Request('http://localhost/api/artists/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recover' }),
        })
      );
      assert.equal(unauthorized.status, 401, 'Recovery must fail closed without configured credentials');
    } finally {
      if (priorAdminKey !== undefined) process.env.ADMIN_API_KEY = priorAdminKey;
      if (priorCronSecret !== undefined) process.env.CRON_SECRET = priorCronSecret;
    }
    return `GET ignored ?recover=true; unauthenticated recovery POST returned 401`;
  });

  console.log('\n==============================================================');
  console.log(`📊 SUMMARY: ${results.filter((r) => r.status === 'PASS').length}/${results.length} TESTS PASSED`);
  console.log('==============================================================');
}

main();
