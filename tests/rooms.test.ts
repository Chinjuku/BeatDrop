/**
 * Live rooms: pure timeline rules plus the API flow (create → join → start → answer → finish)
 * against the in-memory store and a throwaway SQLite catalog. No network, no cloud services.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatdrop-rooms-test-'));
fs.copyFileSync(path.resolve('data/beatdrop.db'), path.join(tempDir, 'rooms-test.db'));
process.env.BEATDROP_SQLITE_PATH = path.join(tempDir, 'rooms-test.db');
process.env.BEATDROP_CUSTOM_ARTISTS_PATH = path.join(tempDir, 'custom-artists.json');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL']) {
  delete process.env[key];
}
(process.env as Record<string, string>).NODE_ENV = 'test';
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('network disabled in room tests');
}) as typeof fetch;

const { ROOM_LIMITS, DEFAULT_ROOM_SETTINGS } = await import('../shared/roomTypes');
const timeline = await import('../lib/rooms/timeline');
const { getRoomStore } = await import('../lib/rooms/store');
const { parsePlayerName, parseRoomSettings } = await import('../lib/rooms/service');
const roomsRoute = await import('../app/api/rooms/route');
const roomRoute = await import('../app/api/rooms/[code]/route');
const joinRoute = await import('../app/api/rooms/[code]/join/route');
const startRoute = await import('../app/api/rooms/[code]/start/route');
const answerRoute = await import('../app/api/rooms/[code]/answer/route');
const leaveRoute = await import('../app/api/rooms/[code]/leave/route');

type RoomState = import('../lib/rooms/timeline').RoomState;

before(async () => {
  const { ensureCatalogLoaded } = await import('../lib/engine/songPool');
  ensureCatalogLoaded();
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function baseRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDE',
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
      songId: `s${i}`,
      audioUrl: `https://audio.test/${i}.m4a`,
      reveal: { id: `s${i}`, title: `Song ${i}`, artistName: 'Artist' },
      answers: {},
    })),
    ...overrides,
  };
}

describe('room timeline (pure)', () => {
  const C = ROOM_LIMITS.countdownMs;
  const A = DEFAULT_ROOM_SETTINGS.answerSeconds * 1000;
  const R = ROOM_LIMITS.revealMs;

  it('walks countdown → guessing → reveal → next round → finished', () => {
    const room = baseRoom();
    assert.equal(timeline.locate(room, 1_000).phase, 'countdown');
    assert.equal(timeline.locate(room, 1_000 + C).phase, 'guessing');
    assert.equal(timeline.locate(room, 1_000 + C + A).phase, 'reveal');
    const second = timeline.locate(room, 1_000 + C + A + R);
    assert.deepEqual([second.phase, second.roundIndex], ['countdown', 1]);
    assert.equal(timeline.locate(room, 1_000 + 2 * (C + A + R)).phase, 'finished');
  });

  it('scores 1000 → 100 across the answer window, measured from play time', () => {
    assert.equal(timeline.scoreForAnswer(0, 0, 20), 1000);
    assert.equal(timeline.scoreForAnswer(0, 10_000, 20), 550);
    assert.equal(timeline.scoreForAnswer(0, 30_000, 20), 100);
  });

  it('rejects answers during the countdown and ends the round early once everyone is done', () => {
    const room = baseRoom();
    const playAt = 1_000 + C;
    assert.deepEqual(timeline.applyAnswer(room, 'h', true, playAt - 1), { ok: false, reason: 'not-guessing' });

    const host = timeline.applyAnswer(room, 'h', true, playAt + 2_000);
    assert.ok(host.ok && host.correct && host.points === 910);
    assert.deepEqual(timeline.applyAnswer(room, 'h', true, playAt + 2_500), { ok: false, reason: 'already-done' });

    for (let i = 0; i < ROOM_LIMITS.maxAttempts; i++) timeline.applyAnswer(room, 'p', false, playAt + 3_000 + i);
    assert.equal(room.rounds[0].finishedAt, playAt + 3_000 + ROOM_LIMITS.maxAttempts - 1);
    assert.equal(timeline.locate(room, playAt + 3_100).phase, 'reveal', 'round ends early when all are done');
    assert.equal(room.players.find((p) => p.id === 'h')!.score, 910);
  });

  it('never shows the answer before the reveal', () => {
    const room = baseRoom();
    const guessing = timeline.buildView(room, 'p', 1_000 + C + 10);
    assert.equal(guessing.reveal, undefined);
    assert.equal(JSON.stringify(guessing).includes('Song 0'), false);
    const reveal = timeline.buildView(room, 'p', 1_000 + C + A + 10);
    assert.equal(reveal.reveal?.title, 'Song 0');
  });
});

describe('room input validation', () => {
  it('cleans names and falls back to safe settings', () => {
    assert.equal(parsePlayerName('  Pat\u0000  \n Lee '), 'Pat Lee');
    assert.equal(parsePlayerName('   '), null);
    assert.equal(Array.from(parsePlayerName('ก'.repeat(50))!).length, ROOM_LIMITS.nameMaxLength);
    const s = parseRoomSettings({ rounds: 999, clipSeconds: 7, category: 'jazz', audio: 'host', difficulty: 'hard' });
    assert.deepEqual([s.rounds, s.clipSeconds, s.category, s.audio, s.difficulty], [10, 5, 'all', 'host', 'hard']);
  });
});

// --- API flow -------------------------------------------------------------------------------

type Handler = (req: Request, ctx: { params: Promise<{ code: string }> }) => Promise<Response>;
let ip = 1;

async function call(handler: Handler, method: 'GET' | 'POST', code: string, opts: { body?: unknown; token?: string } = {}) {
  const headers = new Headers({ 'x-forwarded-for': `172.16.0.${ip++ % 250}` });
  if (opts.token) headers.set('x-room-token', opts.token);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const res = await handler(
    new Request(`http://localhost/api/rooms/${code}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: Promise.resolve({ code }) }
  );
  return { status: res.status, json: await res.json() };
}

/** Moves the stored room's clock back so the next phase starts now (no sleeping in tests). */
async function shiftStart(code: string, ms: number) {
  const store = getRoomStore()!;
  const room = (await store.get(code))!;
  room.startedAt = (room.startedAt ?? 0) - ms;
  await store.replace({ ...room, version: room.version + 1 }, room.version);
}

