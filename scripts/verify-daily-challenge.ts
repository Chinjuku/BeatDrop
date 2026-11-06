import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-daily-test-'));
const testDatabasePath = path.join(tempDir, 'daily-test.db');
fs.copyFileSync(path.resolve('data/beatdrop.db'), testDatabasePath);
process.env.BEATDROP_SQLITE_PATH = testDatabasePath;
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
process.env.NODE_ENV = 'test';

const types = await import('../shared/types');
const scoring = await import('../lib/engine/dailyScoring');
const token = await import('../lib/token');
const session = await import('../lib/engine/dailySession');
const { dbService } = await import('../lib/db');
const { ensureCatalogLoaded, songPool } = await import('../lib/engine/songPool');
const { handleDaily } = await import('../lib/engine/dailyEngine');
const { handleGuess, handleSkip } = await import('../lib/engine/roundEngine');
const { getDailyPlayerId } = session;

function mockResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    cookie: '',
    status(code: number) { this.statusCode = code; return this; },
    setHeader(_name: string, value: string) { this.cookie = value; },
    json(body: unknown) { this.body = body; return this; },
  };
}

assert.deepEqual(types.SONGSPOT_STAGES, types.TIME_RANGE_PRESETS.songspot.stages);
assert.equal(types.DAILY_ALLOWED_TIME_MS, types.SONGSPOT_STAGES.reduce((sum, seconds) => sum + seconds * 1000, 0));
assert.equal(scoring.getDailyCorrectScore(0).score, 1000);
assert.equal(scoring.getDailyCorrectScore(types.DAILY_ALLOWED_TIME_MS).score, 500);
assert.equal(scoring.getDailyCorrectScore(types.DAILY_ALLOWED_TIME_MS / 2).speedBonus, 250);
assert.equal(scoring.getDailyCorrectScore(-100).score, 1000);
assert.equal(scoring.getDailyCorrectScore(types.DAILY_ALLOWED_TIME_MS * 2).score, 500);
assert.equal(scoring.applyDailySkipPenalty(100), 0);
assert.equal(scoring.applyDailySkipPenalty(900), 600);
assert.equal(scoring.isDailyRoundExpired(1000, 1000 + types.DAILY_ALLOWED_TIME_MS), true);
assert.equal(scoring.isDailyRoundExpired(1000, 999 + types.DAILY_ALLOWED_TIME_MS), false);

const bangkokBeforeReset = token.getBangkokDateKey(new Date('2026-06-01T16:59:59.000Z'));
const bangkokAfterReset = token.getBangkokDateKey(new Date('2026-06-01T17:00:00.000Z'));
assert.equal(bangkokBeforeReset, '2026-06-01');
assert.equal(bangkokAfterReset, '2026-06-02');

let cookie = '';
const playerId = session.getDailyPlayerId({ headers: {} }, { setHeader: (_name, value) => { cookie = value; } });
assert.ok(cookie.includes('HttpOnly'));
const request = { headers: { cookie: cookie.split(';')[0] } };
assert.equal(session.readDailyPlayerId(request), playerId);
assert.equal(session.readDailyPlayerId({ headers: { cookie: 'beatdrop_daily_player=%E0%A4%A' } }), null);

const challengeDate = '2099-11-06';
const firstSequence = dbService.getOrCreateLocalDailyChallengeIds(challengeDate, 'all', ['a', 'b', 'c', 'd', 'e']);
const secondSequence = dbService.getOrCreateLocalDailyChallengeIds(challengeDate, 'all', ['e', 'd', 'c', 'b', 'a']);
assert.deepEqual(firstSequence, ['a', 'b', 'c', 'd', 'e']);
assert.deepEqual(secondSequence, firstSequence, 'persisted challenge seed/sequence must not change on refresh');

ensureCatalogLoaded();
const firstDailyResponse = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: {} } as never, firstDailyResponse as never);
assert.equal(firstDailyResponse.statusCode, 200);
const firstDailyBody = firstDailyResponse.body as {
  code: number;
  data: {
    rounds: Array<{ audioUrl: string; stages: number[]; roundToken: string }>;
    currentIndex: number;
    results: string[];
  };
};
assert.equal(firstDailyBody.code, 0);
assert.equal(firstDailyBody.data.rounds.length, 5);
assert.deepEqual(firstDailyBody.data.rounds[0].stages, types.SONGSPOT_STAGES);
const playerCookie = firstDailyResponse.cookie.split(';')[0];
const secondDailyResponse = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: {} } as never, secondDailyResponse as never);
const secondDailyBody = secondDailyResponse.body as typeof firstDailyBody;
assert.deepEqual(
  firstDailyBody.data.rounds.map((round) => round.audioUrl),
  secondDailyBody.data.rounds.map((round) => round.audioUrl),
  'all players must receive the same persisted track order'
);
const samePlayerRefresh = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, samePlayerRefresh as never);
assert.equal((samePlayerRefresh.body as typeof firstDailyBody).data.currentIndex, 0);
assert.equal((samePlayerRefresh.body as typeof firstDailyBody).data.rounds[0].roundToken !== '', true);

