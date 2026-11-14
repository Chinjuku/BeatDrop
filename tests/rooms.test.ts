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
const clock = await import('../lib/rooms/clock');
const { getRoomStore } = await import('../lib/rooms/store');
const { parsePlayerName, parseRoomSettings, parseClipSeconds } = await import('../lib/rooms/service');
const pauseRules = await import('../lib/rooms/pause');
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
    // Rooms started since buzz holds froze the clock always carry `pauses` (see handleStartRoom).
    ...(overrides.settings?.mode === 'buzzer' && !('pauses' in overrides) ? { pauses: [] } : {}),
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
    assert.equal(timeline.scoreForAnswer(0, 20), 1000);
    assert.equal(timeline.scoreForAnswer(10_000, 20), 550);
    assert.equal(timeline.scoreForAnswer(30_000, 20), 100);
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

describe('correct-answer feed and colours', () => {
  const C = ROOM_LIMITS.countdownMs;
  const playAt = 1_000 + C;
  const threeRoom = () =>
    baseRoom({
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });

  it('correct lists who got it, never the song', () => {
    const room = threeRoom();
    assert.deepEqual(timeline.buildView(room, 'p', playAt + 500).correct, []);
    timeline.applyAnswer(room, 'q', true, playAt + 3_000);
    timeline.applyAnswer(room, 'h', true, playAt + 2_000);
    const view = timeline.buildView(room, 'p', playAt + 3_500);
    assert.deepEqual(view.correct.map((c) => [c.playerId, c.name, c.at]), [
      ['h', 'Host', playAt + 2_000],
      ['q', 'Quinn', playAt + 3_000],
    ]);
    assert.ok(view.correct.every((c) => c.points > 0));
    assert.equal(view.reveal, undefined);
    assert.equal(JSON.stringify(view).includes('Song 0'), false);
    assert.deepEqual(timeline.buildView(room, 'p', 1_000 + 10).correct, [], 'empty during countdown');
  });

  it('colorIndex is stable when scores reorder players', () => {
    const room = threeRoom();
    timeline.applyAnswer(room, 'q', true, playAt + 1_000);
    const view = timeline.buildView(room, 'h', playAt + 1_500);
    assert.equal(view.players[0].id, 'q', 'leader sorted first');
    const idx = Object.fromEntries(view.players.map((p) => [p.id, p.colorIndex]));
    assert.deepEqual(idx, { h: 0, p: 1, q: 2 });
  });

  it('palette has 11 distinct non-viewer colours; viewer is the accent', async () => {
    const { ROOM_PLAYER_COLORS, playerColor } = await import('../shared/roomColors');
    assert.equal(ROOM_PLAYER_COLORS.length, 11);
    assert.equal(new Set(ROOM_PLAYER_COLORS).size, 11);
    assert.equal(playerColor(3, true), 'var(--song-accent)');
    assert.equal(playerColor(13, false), ROOM_PLAYER_COLORS[2]);
  });

  it('colorSlotOf skips the viewer so 11 others are always distinct', async () => {
    const { ROOM_PLAYER_COLORS, playerColor, colorSlotOf } = await import('../shared/roomColors');
    const players = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, colorIndex: i }));
    for (const viewer of ['u0', 'u5', 'u11']) {
      const colours = players.filter((p) => p.id !== viewer).map((p) => playerColor(colorSlotOf(players, p.id, viewer), false));
      assert.equal(new Set(colours).size, 11, `viewer ${viewer}`);
      assert.ok(colours.every((c) => ROOM_PLAYER_COLORS.includes(c)));
    }
    assert.equal(colorSlotOf(players, 'u3', 'u0'), 2);
    assert.equal(colorSlotOf(players, 'u3', 'u9'), 3);
    // Shuffled order (scoreboard sorts by score) gives the same slots.
    assert.equal(colorSlotOf([...players].reverse(), 'u3', 'u0'), 2);
  });
});

describe('round timer', () => {
  it('holds steady while frozen and resumes counting after', async () => {
    const { roundRemainingMs, roundProgress } = await import('../shared/roomTimer');
    // endsAt already includes a planned 10 s hold ending at 20_000.
    const v = { endsAt: 35_000, buzz: { holderId: 'p', deadline: 20_000 } };
    assert.equal(roundRemainingMs(v, 10_000), 15_000);
    assert.equal(roundRemainingMs(v, 15_000), 15_000);
    assert.equal(roundRemainingMs(v, 20_000), 15_000);
    assert.equal(roundRemainingMs(v, 25_000), 10_000);
    const paused = { endsAt: 50_000, pause: { until: 30_000 } };
    assert.equal(roundRemainingMs(paused, 12_000), 20_000);
    assert.equal(roundRemainingMs({ endsAt: 10_000 }, 12_000), 0);
    assert.equal(roundRemainingMs({}, 12_000), 0);
    assert.equal(roundProgress(15_000, 20_000), 0.75);
    assert.equal(roundProgress(25_000, 20_000), 1);
    assert.equal(roundProgress(5, 0), 0);
  });
});