describe('room API flow', () => {
  it('create → join → start → answer → reveal → finished', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', {
      body: { name: 'Host', settings: { rounds: 5, audio: 'host', category: 'all' } },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const code = created.json.data.room.code as string;
    const hostToken = created.json.data.playerToken as string;
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(created.json.data.room.phase, 'lobby');

    const outsider = await call(roomRoute.GET as Handler, 'GET', code);
    assert.equal(outsider.json.data.preview.players, 1, 'outsiders only see a preview');
    assert.equal(outsider.json.data.room, undefined);

    const joined = await call(joinRoute.POST as Handler, 'POST', code, { body: { name: 'Pat' } });
    assert.equal(joined.status, 200);
    const patToken = joined.json.data.playerToken as string;
    assert.equal(joined.json.data.room.players.length, 2);

    const notHost = await call(startRoute.POST as Handler, 'POST', code, { token: patToken });
    assert.equal(notHost.status, 403);
    const started = await call(startRoute.POST as Handler, 'POST', code, { token: hostToken });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.equal(started.json.data.room.phase, 'countdown');
    assert.equal(started.json.data.room.totalRounds, 5);
    assert.ok(started.json.data.room.audioUrl, 'clients get the clip to preload');

    const early = await call(answerRoute.POST as Handler, 'POST', code, { token: hostToken, body: { candidateTrackId: 'x' } });
    assert.equal(early.status, 409, 'no answers during the countdown');

    await shiftStart(code, ROOM_LIMITS.countdownMs + 500);
    const store = getRoomStore()!;
    const answerId = (await store.get(code))!.rounds[0].songId;

    const wrong = await call(answerRoute.POST as Handler, 'POST', code, { token: patToken, body: { candidateTrackId: 'nope' } });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.json.data.answer.correct, false);
    assert.equal(wrong.json.data.answer.attemptsLeft, ROOM_LIMITS.maxAttempts - 1);

    const right = await call(answerRoute.POST as Handler, 'POST', code, { token: hostToken, body: { candidateTrackId: answerId } });
    assert.equal(right.json.data.answer.correct, true);
    assert.ok(right.json.data.answer.points > 900, `fast answer scores high (${right.json.data.answer.points})`);

    const forged = await call(answerRoute.POST as Handler, 'POST', code, { token: `${patToken.split('.')[0]}.forged`, body: { candidateTrackId: answerId } });
    assert.equal(forged.status, 401, 'a forged token is rejected');

    // Pat finishes (two more misses) → round ends early → reveal.
    await call(answerRoute.POST as Handler, 'POST', code, { token: patToken, body: { candidateTrackId: 'nope' } });
    await call(answerRoute.POST as Handler, 'POST', code, { token: patToken, body: { candidateTrackId: 'nope' } });
    const reveal = await call(roomRoute.GET as Handler, 'GET', code, { token: patToken });
    assert.equal(reveal.json.data.room.phase, 'reveal');
    assert.equal(reveal.json.data.room.reveal.id, answerId);
    assert.equal(reveal.json.data.room.players[0].name, 'Host', 'scoreboard is sorted by score');

    await shiftStart(code, 10 * 60 * 1000);
    const done = await call(roomRoute.GET as Handler, 'GET', code, { token: hostToken });
    assert.equal(done.json.data.room.phase, 'finished');

    // Host leaves → Pat becomes host and can start a rematch.
    await call(leaveRoute.POST as Handler, 'POST', code, { token: hostToken });
    const rematch = await call(startRoute.POST as Handler, 'POST', code, { token: patToken });
    assert.equal(rematch.status, 200, JSON.stringify(rematch.json));
    assert.equal(rematch.json.data.room.players.length, 1);
    assert.equal(rematch.json.data.room.players[0].score, 0);
  });

  it('404s unknown rooms and rejects bad codes', async () => {
    assert.equal((await call(roomRoute.GET as Handler, 'GET', 'ZZZZZ')).status, 404);
    assert.equal((await call(roomRoute.GET as Handler, 'GET', 'bad!')).status, 404);
  });

  it('room GET is read-only', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', { body: { name: 'Solo' } });
    const code = created.json.data.room.code as string;
    const before = (await getRoomStore()!.get(code))!.version;
    for (let i = 0; i < 3; i++) await call(roomRoute.GET as Handler, 'GET', code, { token: created.json.data.playerToken });
    assert.equal((await getRoomStore()!.get(code))!.version, before);
  });
});

