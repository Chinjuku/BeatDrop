/**
 * Daily archive, Supabase path, against a mocked PostgREST. Checks the rollout guarantee:
 * the app works both before and after the daily_challenges.difficulty migration.
 * Never contacts a real server (fetch is replaced; the URL is a reserved .test domain).
 */
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://archive-mock.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
delete process.env.DB_LOCAL;
delete process.env.VERCEL;

const IDS = ['a', 'b', 'c', 'd', 'e'];
type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let migrated = false;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://archive-mock.supabase.test/')) throw new Error(`unexpected fetch ${url}`);
  const method = init?.method ?? 'GET';
  calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
  const usesDifficulty = /difficulty/.test(url) || /"difficulty"/.test(String(init?.body ?? ''));
  if (usesDifficulty && !migrated) {
    return new Response(JSON.stringify({ code: '42703', message: 'column daily_challenges.difficulty does not exist' }), { status: 400 });
  }
  if (method === 'POST') return new Response(null, { status: 201 });
  if (url.includes('select=date_key')) return Response.json([{ date_key: '2026-01-02' }, { date_key: '2026-01-01' }]);
  return Response.json([{ song_ids: IDS }]);
}) as typeof fetch;

const { supabaseAdmin } = await import('../shared/supabase');

beforeEach(() => {
  calls = [];
});
after(() => {
  globalThis.fetch = realFetch;
});

describe('before the difficulty migration', () => {
  it('Easy falls back to the old query; harder levels report "not stored"', async () => {
    migrated = false;
    assert.deepEqual(await supabaseAdmin.getStoredDailyChallengeIds('2026-01-01', 'all', 'easy'), IDS);
    assert.equal(calls.length, 2, 'one new-shape attempt, one legacy retry');
    assert.equal(calls[1].url.includes('difficulty'), false);

    calls = [];
    assert.equal(await supabaseAdmin.getStoredDailyChallengeIds('2026-01-01', 'all', 'hard'), null);
    assert.equal(calls.length, 1, 'no legacy retry for non-Easy');
  });

  it('listing and persistence degrade instead of failing', async () => {
    migrated = false;
    assert.deepEqual(await supabaseAdmin.listDailyChallengeDates('all', 'easy', '2026-02-01', 60), ['2026-01-02', '2026-01-01']);
    assert.deepEqual(await supabaseAdmin.listDailyChallengeDates('all', 'medium', '2026-02-01', 60), []);
    assert.deepEqual(await supabaseAdmin.getOrCreateDailyChallengeIdsForDifficulty('2026-01-01', 'all', 'medium', IDS), []);
  });
});

describe('after the difficulty migration', () => {
  it('reads and persists per difficulty', async () => {
    migrated = true;
    assert.deepEqual(await supabaseAdmin.getStoredDailyChallengeIds('2026-01-01', 'all', 'hard'), IDS);
    assert.match(calls[0].url, /difficulty=eq\.hard/);

    calls = [];
    assert.deepEqual(await supabaseAdmin.getOrCreateDailyChallengeIdsForDifficulty('2026-01-01', 'all', 'expert', IDS), IDS);
    const insert = calls.find((c) => c.method === 'POST')!;
    assert.match(insert.url, /on_conflict=date_key,category,difficulty/);
    assert.deepEqual(JSON.parse(insert.body!), { date_key: '2026-01-01', category: 'all', difficulty: 'expert', song_ids: IDS });
  });
});