describe('game clock', () => {
  const C = ROOM_LIMITS.countdownMs;
  const playAt = 1_000 + C;

  it('activeElapsed / wallAfter skip freezes', () => {
    const f = [{ from: 10, until: 20 }, { from: 30, until: 35 }];
    assert.equal(clock.activeElapsed(f, 0, 40), 25);
    assert.equal(clock.wallAfter(f, 0, 25), 40);
    assert.equal(clock.wallAfter(f, 0, 10), 10); // reached exactly when a freeze starts → before it
    assert.equal(clock.activeElapsed(f, 15, 32), 10, 'starts inside a freeze');
    assert.equal(clock.wallAfter(f, 15, 3), 23, 'start inside a freeze waits for its end');
    assert.equal(clock.activeElapsed([{ from: 0, until: 10 }, { from: 5, until: 15 }], 0, 20), 5, 'overlaps count once');
    assert.deepEqual(clock.frozenAt(f, 10), f[0]);
    assert.equal(clock.frozenAt(f, 20), undefined);
    assert.equal(clock.frozenAt(f, 9), undefined);
  });

  it('a pause shifts the current and later phases but not earlier rounds', () => {
    const room = baseRoom();
    const before = timeline.locate(room, 1_000 + C + 5_000);
    const nextBefore = timeline.locate(room, before.revealEndsAt!);
    room.pauses = [{ from: 1_000 + C + 5_000, until: 1_000 + C + 15_000, byId: 'h' }];
    const after = timeline.locate(room, 1_000 + C + 15_000);
    assert.equal(after.endsAt, before.endsAt! + 10_000);
    assert.equal(after.revealEndsAt, before.revealEndsAt! + 10_000);
    assert.equal(after.playAt, before.playAt);
    assert.equal(timeline.locate(room, 1_000 + C + 10_000).phase, 'guessing', 'paused in the phase it was paused in');
    const nextAfter = timeline.locate(room, before.revealEndsAt! + 10_000);
    assert.deepEqual([nextAfter.roundIndex, nextAfter.playAt], [1, nextBefore.playAt! + 10_000]);

    // A pause in round 2 never moves round 1.
    const later = baseRoom();
    const r1 = timeline.locate(later, playAt);
    later.pauses = [{ from: nextBefore.playAt! + 1_000, until: nextBefore.playAt! + 5_000, byId: 'h' }];
    assert.deepEqual(timeline.locate(later, playAt), r1);
  });

  it('scoring excludes frozen time', () => {
    const room = baseRoom();
    room.pauses = [{ from: playAt + 2_000, until: playAt + 12_000, byId: 'h' }];
    const res = timeline.applyAnswer(room, 'h', true, playAt + 15_000);
    assert.ok(res.ok);
    assert.equal(res.points, timeline.scoreForAnswer(5_000, 20));
  });

  it('answer exactly at freeze boundaries', () => {
    const room = baseRoom();
    room.pauses = [{ from: playAt + 5_000, until: playAt + 15_000, byId: 'h' }];
    assert.deepEqual(timeline.applyAnswer(room, 'h', true, playAt + 5_000), { ok: false, reason: 'paused' });
    assert.deepEqual(timeline.applyAnswer(room, 'h', true, playAt + 14_999), { ok: false, reason: 'paused' });
    const at = timeline.applyAnswer(room, 'h', true, playAt + 15_000);
    assert.ok(at.ok && at.correct);
    assert.equal(at.points, timeline.scoreForAnswer(5_000, 20));
  });

  it('a buzz is rejected while paused', () => {
    const room = baseRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer } });
    room.pauses = [{ from: playAt + 5_000, until: playAt + 15_000, byId: 'h' }];
    assert.deepEqual(timeline.applyBuzz(room, 'p', playAt + 6_000), { ok: false, reason: 'paused' });
    assert.ok(timeline.applyBuzz(room, 'p', playAt + 15_000).ok);
  });

  it('a buzz freezes the round clock and scores from the buzz', () => {
    const A = ROOM_LIMITS.answerSeconds.buzzer * 1000;
    const room = baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer },
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });
    assert.ok(timeline.applyBuzz(room, 'p', playAt + 5_000).ok);
    assert.equal(timeline.buildView(room, 'h', playAt + 6_000).frozen, true, 'audio stops for everyone during a hold');
    assert.ok(timeline.applyBuzzAnswer(room, 'p', false, playAt + 8_000).ok);
    assert.equal(timeline.locate(room, playAt + 9_000).endsAt, playAt + A + 3_000);
    assert.equal(timeline.buildView(room, 'h', playAt + 9_000).frozen, false);
    // q buzzes after 7 s of active time (5 s + 2 s) and is scored from there.
    assert.ok(timeline.applyBuzz(room, 'q', playAt + 10_000).ok);
    const right = timeline.applyBuzzAnswer(room, 'q', true, playAt + 14_000);
    assert.ok(right.ok && right.correct);
    assert.equal(right.points, timeline.scoreForAnswer(7_000, 30));
  });

  it('a buzz hold stops freezing the clock once the round has ended (holder leaves mid-hold)', () => {
    const room = baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer },
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });
    timeline.applyBuzz(room, 'h', playAt + 100);
    timeline.applyBuzzAnswer(room, 'h', false, playAt + 200);
    timeline.applyBuzz(room, 'q', playAt + 300);
    timeline.applyBuzzAnswer(room, 'q', false, playAt + 400);
    assert.ok(timeline.applyBuzz(room, 'p', playAt + 1_000).ok);
    // The holder leaves 1 s into the hold; the buzz stays open (as the leave handler does today).
    const leaveAt = playAt + 2_000;
    room.players.find((pl) => pl.id === 'p')!.leftAt = leaveAt;
    timeline.closeRoundIfEveryoneDone(room, 0, leaveAt);
    assert.equal(room.rounds[0].finishedAt, leaveAt);
    const pos = timeline.locate(room, leaveAt + 1);
    assert.equal(pos.phase, 'reveal');
    assert.equal(pos.endsAt, leaveAt);
    assert.equal(pos.revealEndsAt! - pos.endsAt!, ROOM_LIMITS.revealMs, 'reveal is not stretched by the open hold');
    assert.equal(timeline.buildView(room, 'h', leaveAt + 1_000).frozen, false);
  });

  it('a pause during the countdown shifts playAt by the pause length', () => {
    const room = baseRoom();
    const before = timeline.locate(room, 1_000);
    room.pauses = [{ from: 2_000, until: 4_000, byId: 'h' }];
    const after = timeline.locate(room, 2_500);
    assert.equal(after.phase, 'countdown');
    assert.equal(after.playAt, before.playAt! + 2_000);
    assert.equal(after.endsAt, before.endsAt! + 2_000);
  });

  it('a pause during the reveal shifts revealEndsAt only', () => {
    const room = baseRoom();
    const before = timeline.locate(room, playAt);
    room.pauses = [{ from: before.endsAt! + 1_000, until: before.endsAt! + 4_000, byId: 'h' }];
    const after = timeline.locate(room, before.endsAt! + 2_000);
    assert.equal(after.phase, 'reveal');
    assert.equal(after.endsAt, before.endsAt);
    assert.equal(after.revealEndsAt, before.revealEndsAt! + 3_000);
    assert.equal(timeline.buildView(room, 'p', before.endsAt! + 2_000).frozen, true);
  });

  it('audio cue after two freezes in one round', () => {
    const room = baseRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, clipSeconds: 10 } });
    room.pauses = [
      { from: playAt + 2_000, until: playAt + 4_000, byId: 'h' },
      { from: playAt + 6_000, until: playAt + 9_000, byId: 'h' },
    ];
    assert.deepEqual(timeline.buildView(room, 'p', playAt + 5_000).audioCue, { at: playAt + 4_000, fromSeconds: 2 });
    assert.equal(timeline.buildView(room, 'p', playAt + 7_000).audioCue, undefined);
    assert.deepEqual(timeline.buildView(room, 'p', playAt + 10_000).audioCue, { at: playAt + 9_000, fromSeconds: 4 });
  });

  it('a room without a pauses field (pre-upgrade) keeps the old, non-freezing buzz timing', () => {
    const room = baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer },
    });
    delete (room as Partial<RoomState>).pauses;
    assert.ok(timeline.applyBuzz(room, 'p', playAt + 5_000).ok);
    assert.deepEqual(timeline.freezesOf(room), []);
    assert.equal(timeline.buildView(room, 'h', playAt + 6_000).frozen, false);
  });

  it('room without pauses field still locates', () => {
    const r = baseRoom();
    delete (r as Partial<RoomState>).pauses;
    assert.equal(timeline.locate(r, 1_000).phase, 'countdown');
    assert.equal(timeline.applyAnswer(r, 'h', true, playAt + 1_000).ok, true);
  });

  it('audio cue resumes the clip after a freeze', () => {
    const room = baseRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, clipSeconds: 10 } });
    assert.deepEqual(timeline.buildView(room, 'p', playAt + 1_000).audioCue, { at: playAt, fromSeconds: 0 });
    room.pauses = [{ from: playAt + 4_000, until: playAt + 14_000, byId: 'h' }];
    const during = timeline.buildView(room, 'p', playAt + 5_000);
    assert.equal(during.audioCue, undefined);
    assert.equal(during.frozen, true);
    const afterPause = timeline.buildView(room, 'p', playAt + 15_000);
    assert.deepEqual(afterPause.audioCue, { at: playAt + 14_000, fromSeconds: 4 });
    assert.equal(afterPause.frozen, false);

    const short = baseRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, clipSeconds: 3 } });
    short.pauses = [{ from: playAt + 4_000, until: playAt + 14_000, byId: 'h' }];
    assert.equal(timeline.buildView(short, 'p', playAt + 15_000).audioCue, undefined, 'clip already over: no cue');
  });

  it('audio cue continues the clip after a wrong buzz', () => {
    const room = baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer, clipSeconds: 10 },
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });
    timeline.applyBuzz(room, 'p', playAt + 2_345);
    timeline.applyBuzzAnswer(room, 'p', false, playAt + 5_000);
    assert.deepEqual(timeline.buildView(room, 'q', playAt + 6_000).audioCue, { at: playAt + 5_000, fromSeconds: 2.35 });
  });
});