const firstRoundToken = firstDailyBody.data.rounds[0].roundToken;
const activeRound = (await import('../lib/engine/roundEngine')).activeRounds.get(firstRoundToken);
assert.ok(activeRound);
await new Promise((resolve) => setTimeout(resolve, 60));
const correctResponse = mockResponse();
await handleGuess({
  body: { roundToken: firstRoundToken, candidateTrackId: activeRound!.track.id },
  headers: { cookie: playerCookie },
} as never, correctResponse as never);
const correctBody = correctResponse.body as { code: number; data: { dailyResult: string; scoreDelta: number; speedBonus: number } };
assert.equal(correctBody.code, 0);
assert.equal(correctBody.data.dailyResult, 'correct');
assert.ok(correctBody.data.scoreDelta >= 500 && correctBody.data.scoreDelta <= 1000);
assert.equal(correctBody.data.scoreDelta, 500 + correctBody.data.speedBonus);
const duplicateAnswerResponse = mockResponse();
await handleGuess({
  body: { roundToken: firstRoundToken, candidateTrackId: activeRound!.track.id },
  headers: { cookie: playerCookie },
} as never, duplicateAnswerResponse as never);
assert.notEqual(duplicateAnswerResponse.statusCode, 200, 'duplicate answer must not award points twice');

const secondRoundInfo = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, secondRoundInfo as never);
const secondRoundData = (secondRoundInfo.body as typeof firstDailyBody).data;
assert.equal(secondRoundData.currentIndex, 1, 'refresh resumes the persisted next round');
const skipResponse = mockResponse();
await handleSkip({
  body: { roundToken: secondRoundData.rounds[1].roundToken },
  headers: { cookie: playerCookie },
} as never, skipResponse as never);
const skipBody = skipResponse.body as { code: number; data: { dailyResult: string; scoreDelta: number } };
assert.equal(skipBody.code, 0);
assert.equal(skipBody.data.dailyResult, 'skipped');
assert.equal(skipBody.data.scoreDelta, -300);

const thirdRoundInfo = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, thirdRoundInfo as never);
const thirdRound = (thirdRoundInfo.body as typeof firstDailyBody).data.rounds[2];
let tokenForWrong = thirdRound.roundToken;
let wrongResult: { code: number; data: { outcome: string; dailyResult?: string; roundToken?: string } } | null = null;
await new Promise((resolve) => setTimeout(resolve, 60));
for (let attempt = 0; attempt < types.SONGSPOT_STAGES.length; attempt++) {
  const wrongResponse = mockResponse();
  await handleGuess({
    body: { roundToken: tokenForWrong, candidateTrackId: 'not-the-track', candidateTitle: 'Wrong guess', candidateArtist: 'Wrong artist' },
    headers: { cookie: playerCookie },
  } as never, wrongResponse as never);
  wrongResult = wrongResponse.body as typeof wrongResult;
  if (!wrongResult || wrongResult.code !== 0 || !wrongResult.data.roundToken) break;
  tokenForWrong = wrongResult.data.roundToken;
}
assert.equal(wrongResult?.data.dailyResult, 'wrong', 'wrong answer at final stage scores zero');

const finalSkipInfo = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, finalSkipInfo as never);
const finalSkipData = (finalSkipInfo.body as typeof firstDailyBody).data;
assert.equal(finalSkipData.currentIndex, 3);
for (const roundIndex of [3, 4]) {
  const current = roundIndex === 3 ? finalSkipData.rounds[roundIndex] : null;
  let token = current?.roundToken;
  if (!token) {
    const info = mockResponse();
    await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, info as never);
    token = (info.body as typeof firstDailyBody).data.rounds[roundIndex].roundToken;
  }
  const skipped = mockResponse();
  await handleSkip({ body: { roundToken: token }, headers: { cookie: playerCookie } } as never, skipped as never);
  assert.equal((skipped.body as { data: { dailyResult: string } }).data.dailyResult, 'skipped');
}
const completedInfo = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: { cookie: playerCookie } } as never, completedInfo as never);
const completedData = (completedInfo.body as typeof firstDailyBody).data;
assert.equal(completedData.currentIndex, types.DAILY_ROUND_COUNT);
assert.equal(completedData.results.filter((status) => status === 'skipped').length, 3);

