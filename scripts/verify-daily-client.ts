import assert from 'node:assert/strict';
import { readDailyChallengeResponse, DailyChallengeLoadError } from '../shared/dailyChallengeClient';
import { DAILY_ROUND_COUNT, SONGSPOT_STAGES } from '../shared/types';

const challenge = {
  dateKey: '2026-11-06',
  category: 'all' as const,
  totalRounds: DAILY_ROUND_COUNT,
  rounds: Array.from({ length: DAILY_ROUND_COUNT }, (_, index) => ({
    roundToken: index === 0 ? 'signed-round-token' : '',
    roundKey: `daily-round-${index}`,
    audioUrl: `https://audio.example/${index}.m4a`,
    difficulty: 'medium' as const,
    stages: SONGSPOT_STAGES,
    stage: 0,
    clipSeconds: SONGSPOT_STAGES[0],
    category: 'all' as const,
    mode: 'daily' as const,
    poolSize: 500,
    expiresAt: index === 0 ? Date.now() + 60_000 : 0,
  })),
  currentIndex: 0,
  results: Array.from({ length: DAILY_ROUND_COUNT }, () => 'pending' as const),
  score: 0,
  correctCount: 0,
  skipCount: 0,
  totalAnswerTimeMs: 0,
};

const success = await readDailyChallengeResponse({
  ok: true,
  json: async () => ({ code: 0, data: challenge }),
});
assert.equal(success.rounds.length, 5, 'valid challenge must contain five rounds');
assert.equal(success.dateKey, challenge.dateKey);

const failureCases: Array<{ name: string; response: { ok: boolean; json: () => Promise<unknown> } }> = [
  { name: 'HTTP error', response: { ok: false, json: async () => ({ code: -503, message: 'private detail' }) } },
  { name: 'API error', response: { ok: true, json: async () => ({ code: -503, message: 'private detail' }) } },
  { name: 'empty data', response: { ok: true, json: async () => ({ code: 0, data: null }) } },
  {
    name: 'short challenge',
    response: { ok: true, json: async () => ({ code: 0, data: { ...challenge, rounds: challenge.rounds.slice(0, 4) } }) },
  },
  { name: 'invalid JSON', response: { ok: true, json: async () => { throw new Error('secret database detail'); } } },
];

for (const testCase of failureCases) {
  await assert.rejects(readDailyChallengeResponse(testCase.response), (error: unknown) => {
    assert.ok(error instanceof DailyChallengeLoadError, `${testCase.name} should use the public error`);
    assert.ok(!error.message.includes('private detail'));
    assert.ok(!error.message.includes('secret database detail'));
    return true;
  });
}

console.log('Daily client response checks passed: five-round success, HTTP/API errors, empty/malformed data, and sanitized errors.');
