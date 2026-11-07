import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-guesser-test-'));
const testDatabasePath = path.join(tempDir, 'guesser-test.db');
fs.copyFileSync(path.resolve('data/beatdrop.db'), testDatabasePath);
process.env.BEATDROP_SQLITE_PATH = testDatabasePath;
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
process.env.NODE_ENV = 'test';

const { selectGuesserChoices, getStableSongArtistId, getSongArtistGender } = await import('../lib/engine/guesserChoices');
const { dbService } = await import('../lib/db');
const { signRoundToken } = await import('../lib/token');
const { activeRounds, handleGuess, handleSkip, handleStartRound } = await import('../lib/engine/roundEngine');
const { ensureCatalogLoaded, songPool } = await import('../lib/engine/songPool');

function song(id: string, artistId: string, artistName: string, genre: string) {
  return {
    id,
    title: `Track ${id}`,
    artistId,
    artistName,
    albumName: 'Album',
    releaseYear: 2024,
    genre,
    category: 'international' as const,
    previewUrl: `https://audio.test/${id}.m4a`,
    artworkUrl: '',
    popularityScore: 50,
  };
}

const malePool = [
  song('m0', '111051', 'Eminem', 'Hip-Hop/Rap'),
  song('m1', '966309175', 'Post Malone', 'Hip-Hop/Rap'),
  song('m2', '1662974223', 'GUNNER', 'Hip-Hop/Rap'),
  song('m3', '1697337266', 'ILLSLICK', 'Hip-Hop/Rap'),
  song('f0', '159260351', 'Taylor Swift', 'Pop'),
];
const selectedMale = selectGuesserChoices(malePool);
assert.ok(selectedMale);
assert.equal(selectedMale.choices.length, 4);
assert.equal(new Set(selectedMale.choices.map((choice) => getStableSongArtistId(malePool.find((item) => item.id === choice.id)!))).size, 4);
assert.ok(selectedMale.choices.every((choice) => getSongArtistGender(malePool.find((item) => item.id === choice.id)!) === 'male'));
assert.ok(selectedMale.choices.slice(1).every((choice) => malePool.find((item) => item.id === choice.id)?.genre === selectedMale.answer.genre));

const femalePool = [
  song('w0', '159260351', 'Taylor Swift', 'Pop'),
  song('w1', '64387566', 'Katy Perry', 'Pop'),
  song('w2', '390647681', 'Sabrina Carpenter', 'Pop'),
  song('w3', '979458609', 'Olivia Rodrigo', 'Pop'),
  song('m1', '111051', 'Eminem', 'Hip-Hop/Rap'),
];
const selectedFemale = selectGuesserChoices(femalePool);
assert.ok(selectedFemale);
assert.equal(selectedFemale.choices.length, 4);
assert.ok(selectedFemale.choices.every((choice) => getSongArtistGender(femalePool.find((item) => item.id === choice.id)!) === 'female'));

const unknownPool = [
  song('u0', 'unknown-1', 'Unknown One', 'Rock'),
  song('u1', 'unknown-2', 'Unknown Two', 'Rock'),
  song('u2', 'unknown-3', 'Unknown Three', 'Pop'),
  song('u3', 'unknown-4', 'Unknown Four', 'Pop'),
];
const selectedUnknown = selectGuesserChoices(unknownPool);
assert.ok(selectedUnknown, 'unknown metadata must gracefully retain a four-choice game');
assert.equal(selectedUnknown.choices.length, 4);
assert.equal(selectGuesserChoices(malePool.filter((item) => item.artistId !== '966309175' && item.artistId !== '1662974223' && item.artistId !== '1697337266')), null, 'known male answers need three other known male artists');

