/**
 * Daily Challenge archive (SQLite path): listing, official "played" marks, replay rules,
 * and practice rounds that never touch Daily progress. Offline, throwaway DB copy.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-archive-test-'));
fs.copyFileSync(path.resolve('data/beatdrop.db'), path.join(tempDir, 'archive-test.db'));
process.env.BEATDROP_SQLITE_PATH = path.join(tempDir, 'archive-test.db');
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL']) {
  delete process.env[key];
}
(process.env as Record<string, string>).NODE_ENV = 'test';
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('network disabled in archive tests');
}) as typeof fetch;

const { dbService } = await import('../lib/db');
const { songPool, ensureCatalogLoaded } = await import('../lib/engine/songPool');
const { getBangkokDateKey } = await import('../lib/token');
const { getDailyPlayerId } = await import('../lib/engine/dailySession');
const { scopePlayerIdByDifficulty } = await import('../lib/engine/dailyEngine');
const archiveRoute = await import('../app/api/daily/archive/route');
const archiveRoundRoute = await import('../app/api/daily/archive/round/route');
const guessRoute = await import('../app/api/round/guess/route');

const PAST = '2026-01-01';
const OLDER = '2025-12-31';
let ids: string[] = [];
let cookie = '';
let playerId = '';

before(() => {
  ensureCatalogLoaded();
  ids = Array.from(songPool.keys()).slice(0, 5);
  dbService.getOrCreateLocalDailyChallengeIds(PAST, 'all', ids);
  dbService.getOrCreateLocalDailyChallengeIds(OLDER, 'all', ids);
  dbService.getOrCreateLocalDailyChallengeIds(`${PAST}:hard`, 'all', [...ids].reverse());
  dbService.getOrCreateLocalDailyChallengeIds(getBangkokDateKey(), 'all', ids); // today: must stay hidden

  playerId = getDailyPlayerId({ headers: {} }, { setHeader: (_n: string, v: string) => { cookie = v.split(';')[0]; } });
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

let ip = 1;
async function get(query: string, headers: Record<string, string> = {}) {
  const res = await archiveRoute.GET(
    new Request(`http://localhost/api/daily/archive?${query}`, { headers: { 'x-forwarded-for': `10.9.0.${ip++}`, ...headers } })
  );
  return { status: res.status, headers: res.headers, json: await res.json() };
}
async function post(handler: (r: Request) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new Request(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.1.${ip++}` },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

describe('daily archive listing', () => {
  it('lists stored past dates newest first, never today', async () => {
    const res = await get('category=all&difficulty=easy');
    assert.equal(res.status, 200);
    const dates = res.json.data.days.map((d: { dateKey: string }) => d.dateKey);
    assert.ok(dates.indexOf(PAST) >= 0 && dates.indexOf(OLDER) > dates.indexOf(PAST), 'newest first');
    assert.equal(dates.includes(getBangkokDateKey()), false, "today's challenge is not in the archive");
    assert.equal(res.headers.get('set-cookie'), null, 'listing never sets a cookie');
  });

  it('lists each difficulty separately', async () => {
    const hard = await get('category=all&difficulty=hard');
    assert.deepEqual(hard.json.data.days.map((d: { dateKey: string }) => d.dateKey), [PAST]);
    const expert = await get('category=all&difficulty=expert');
    assert.deepEqual(expert.json.data.days, []);
  });

  it("marks days the player played when they were live (from the server's records)", async () => {
    for (let i = 0; i < 5; i++) {
      await dbService.getOrCreateDailyRoundProgress({
        playerId, dateKey: PAST, category: 'all', roundIndex: i, trackId: ids[i],
        startedAt: 1, status: 'pending', score: 0, speedBonus: 0, answerTimeMs: 0,
      });
      await dbService.finalizeDailyRoundProgress({
        playerId, dateKey: PAST, category: 'all', roundIndex: i, trackId: ids[i],
        status: i < 3 ? 'correct' : 'wrong', score: i < 3 ? 800 : 0, speedBonus: 0, answerTimeMs: 1000,
      });
    }
    const withCookie = await get('category=all&difficulty=easy', { cookie });
    const day = withCookie.json.data.days.find((d: { dateKey: string }) => d.dateKey === PAST);
    assert.deepEqual(day.official, { roundsPlayed: 5, score: 2400, complete: true });
    const older = withCookie.json.data.days.find((d: { dateKey: string }) => d.dateKey === OLDER);
    assert.equal(older.official, undefined);

    const anonymous = await get('category=all&difficulty=easy');
    assert.equal(anonymous.json.data.days.find((d: { dateKey: string }) => d.dateKey === PAST).official, undefined);

    // A different difficulty is a different official record.
    const hard = await get('category=all&difficulty=hard', { cookie });
    assert.equal(hard.json.data.days[0].official, undefined);
    assert.notEqual(scopePlayerIdByDifficulty(playerId, 'hard'), playerId);
  });
});

describe('daily archive rounds', () => {
  it('starts practice rounds for a stored past date with the Daily clip stages', async () => {
    const r0 = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: PAST, category: 'all', difficulty: 'easy', roundIndex: 0 });
    assert.equal(r0.status, 200, JSON.stringify(r0.json));
    assert.equal(r0.json.data.mode, 'standard', 'practice, not a Daily round');
    assert.deepEqual(r0.json.data.stages, [0.5, 2, 6, 8, 15]);
    assert.equal(r0.json.data.totalRounds, 5);
    assert.equal(r0.json.data.audioUrl, songPool.get(ids[0])!.previewUrl, 'round 1 is the stored first song');

    const hard = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: PAST, category: 'all', difficulty: 'hard', roundIndex: 0 });
    assert.equal(hard.json.data.audioUrl, songPool.get(ids[4])!.previewUrl, 'hard uses its own stored order');
  });

  it("refuses today's challenge, unknown dates and bad input", async () => {
    const today = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: getBangkokDateKey(), category: 'all', difficulty: 'easy', roundIndex: 0 });
    assert.equal(today.status, 403);
    const missing = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: '2020-02-02', category: 'all', difficulty: 'easy', roundIndex: 0 });
    assert.equal(missing.status, 404);
    const notStoredForLevel = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: OLDER, category: 'all', difficulty: 'expert', roundIndex: 0 });
    assert.equal(notStoredForLevel.status, 404, 'never recomputed for a level that was not stored');
    for (const bad of [{ dateKey: 'yesterday', roundIndex: 0 }, { dateKey: PAST, roundIndex: 5 }, { dateKey: PAST, roundIndex: -1 }]) {
      assert.equal((await post(archiveRoundRoute.POST, '/api/daily/archive/round', { category: 'all', ...bad })).status, 400);
    }
  });

  it('practice guesses never write Daily progress', async () => {
    const before = (await dbService.getDailyProgressForDates(playerId, 'all', [PAST])).length;
    const r = await post(archiveRoundRoute.POST, '/api/daily/archive/round', { dateKey: PAST, category: 'all', difficulty: 'easy', roundIndex: 1 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const guess = await post(guessRoute.POST, '/api/round/guess', { roundToken: r.json.data.roundToken, candidateTrackId: ids[1] });
    assert.equal(guess.status, 200);
    assert.equal(guess.json.data.outcome, 'correct');
    assert.equal((await dbService.getDailyProgressForDates(playerId, 'all', [PAST])).length, before);
  });
});