describe('room input validation', () => {
  it('cleans names and falls back to safe settings', () => {
    assert.equal(parsePlayerName('  Pat\u0000  \n Lee '), 'Pat Lee');
    assert.equal(parsePlayerName('   '), null);
    assert.equal(Array.from(parsePlayerName('ก'.repeat(50))!).length, ROOM_LIMITS.nameMaxLength);
    const s = parseRoomSettings({ rounds: 999, clipSeconds: 7, category: 'jazz', audio: 'host', difficulty: 'hard' });
    assert.deepEqual([s.rounds, s.clipSeconds, s.category, s.audio, s.difficulty], [10, 7, 'all', 'host', 'hard']);
  });

  it('parses clip seconds', () => {
    assert.equal(parseClipSeconds(0.1), 0.1);
    assert.equal(parseClipSeconds('7.25'), 7.3);
    assert.equal(parseClipSeconds(0.05), 0.1);
    assert.equal(parseClipSeconds(99), 15);
    assert.equal(parseClipSeconds(-1), 0.1);
    assert.equal(parseClipSeconds('abc'), 5);
    assert.equal(parseClipSeconds(NaN), 5);
    for (const bad of [null, false, true, [], {}, undefined, '', '  ']) assert.equal(parseClipSeconds(bad), 5, String(bad));
  });

  it('sets the answer window from the mode, ignoring the client', () => {
    assert.equal(parseRoomSettings({ mode: 'buzzer', answerSeconds: 99 }).answerSeconds, ROOM_LIMITS.answerSeconds.buzzer);
    assert.equal(parseRoomSettings({ mode: 'answer' }).answerSeconds, ROOM_LIMITS.answerSeconds.answer);
    assert.equal(ROOM_LIMITS.answerSeconds.buzzer, 30);
    assert.equal(ROOM_LIMITS.answerSeconds.answer, 20);
    assert.equal(ROOM_LIMITS.buzzAnswerMs, 10_000);
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
  const A = ROOM_LIMITS.answerSeconds.buzzer * 1000;
  const B = ROOM_LIMITS.buzzAnswerMs;
  const playAt = 1_000 + C;
  const buzzerRoom = () =>
    baseRoom({
      settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer },
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
    assert.equal(right.points, timeline.scoreForAnswer(2_000, 30), 'thinking time is not penalised');
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

  it('a buzz just before the timer freezes it: the holder still gets full answer time', () => {
    const room = buzzerRoom();
    const buzzAt = playAt + A - 500;
    assert.ok(timeline.applyBuzz(room, 'p', buzzAt).ok);
    const held = timeline.locate(room, playAt + A + 1_000);
    assert.equal(held.phase, 'guessing');
    assert.equal(held.endsAt, playAt + A + B, 'endsAt moves by the whole hold while unanswered');
    assert.ok(timeline.applyBuzzAnswer(room, 'p', true, buzzAt + B - 1).ok);
  });

  it('after a late wrong buzz only the remaining active time is left for new buzzes', () => {
    const room = buzzerRoom();
    const buzzAt = playAt + A - 500;
    timeline.applyBuzz(room, 'p', buzzAt);
    timeline.applyBuzzAnswer(room, 'p', false, buzzAt + 2_000);
    const endsAt = timeline.locate(room, buzzAt + 2_000).endsAt!;
    assert.equal(endsAt, playAt + A + 2_000, 'endsAt moves by the hold');
    assert.equal(timeline.locate(room, endsAt).phase, 'reveal');
    assert.deepEqual(timeline.applyBuzz(room, 'q', endsAt), { ok: false, reason: 'not-guessing' }, 'no new buzzes after the timer');
    assert.ok(timeline.applyBuzz(room, 'q', endsAt - 1).ok);
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

describe('pause', () => {
  const C = ROOM_LIMITS.countdownMs;
  const playAt = 1_000 + C;
  const T = playAt + 2_000; // mid-guessing
  const P = ROOM_LIMITS.pauseMaxMs + ROOM_LIMITS.pauseResumeMs;
  const apply = pauseRules.applyPauseAction;

  it('request → host approves → paused 60 s + 3 s, answers rejected', () => {
    const room = baseRoom();
    assert.deepEqual(apply(room, 'p', 'request', T), { ok: true });
    const hostView = timeline.buildView(room, 'h', T + 1);
    assert.equal(hostView.pauseRequest?.playerName, 'Pat');
    assert.equal(hostView.pauseRequest?.expiresAt, T + ROOM_LIMITS.pauseRequestMs);
    assert.equal(timeline.buildView(room, 'p', T + 1).pauseRequest, undefined, 'only the host sees the request');
    assert.equal(timeline.buildView(room, 'p', T + 1).myPauseRequest, 'pending');
    assert.deepEqual(apply(room, 'h', 'approve', T + 1_000), { ok: true });
    assert.equal(room.pauses![0].until, T + 1_000 + P);
    assert.equal(room.pauses![0].requestedById, 'p');
    const v = timeline.buildView(room, 'p', T + 2_000);
    assert.equal(v.pause?.byName, 'Host');
    assert.equal(v.pause?.until, T + 1_000 + P);
    assert.equal(v.pause?.resumingAt, T + 1_000 + P - ROOM_LIMITS.pauseResumeMs);
    assert.equal(v.myPauseRequest, 'approved');
    assert.equal(v.frozen, true);
    assert.deepEqual(timeline.applyAnswer(room, 'p', true, T + 5_000), { ok: false, reason: 'paused' });
    assert.deepEqual(timeline.applyBuzz(room, 'p', T + 5_000), { ok: false, reason: 'paused' });
    assert.equal(timeline.buildView(room, 'p', T + 1_000 + P + 6_000).myPauseRequest, undefined, 'outcome hidden after 5 s');
  });

  it('declined request is reported to the requester', () => {
    const room = baseRoom();
    apply(room, 'p', 'request', T);
    assert.deepEqual(apply(room, 'h', 'decline', T + 500), { ok: true });
    assert.equal(timeline.buildView(room, 'p', T + 600).myPauseRequest, 'declined');
    assert.equal(timeline.buildView(room, 'h', T + 600).pauseRequest, undefined);
    assert.equal(room.pauses, undefined);
  });

  it('host resume ends the pause after a 3 s resuming countdown', () => {
    const room = baseRoom();
    apply(room, 'h', 'pause', T);
    const at = T + 10_000;
    assert.deepEqual(apply(room, 'h', 'resume', at), { ok: true });
    assert.equal(room.pauses![0].until, at + ROOM_LIMITS.pauseResumeMs);
    assert.ok(timeline.buildView(room, 'p', at + 2_999).frozen);
    assert.ok(!timeline.buildView(room, 'p', at + 3_000).frozen);
    assert.deepEqual(apply(room, 'h', 'resume', at + 5_000), { ok: false, reason: 'not-paused' });
  });

  it('resume during the resuming countdown leaves until unchanged', () => {
    const room = baseRoom();
    apply(room, 'h', 'pause', T);
    apply(room, 'h', 'resume', T + 10_000);
    const until = room.pauses![0].until;
    assert.deepEqual(apply(room, 'h', 'resume', T + 11_000), { ok: true });
    assert.equal(room.pauses![0].until, until);
  });

  it('myPauseRequest outcome is visible for PAUSE_OUTCOME_VISIBLE_MS', () => {
    const room = baseRoom();
    apply(room, 'p', 'request', T);
    apply(room, 'h', 'decline', T + 500);
    const V = pauseRules.PAUSE_OUTCOME_VISIBLE_MS;
    assert.equal(timeline.buildView(room, 'p', T + 500 + V - 1).myPauseRequest, 'declined');
    assert.equal(timeline.buildView(room, 'p', T + 500 + V).myPauseRequest, undefined);
  });

  it('request expires after 10 s and cannot repeat within 30 s', () => {
    const room = baseRoom();
    apply(room, 'p', 'request', T);
    assert.equal(timeline.buildView(room, 'h', T + 9_999).pauseRequest?.playerName, 'Pat');
    assert.equal(timeline.buildView(room, 'h', T + 10_000).pauseRequest, undefined);
    assert.equal(timeline.buildView(room, 'p', T + 10_000).myPauseRequest, 'expired');
    assert.deepEqual(apply(room, 'h', 'approve', T + 10_000), { ok: false, reason: 'no-request' });
    assert.deepEqual(apply(room, 'p', 'request', T + 29_000), { ok: false, reason: 'cooldown' });
    assert.deepEqual(apply(room, 'p', 'request', T + 30_000), { ok: true });
  });

  it('only one pending request; host cannot be asked, host pauses directly', () => {
    const room = baseRoom({
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 },
      ],
    });
    assert.deepEqual(apply(room, 'h', 'request', T), { ok: false, reason: 'is-host' });
    assert.ok(apply(room, 'p', 'request', T).ok);
    assert.deepEqual(apply(room, 'q', 'request', T + 100), { ok: false, reason: 'pending' });
    assert.deepEqual(apply(room, 'zz', 'request', T), { ok: false, reason: 'not-a-player' });
    assert.ok(apply(room, 'h', 'pause', T + 200).ok);
    assert.equal(room.pauses![0].requestedById, undefined);
  });

  it('no pause during a buzz hold, in lobby, finished, or while paused', () => {
    const buzzer = baseRoom({ settings: { ...DEFAULT_ROOM_SETTINGS, mode: 'buzzer', answerSeconds: ROOM_LIMITS.answerSeconds.buzzer } });
    assert.ok(timeline.applyBuzz(buzzer, 'p', T).ok);
    assert.deepEqual(apply(buzzer, 'h', 'pause', T + 100), { ok: false, reason: 'buzz-hold' });
    assert.deepEqual(apply(buzzer, 'h', 'request', T + 100), { ok: false, reason: 'is-host' });
    const lobby = baseRoom({ status: 'lobby', startedAt: undefined, rounds: [] });
    assert.deepEqual(apply(lobby, 'h', 'pause', T), { ok: false, reason: 'wrong-phase' });
    assert.deepEqual(apply(baseRoom(), 'h', 'pause', 10 * 60 * 1000), { ok: false, reason: 'wrong-phase' });
    const room = baseRoom({ players: [...baseRoom().players, { id: 'q', name: 'Quinn', joinedAt: 0, score: 0 }] });
    assert.ok(apply(room, 'h', 'pause', T).ok);
    assert.deepEqual(apply(room, 'h', 'pause', T + 100), { ok: false, reason: 'already-paused' });
    assert.deepEqual(apply(room, 'p', 'request', T + 100), { ok: false, reason: 'already-paused' });
    const held = baseRoom({ settings: buzzer.settings });
    held.rounds[0].buzzes = [{ playerId: 'p', at: T, deadline: T + ROOM_LIMITS.buzzAnswerMs }];
    assert.deepEqual(apply(held, 'p', 'request', T + 100), { ok: false, reason: 'buzz-hold' });
  });

  it('non-host cannot approve, decline, pause or resume', () => {
    const room = baseRoom();
    apply(room, 'p', 'request', T);
    for (const a of ['approve', 'decline', 'pause', 'resume'] as const) {
      assert.deepEqual(apply(room, 'p', a, T + 100), { ok: false, reason: 'not-host' }, a);
    }
    assert.equal(room.pauses, undefined);
  });

  it('pause auto-resumes with no write', () => {
    const room = baseRoom();
    apply(room, 'h', 'pause', T);
    assert.equal(timeline.locate(room, T + P - 1).phase, 'guessing');
    const after = timeline.locate(room, T + P);
    assert.equal(after.phase, 'guessing');
    assert.equal(timeline.buildView(room, 'p', T + P).frozen, false);
    assert.equal(timeline.buildView(room, 'p', T + P).pause, undefined);
    assert.equal(timeline.locate(room, T + P + 1).endsAt, timeline.locate(baseRoom(), T).endsAt! + P);
  });

  it('pause API returns the view and GET stays read-only', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', { body: { name: 'Host' } });
    const code = created.json.data.room.code as string;
    const host = created.json.data.playerToken as string;
    const pat = (await call(joinRoute.POST as Handler, 'POST', code, { body: { name: 'Pat' } })).json.data.playerToken as string;
    await call(startRoute.POST as Handler, 'POST', code, { token: host });
    await shiftStart(code, ROOM_LIMITS.countdownMs + 500);
    const pauseRoute = await import('../app/api/rooms/[code]/pause/route');
    const post = (token: string, action: unknown) => call(pauseRoute.POST as Handler, 'POST', code, { token, body: { action } });

    assert.equal((await post(host, 'dance')).status, 400);
    assert.equal((await post(host, undefined)).status, 400);
    assert.equal((await post(host, 'request')).status, 409, 'host cannot request');
    const req = await post(pat, 'request');
    assert.equal(req.status, 200);
    assert.equal(req.json.data.room.myPauseRequest, 'pending');
    const hostGet = await call(roomRoute.GET as Handler, 'GET', code, { token: host });
    assert.equal(hostGet.json.data.room.pauseRequest.playerName, 'Pat');
    assert.equal((await post(pat, 'approve')).status, 409, 'non-host cannot approve');
    const approved = await post(host, 'approve');
    assert.equal(approved.status, 200);
    assert.equal(approved.json.data.room.frozen, true);
    assert.ok(approved.json.data.room.pause);

    const before = JSON.stringify(await getRoomStore()!.get(code));
    await call(roomRoute.GET as Handler, 'GET', code, { token: pat });
    assert.equal(JSON.stringify(await getRoomStore()!.get(code)), before, 'GET did not write');
    const answerId = (await getRoomStore()!.get(code))!.rounds[0].songId;
    assert.equal((await call(answerRoute.POST as Handler, 'POST', code, { token: pat, body: { candidateTrackId: answerId } })).status, 409);
    assert.equal((await post(host, 'resume')).status, 200);
  });
});

describe('leaving', () => {
  const C = ROOM_LIMITS.countdownMs;
  const T = 1_000 + C + 3_000; // guessing in round 1
  const threePlayers = () =>
    baseRoom({
      startedWith: 3,
      players: [
        { id: 'h', name: 'Host', joinedAt: 0, score: 0 },
        { id: 'p', name: 'Pat', joinedAt: 0, score: 0 },
        { id: 'q', name: 'Quin', joinedAt: 0, score: 0 },
      ],
    });

  it('last remaining player ends the game at once', () => {
    const room = baseRoom({ startedWith: 2 });
    assert.equal(timeline.locate(room, T).phase, 'guessing');
    assert.equal(timeline.applyLeave(room, 'p', T), true);
    assert.equal(room.endedAt, T);
    assert.equal(timeline.locate(room, T).phase, 'finished');
    assert.equal(timeline.buildView(room, 'h', T).endedEarly, true);
    assert.equal(timeline.buildView(room, 'h', T - 1).endedEarly, undefined);
  });

  it('ends in the reveal and while paused too, but not with 2 players left', () => {
    const reveal = baseRoom({ startedWith: 2 });
    const end = timeline.locate(reveal, T).endsAt!;
    timeline.applyLeave(reveal, 'p', end + 100);
    assert.equal(timeline.locate(reveal, end + 100).phase, 'finished');

    const paused = baseRoom({ startedWith: 2, pauses: [{ from: T, until: T + 60_000, byId: 'h' }] });
    timeline.applyLeave(paused, 'p', T + 1_000);
    assert.equal(timeline.locate(paused, T + 1_000).phase, 'finished');
    const pausedView = timeline.buildView(paused, 'h', T + 2_000);
    assert.equal(pausedView.pause, undefined, 'no pause overlay over the results');
    assert.equal(pausedView.frozen, undefined);

    const three = threePlayers();
    timeline.applyLeave(three, 'p', T);
    assert.equal(three.endedAt, undefined);
    assert.equal(timeline.locate(three, T).phase, 'guessing');
  });

  it('a room started alone is not ended', () => {
    const room = baseRoom({ startedWith: 1, players: [{ id: 'h', name: 'Host', joinedAt: 0, score: 0 }] });
    assert.equal(timeline.applyLeave(room, 'h', T), true);
    assert.equal(room.endedAt, undefined);
    assert.equal(timeline.locate(room, T).phase, 'guessing');
    // Rooms stored before startedWith existed are unaffected as well.
    const legacy = baseRoom();
    timeline.applyLeave(legacy, 'p', T);
    assert.equal(legacy.endedAt, undefined);
  });

  it('buzz holder leaving ends the hold and frees the buzzer', () => {
    const room = threePlayers();
    room.settings = { ...room.settings, mode: 'buzzer' };
    room.pauses = [];
    const before = timeline.locate(room, T).endsAt!;
    assert.equal(timeline.applyBuzz(room, 'p', T).ok, true);
    assert.equal(timeline.buzzState(room.rounds[0], T + 500).holder?.playerId, 'p');
    timeline.applyLeave(room, 'p', T + 500);
    const buzz = room.rounds[0].buzzes![0];
    assert.equal(buzz.result, 'wrong');
    assert.equal(buzz.resolvedAt, T + 500);
    assert.equal(room.players.find((x) => x.id === 'p')!.score, 0);
    assert.equal(timeline.buzzState(room.rounds[0], T + 600).holder, undefined);
    assert.equal(timeline.buildView(room, 'q', T + 600).frozen, false, 'clock runs again');
    assert.equal(timeline.buildView(room, 'q', T + 600).buzz?.canBuzz, true);
    assert.equal(timeline.locate(room, T).endsAt, before + 500, 'only the 500 ms hold was frozen');
  });

  it('host leaves during pause: new host can resume, pending request dropped', () => {
    const room = threePlayers();
    const pat = pauseRules.applyPauseAction;
    assert.equal(pat(room, 'h', 'pause', T).ok, true);
    // Pending request made before the pause would be dropped; build one on a fresh room.
    const r = threePlayers();
    assert.equal(pat(r, 'p', 'request', T).ok, true);
    timeline.applyLeave(r, 'h', T + 100);
    assert.equal(r.pauseRequest, undefined);
    assert.equal(r.hostId, 'p');

    timeline.applyLeave(room, 'h', T + 1_000);
    assert.equal(room.hostId, 'p');
    assert.ok(timeline.activePause(room, T + 2_000), 'pause survives the leave');
    assert.deepEqual(pat(room, 'p', 'resume', T + 2_000), { ok: true });
    assert.ok(room.pauses![0].until <= T + 2_000 + ROOM_LIMITS.pauseResumeMs);
  });

  it('requester leaving drops their pending request; host pausing clears one', () => {
    const room = threePlayers();
    pauseRules.applyPauseAction(room, 'p', 'request', T);
    timeline.applyLeave(room, 'p', T + 100);
    assert.equal(room.pauseRequest, undefined);

    const other = threePlayers();
    pauseRules.applyPauseAction(other, 'p', 'request', T);
    assert.ok(other.pauseRequest);
    timeline.applyLeave(other, 'q', T + 100);
    assert.ok(other.pauseRequest, 'an unrelated leave keeps the request');
    assert.deepEqual(pauseRules.applyPauseAction(other, 'h', 'pause', T + 200), { ok: true });
    assert.equal(other.pauseRequest, undefined);
  });

  it('a pending request is not shown after the game ends', () => {
    const room = baseRoom({ startedWith: 2 });
    pauseRules.applyPauseAction(room, 'p', 'request', T);
    assert.ok(timeline.buildView(room, 'h', T + 10).pauseRequest);
    // The host leaves: the request is dropped; also check a request that outlives the end.
    const other = baseRoom({ startedWith: 2 });
    pauseRules.applyPauseAction(other, 'p', 'request', T);
    other.endedAt = T + 100; // e.g. state written by another path
    const hostView = timeline.buildView(other, 'h', T + 200);
    assert.equal(hostView.phase, 'finished');
    assert.equal(hostView.pauseRequest, undefined);
    assert.equal(timeline.buildView(other, 'p', T + 200).myPauseRequest, undefined);
  });

  it('rejoining after the game ended leaves the room finished', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', { body: { name: 'Host' } });
    const code = created.json.data.room.code as string;
    const host = created.json.data.playerToken as string;
    const pat = (await call(joinRoute.POST as Handler, 'POST', code, { body: { name: 'Pat' } })).json.data.playerToken as string;
    await call(startRoute.POST as Handler, 'POST', code, { token: host });
    await call(leaveRoute.POST as Handler, 'POST', code, { token: pat });
    const again = await call(joinRoute.POST as Handler, 'POST', code, { token: pat, body: { name: 'Pat' } });
    assert.equal(again.status, 200);
    assert.equal(again.json.data.room.phase, 'finished');
    assert.equal(again.json.data.room.endedEarly, true);
  });

  it('leaving later does not change finished rounds', () => {
    const room = threePlayers();
    const r0 = timeline.locate(room, T);
    const r1Start = r0.revealEndsAt!;
    const before = timeline.locate(room, 1_000 + C);
    timeline.applyLeave(room, 'p', r1Start + C + 1_000); // during round 2
    assert.deepEqual(timeline.locate(room, 1_000 + C), before);
    assert.deepEqual(timeline.locate(room, T), r0);
    assert.equal(room.endedAt, undefined);
    timeline.applyLeave(room, 'q', r1Start + C + 2_000); // down to the host alone
    assert.deepEqual(timeline.locate(room, T), r0);
    assert.equal(timeline.locate(room, r1Start + C + 2_000).phase, 'finished');
  });

  it('start through the API sets startedWith and resets pause/ended state', async () => {
    const created = await call(roomsRoute.POST as Handler, 'POST', '', { body: { name: 'Host' } });
    const code = created.json.data.room.code as string;
    const host = created.json.data.playerToken as string;
    const pat = (await call(joinRoute.POST as Handler, 'POST', code, { body: { name: 'Pat' } })).json.data.playerToken as string;
    await call(startRoute.POST as Handler, 'POST', code, { token: host });
    assert.equal((await getRoomStore()!.get(code))!.startedWith, 2);
    await call(leaveRoute.POST as Handler, 'POST', code, { token: pat });
    const ended = await getRoomStore()!.get(code);
    assert.ok(ended!.endedAt !== undefined);
    const view = await call(roomRoute.GET as Handler, 'GET', code, { token: host });
    assert.equal(view.json.data.room.phase, 'finished');
    assert.equal(view.json.data.room.endedEarly, true);
    const restart = await call(startRoute.POST as Handler, 'POST', code, { token: host });
    assert.equal(restart.status, 200);
    const again = (await getRoomStore()!.get(code))!;
    assert.equal(again.endedAt, undefined);
    assert.equal(again.startedWith, 1);
    assert.equal(again.pauses?.length ?? 0, 0);
  });
});

describe('correct feed', () => {
  it('correct feed ignores stale entries', async () => {
    const { newCorrectEntries } = await import('../hooks/useCorrectFeed');
    const now = 100_000;
    const seen = new Set<string>();
    const entries = [
      { playerId: 'old', name: 'Old', points: 500, at: now - 5_000 },
      { playerId: 'a', name: 'A', points: 900, at: now - 1_000 },
    ];
    const fresh = newCorrectEntries(seen, 2, entries, now);
    assert.deepEqual(fresh.map((e) => e.playerId), ['a']);
    // The stale entry is marked seen too, so it never pops up later.
    assert.ok(seen.has('2:old'));
    assert.ok(seen.has('2:a'));
    // A repeat poll yields nothing new.
    assert.deepEqual(newCorrectEntries(seen, 2, entries, now + 500), []);
    // Same player in a later round is new.
    const next = newCorrectEntries(seen, 3, [{ playerId: 'a', name: 'A', points: 700, at: now + 2_000 }], now + 2_100);
    assert.equal(next.length, 1);
  });
});