ensureCatalogLoaded();
const gameStartResponse = {
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
};
await handleStartRound({ query: { category: 'thai', difficulty: 'easy', mode: 'guesser' } } as never, gameStartResponse as never);
assert.equal(gameStartResponse.statusCode, 200);
const startedGame = (gameStartResponse.body as { data: { roundToken: string; choices: Array<{ id: string }> } }).data;
assert.equal(startedGame.choices.length, 4);
const choiceSongs = startedGame.choices.map((choice) => songPool.get(choice.id)!);
assert.equal(new Set(choiceSongs.map(getStableSongArtistId)).size, 4, 'real Song Guesser round must use four artist IDs');
const correctArtistGender = getSongArtistGender(activeRounds.get(startedGame.roundToken)!.track);
if (correctArtistGender) {
  assert.ok(choiceSongs.every((choice) => getSongArtistGender(choice) === correctArtistGender));
}

const skippedTrack = malePool[0];
const roundId = 'test-guesser-skip-round';
const roundState = {
  track: skippedTrack,
  difficulty: 'medium' as const,
  stages: [0.5, 2, 6, 8, 15],
  stage: 0,
  clipSeconds: 0.5,
  mistakes: 0,
  category: 'international' as const,
  mode: 'guesser' as const,
  startedAt: Date.now(),
  roundId,
};
const roundToken = signRoundToken(roundState);
activeRounds.set(roundToken, roundState);
const response = {
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
};
await handleSkip({ body: { roundToken, giveUp: true }, headers: {} } as never, response as never);
assert.equal(response.statusCode, 200);
const skippedBody = response.body as { data: { outcome: string; roundResult: string; reveal: { id: string } } };
assert.equal(skippedBody.data.outcome, 'failed');
assert.equal(skippedBody.data.roundResult, 'skipped');
assert.equal(skippedBody.data.reveal.id, skippedTrack.id, 'a full-song skip reveals and finalizes the current song');
assert.deepEqual(await dbService.claimGuesserRoundResult(roundId, 'correct'), {
  kind: 'already-finalized', result: 'skipped',
}, 'a skipped round cannot later win or add score');
assert.equal(activeRounds.has(roundToken), false, 'skipping consumes and stops the previous round');

const stageSkipState = { ...roundState, roundId: 'test-guesser-stage-skip' };
const stageSkipToken = signRoundToken(stageSkipState);
activeRounds.set(stageSkipToken, stageSkipState);
const stageSkipResponse = {
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
};
await handleSkip({ body: { roundToken: stageSkipToken, giveUp: false }, headers: {} } as never, stageSkipResponse as never);
const stageSkipBody = stageSkipResponse.body as { data: { outcome: string; roundResult?: string; stage: number; roundToken: string } };
assert.equal(stageSkipBody.data.outcome, 'active', 'snippet skip keeps the Song Guesser song active');
assert.equal(stageSkipBody.data.stage, 1);
assert.equal(stageSkipBody.data.roundResult, 'skipped', 'the marker describes the skipped snippet stage, not a finalized song');
assert.ok(activeRounds.has(stageSkipBody.data.roundToken));
const staleStageReplay = {
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
};
await handleSkip({ body: { roundToken: stageSkipToken, giveUp: false }, headers: {} } as never, staleStageReplay as never);
assert.equal(staleStageReplay.statusCode, 400, 'idempotent terminal retries must not reopen old snippet-stage tokens');

const nextRoundResponse = {
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
};
await handleStartRound({ query: { category: 'thai', difficulty: 'easy', mode: 'guesser' } } as never, nextRoundResponse as never);
assert.equal(nextRoundResponse.statusCode, 200);
const nextRound = (nextRoundResponse.body as { data: { roundToken: string; choices: unknown[] } }).data;
assert.notEqual(nextRound.roundToken, roundToken, 'a successful skip transitions to a new round');
assert.equal(nextRound.choices.length, 4, 'the next Song Guesser round retains its four choices');
const duplicateSkip = { ...response, body: null as unknown, statusCode: 200 };
await handleSkip({ body: { roundToken, giveUp: true }, headers: {} } as never, duplicateSkip as never);
assert.equal(duplicateSkip.statusCode, 200, 'a repeated skip returns the already-finalized result');
assert.equal((duplicateSkip.body as { data: { roundResult: string } }).data.roundResult, 'skipped');