const now = Date.now();
const progress = {
  playerId,
  dateKey: challengeDate,
  category: 'all' as const,
  roundIndex: 0,
  trackId: 'track-dedupe',
  startedAt: now,
  status: 'pending' as const,
  score: 0,
  speedBonus: 0,
  answerTimeMs: 0,
};
assert.ok(await dbService.getOrCreateDailyRoundProgress(progress));
const competingFinalizations = await Promise.all([
  scoring.finalizeDailyRound({ ...progress, outcome: 'correct', now: now + 100 }),
  scoring.finalizeDailyRound({ ...progress, outcome: 'correct', now: now + 200 }),
]);
assert.equal(competingFinalizations.filter((result) => result.updated).length, 1, 'one round may award at most once');
const persisted = await dbService.getDailyRoundProgress(playerId, challengeDate, 'all');
assert.equal(persisted.length, 1);
assert.equal(persisted[0].status, 'correct');
assert.equal(persisted[0].score, scoring.getDailyCorrectScore(persisted[0].answerTimeMs).score);

const expiredProgress = {
  playerId: '00000000-0000-4000-8000-000000000099',
  dateKey: challengeDate,
  category: 'all' as const,
  roundIndex: 0,
  trackId: 'track-expired',
  startedAt: 1000,
  status: 'pending' as const,
  score: 0,
  speedBonus: 0,
  answerTimeMs: 0,
};
await dbService.getOrCreateDailyRoundProgress(expiredProgress);
const expiration = await scoring.finalizeDailyRound({
  ...expiredProgress,
  outcome: 'correct',
  now: 1000 + types.DAILY_ALLOWED_TIME_MS,
});
assert.equal(expiration.status, 'expired', 'late answers are finalized as timeout, even if correct');
assert.equal(expiration.scoreDelta, 0);

const rankingDate = '2099-11-07';
const candidates = [
  { id: 'rank-4', playerId: 'p4', dateKey: rankingDate, category: 'all' as const, playerName: 'Tie B', score: 700, correctCount: 2, skipCount: 0, totalAnswerTimeMs: 8000, createdAt: new Date().toISOString() },
  { id: 'rank-3', playerId: 'p3', dateKey: rankingDate, category: 'all' as const, playerName: 'Tie A', score: 700, correctCount: 2, skipCount: 0, totalAnswerTimeMs: 7000, createdAt: new Date().toISOString() },
  { id: 'rank-2', playerId: 'p2', dateKey: rankingDate, category: 'all' as const, playerName: 'More skips', score: 700, correctCount: 2, skipCount: 1, totalAnswerTimeMs: 2000, createdAt: new Date().toISOString() },
  { id: 'rank-1', playerId: 'p1', dateKey: rankingDate, category: 'all' as const, playerName: 'More correct', score: 700, correctCount: 3, skipCount: 2, totalAnswerTimeMs: 9000, createdAt: new Date().toISOString() },
];
await Promise.all(candidates.map((entry) => dbService.submitDailyLeaderboard(entry)));
const ranked = await dbService.getDailyLeaderboard(rankingDate, 'all');
assert.deepEqual(ranked.map((entry) => entry.id), ['rank-1', 'rank-3', 'rank-4', 'rank-2']);
const duplicate = await dbService.submitDailyLeaderboard(candidates[0]);
assert.equal(duplicate.inserted, false, 'duplicate daily submissions are ignored');
assert.equal((await dbService.getDailyLeaderboard(rankingDate, 'all')).length, 4);
const concurrentEntry = { ...candidates[0], id: 'rank-concurrent', playerId: 'concurrent-player' };
const concurrentSubmissions = await Promise.all([
  dbService.submitDailyLeaderboard(concurrentEntry),
  dbService.submitDailyLeaderboard(concurrentEntry),
]);
assert.equal(concurrentSubmissions.filter((result) => result.inserted).length, 1);
assert.equal((await dbService.getDailyLeaderboard(rankingDate, 'all')).length, 5);

const catalogSnapshot = [...songPool.entries()];
songPool.clear();
const emptyCatalogResponse = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: {} } as never, emptyCatalogResponse as never);
assert.equal(emptyCatalogResponse.statusCode, 503, 'an empty catalog must end loading with an unavailable response');
assert.equal((emptyCatalogResponse.body as { code: number }).code, -503);
for (const [id, song] of catalogSnapshot) songPool.set(id, song);

const originalProgressReader = dbService.getDailyRoundProgress;
dbService.getDailyRoundProgress = async () => { throw new Error('private database connection detail'); };
const failedDatabaseResponse = mockResponse();
await handleDaily({ query: { category: 'all' }, headers: {} } as never, failedDatabaseResponse as never);
assert.equal(failedDatabaseResponse.statusCode, 503);
assert.ok(!(failedDatabaseResponse.body as { message: string }).message.includes('private database connection detail'));
dbService.getDailyRoundProgress = originalProgressReader;

console.log('Daily Challenge regression checks passed: timing inheritance, scoring bounds, timeout, Bangkok reset, signed sessions, stable shared sequence and refresh, successful five-round response, empty catalog and database errors, correct/wrong/skip gameplay, atomic duplicate finalization, deterministic ranking, and concurrent/duplicate leaderboard submissions.');
fs.rmSync(tempDir, { recursive: true, force: true });