// --- Buzzer mode ----------------------------------------------------------------------------

describe('buzzer mode (pure)', () => {
  const C = ROOM_LIMITS.countdownMs;
  const A = DEFAULT_ROOM_SETTINGS.answerSeconds * 1000;
  const B = ROOM_LIMITS.buzzAnswerMs;
  const playAt = 1_000 + C;
  const buzzerRoom = () =>
    baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer' },
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });

  it('first buzz wins the turn; others must wait; only the holder may answer', () => {
    const room = buzzerRoom();
    assert.deepEqual(timeline.applyBuzz(room, 'p', playAt - 1), { ok: false, reason: 'not-guessing' });
    assert.ok(timeline.applyBuzz(room, 'p', playAt + 1_000).ok);
    assert.deepEqual(timeline.applyBuzz(room, 'q', playAt + 1_010), { ok: false, reason: 'taken' });
    assert.deepEqual(timeline.applyBuzzAnswer(room, 'q', true, playAt + 1_500), { ok: false, reason: 'not-your-turn' });
    const view = timeline.buildView(room, 'q', playAt + 1_200);
    assert.equal(view.buzz?.holderName, 'Pat');
    assert.equal(view.buzz?.canBuzz, false);
  });

  it('a wrong answer locks the holder out and frees the buzzer', () => {
    const room = buzzerRoom();
    timeline.applyBuzz(room, 'p', playAt + 1_000);
    const wrong = timeline.applyBuzzAnswer(room, 'p', false, playAt + 2_000);
    assert.ok(wrong.ok && !wrong.correct);
    assert.deepEqual(timeline.applyBuzz(room, 'p', playAt + 2_100), { ok: false, reason: 'locked-out' });
    assert.ok(timeline.applyBuzz(room, 'q', playAt + 2_200).ok, 'someone else can buzz now');
  });

  it('a correct answer scores by buzz time and ends the song at once', () => {
    const room = buzzerRoom();
    timeline.applyBuzz(room, 'q', playAt + 2_000);
    const right = timeline.applyBuzzAnswer(room, 'q', true, playAt + 6_000);
    assert.ok(right.ok && right.correct);
    assert.equal(right.points, timeline.scoreForAnswer(playAt, playAt + 2_000, 20), 'thinking time is not penalised');
    assert.equal(timeline.locate(room, playAt + 6_001).phase, 'reveal');
    assert.equal(room.players.find((p) => p.id === 'q')!.score, right.points);
  });

  it('running out of answer time locks the holder out', () => {
    const room = buzzerRoom();
    timeline.applyBuzz(room, 'p', playAt + 1_000);
    const later = playAt + 1_000 + B + 1;
    assert.deepEqual(timeline.applyBuzzAnswer(room, 'p', true, later), { ok: false, reason: 'not-your-turn' });
    assert.equal(timeline.buildView(room, 'p', later).buzz?.lockedOut, true);
    assert.equal(timeline.buildView(room, 'q', later).buzz?.canBuzz, true);
  });

  it('a buzz just before the timer still gets its full answer time', () => {
    const room = buzzerRoom();
    const buzzAt = playAt + A - 500;
    assert.ok(timeline.applyBuzz(room, 'p', buzzAt).ok);
    assert.equal(timeline.locate(room, playAt + A + 1_000).phase, 'guessing');
    assert.deepEqual(timeline.applyBuzz(room, 'q', playAt + A + 1_000), { ok: false, reason: 'too-late' }, 'no new buzzes after the timer');
    assert.ok(timeline.applyBuzzAnswer(room, 'p', true, buzzAt + B - 1).ok);
  });

  it('ends early when every player has been locked out by wrong answers', () => {
    const room = buzzerRoom();
    let t = playAt + 500;
    for (const id of ['h', 'p', 'q']) {
      timeline.applyBuzz(room, id, t);
      timeline.applyBuzzAnswer(room, id, false, t + 100);
      t += 1_000;
    }
    assert.equal(timeline.locate(room, t).phase, 'reveal');
  });
});