const concurrentRoundId = 'test-guesser-concurrent-skip';
const concurrentState = { ...roundState, roundId: concurrentRoundId };
const concurrentToken = signRoundToken(concurrentState);
activeRounds.set(concurrentToken, concurrentState);
const makeResponse = () => ({
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
});
const concurrentResponses = [makeResponse(), makeResponse()];
await Promise.all(concurrentResponses.map((res) => handleSkip(
  { body: { roundToken: concurrentToken, giveUp: true }, headers: {} } as never,
  res as never
)));
assert.equal(concurrentResponses.filter((res) => res.statusCode === 200).length, 2, 'concurrent duplicate skips return the same persisted result');
assert.deepEqual(await dbService.claimGuesserRoundResult(concurrentRoundId, 'correct'), {
  kind: 'already-finalized', result: 'skipped',
});

const wrongRoundClaim = await dbService.claimGuesserRoundResult('test-guesser-wrong-round', 'wrong');
assert.deepEqual(wrongRoundClaim, { kind: 'claimed', result: 'wrong' });
assert.deepEqual(await dbService.claimGuesserRoundResult('test-guesser-wrong-round', 'correct'), {
  kind: 'already-finalized', result: 'wrong',
}, 'wrong answers cannot be replayed as correct answers');

// Simulate remote Supabase where guesser_round_results table returns 404 (not migrated yet)
const prevSupabaseUrl = process.env.SUPABASE_URL;
const prevSupabaseKey = process.env.SUPABASE_ANON_KEY;
const prevFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST205', message: 'table not found' }), { status: 404 });
try {
  const unmigratedSkipState = { ...roundState, roundId: 'test-guesser-unmigrated-skip', startedAt: Date.now() - 200 };
  const unmigratedSkipToken = signRoundToken(unmigratedSkipState);
  activeRounds.set(unmigratedSkipToken, unmigratedSkipState);
  const unmigratedSkipRes = makeResponse();
  await handleSkip({ body: { roundToken: unmigratedSkipToken, giveUp: true }, headers: {} } as never, unmigratedSkipRes as never);
  assert.equal(unmigratedSkipRes.statusCode, 200, 'Song Guesser skip must succeed via fallback when remote table is missing');
  assert.equal((unmigratedSkipRes.body as { data: { reveal: { id: string } } }).data.reveal.id, skippedTrack.id);

  const unmigratedGuessState = { ...roundState, roundId: 'test-guesser-unmigrated-guess', startedAt: Date.now() - 200 };
  const unmigratedGuessToken = signRoundToken(unmigratedGuessState);
  activeRounds.set(unmigratedGuessToken, unmigratedGuessState);
  const unmigratedGuessRes = makeResponse();
  await handleGuess({ body: { roundToken: unmigratedGuessToken, candidateTrackId: skippedTrack.id }, headers: {} } as never, unmigratedGuessRes as never);
  assert.equal(unmigratedGuessRes.statusCode, 200, 'Song Guesser guess must succeed via fallback when remote table is missing');
  assert.equal((unmigratedGuessRes.body as { data: { outcome: string; reveal: { id: string } } }).data.outcome, 'correct');
  assert.equal((unmigratedGuessRes.body as { data: { outcome: string; reveal: { id: string } } }).data.reveal.id, skippedTrack.id);
} finally {
  globalThis.fetch = prevFetch;
  if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevSupabaseUrl;
  if (prevSupabaseKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prevSupabaseKey;
}

console.log('Song Guesser checks passed: helper and real-route four-choice behavior, distinct artist IDs, male/female gender consistency, genre preference, unknown metadata fallback, insufficient-data handling, skip-to-next-round transition, duplicate/concurrent skip rejection, and no skipped/wrong round score claim.');
fs.rmSync(tempDir, { recursive: true, force: true });