describe('buzzer mode API', () => {
  it('buzz → answer flow and losing the race returns the current view', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', {
      body: { name: 'Host', settings: { mode: 'buzzer', rounds: 5 } },
    });
    assert.equal(created.json.data.room.settings.mode, 'buzzer');
    const code = created.json.data.room.code as string;
    const host = created.json.data.playerToken as string;
    const pat = (await call(joinRoute.POST as Handler, 'POST', code, { body: { name: 'Pat' } })).json.data.playerToken as string;
    await call(startRoute.POST as Handler, 'POST', code, { token: host });
    await shiftStart(code, ROOM_LIMITS.countdownMs + 200);

    const buzzRoute = await import('../app/api/rooms/[code]/buzz/route');
    const first = await call(buzzRoute.POST as Handler, 'POST', code, { token: pat });
    assert.equal(first.status, 200);
    assert.equal(first.json.data.room.buzz.holderId, first.json.data.room.me.id);

    const second = await call(buzzRoute.POST as Handler, 'POST', code, { token: host });
    assert.equal(second.status, 409);
    assert.equal(second.json.data.room.buzz.holderName, 'Pat', 'the loser sees who has the buzzer');

    const notHolder = await call(answerRoute.POST as Handler, 'POST', code, { token: host, body: { candidateTrackId: 'x' } });
    assert.equal(notHolder.status, 409);

    const answerId = (await getRoomStore()!.get(code))!.rounds[0].songId;
    const right = await call(answerRoute.POST as Handler, 'POST', code, { token: pat, body: { candidateTrackId: answerId } });
    assert.equal(right.status, 200);
    assert.equal(right.json.data.answer.correct, true);
    assert.equal(right.json.data.room.phase, 'reveal');
  });

  it('buzz is rejected in everyone-answers rooms', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', { body: { name: 'Host' } });
    const buzzRoute = await import('../app/api/rooms/[code]/buzz/route');
    const res = await call(buzzRoute.POST as Handler, 'POST', created.json.data.room.code, { token: created.json.data.playerToken });
    assert.equal(res.status, 409);
  });
});
