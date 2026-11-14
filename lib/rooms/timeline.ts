/**
 * Live room state and its timeline. Everything here is pure: the current phase is derived
 * from the stored timestamps and `now`, so reading a room never needs to write it.
 *
 * A round's early end (`finishedAt`) is only ever written by a write request (answer, buzz
 * answer, leave). It is never re-derived from the current player list, so a player leaving
 * later cannot shift the timing of rounds that were already played.
 *
 * Durations (countdown, answer window, reveal) run on the game clock: they only advance outside
 * freezes (stored pauses and buzz holds). A freeze only affects times after its `from`, so
 * rounds that were already played never move.
 */
import { activeElapsed, frozenAt, wallAfter, type Freeze } from './clock';
import {
  ROOM_LIMITS,
  type RoomPhase,
  type RoomRevealSong,
  type RoomSettings,
  type RoomView,
} from '../../shared/roomTypes';

export interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
  score: number;
  leftAt?: number;
}

export interface RoomAnswer {
  attempts: number;
  /** Server receipt time of the correct answer. */
  correctAt?: number;
  points: number;
}

/** Buzzer mode: one press of the buzzer and what came of it. */
export interface RoomBuzz {
  playerId: string;
  at: number;
  /** The holder must answer before this server time, or is locked out. */
  deadline: number;
  result?: 'correct' | 'wrong';
  resolvedAt?: number;
}

export interface RoomRound {
  songId: string;
  audioUrl: string;
  reveal: RoomRevealSong;
  answers: Record<string, RoomAnswer>;
  buzzes?: RoomBuzz[];
  /** Set (by a write) when the round is decided, so it can end before its timer. */
  finishedAt?: number;
}

/** A host pause. `until` is the planned end, shortened to the resume time on an early resume. */
export interface RoomPause {
  from: number;
  until: number;
  byId: string;
  requestedById?: string;
}

export interface RoomState {
  code: string;
  version: number;
  createdAt: number;
  hostId: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  status: 'lobby' | 'playing';
  startedAt?: number;
  rounds: RoomRound[];
  /** Absent on rooms created before pausing existed. */
  pauses?: RoomPause[];
  /** The latest pause request (one at a time) and when each player last made one. */
  pauseRequest?: { playerId: string; at: number; decision?: 'approved' | 'declined'; decidedAt?: number };
  lastPauseRequestAt?: Record<string, number>;
  /** Active players when the game started; absent on older rooms. */
  startedWith?: number;
  /** Set when a leave left one player of a multiplayer game: the game ends from this moment. */
  endedAt?: number;
}

export interface RoomPosition {
  phase: RoomPhase;
  roundIndex: number;
  playAt?: number;
  endsAt?: number;
  revealEndsAt?: number;
}

/** Buzzer status at `now`: who holds the buzzer, and who is locked out (and since when). */
export function buzzState(round: RoomRound, now: number) {
  const buzzes = round.buzzes ?? [];
  const last = buzzes[buzzes.length - 1];
  const holder = last && !last.result && now < last.deadline ? last : undefined;
  const lockedOut = new Set<string>();
  for (const b of buzzes) {
    if (b.result === 'wrong' || (!b.result && b.deadline <= now)) lockedOut.add(b.playerId);
  }
  return { holder, lockedOut, last };
}

/**
 * Every interval the game clock stands still: stored pauses plus every buzz hold. A hold is
 * capped at the round's early end, so an open buzz (e.g. the holder left) cannot stretch the reveal.
 */
export function freezesOf(room: RoomState): Freeze[] {
  const freezes: Freeze[] = (room.pauses ?? []).map((p) => ({ from: p.from, until: p.until }));
  // Rooms created before buzz holds froze the clock have no `pauses` field: keep their timing.
  if (room.pauses === undefined) return freezes.sort((a, b) => a.from - b.from);
  for (const round of room.rounds) {
    const roundOver = round.finishedAt ?? Infinity;
    for (const b of round.buzzes ?? []) {
      freezes.push({ from: b.at, until: Math.min(b.resolvedAt ?? b.deadline, roundOver) });
    }
  }
  return freezes.sort((a, b) => a.from - b.from);
}

/** How long the requester is told about the outcome of their request. */
export const PAUSE_OUTCOME_VISIBLE_MS = 5_000;

/** The stored pause covering `now`, if any. */
export function activePause(room: RoomState, now: number): RoomPause | undefined {
  const pauses = room.pauses ?? [];
  const f = frozenAt(pauses, now);
  return f ? pauses.find((p) => p.from === f.from && p.until === f.until) : undefined;
}

/** A request nobody has decided yet and that has not expired. */
export function pendingPauseRequest(room: RoomState, now: number) {
  const r = room.pauseRequest;
  return r && !r.decision && now < r.at + ROOM_LIMITS.pauseRequestMs ? r : undefined;
}

/** Pauses only (not buzz holds): while one is active, answers and buzzes are rejected. */
function pausedAt(room: RoomState, now: number): boolean {
  return frozenAt(room.pauses ?? [], now) !== undefined;
}

function roundEnd(room: RoomState, round: RoomRound, playAt: number, freezes: Freeze[]): number {
  // Buzz holds are freezes, so a buzz near the end of the timer still gets its full answer time.
  const timerEnd = wallAfter(freezes, playAt, room.settings.answerSeconds * 1000);
  // `finishedAt` is an early end in wall-clock time, written once by a write request.
  if (round.finishedAt !== undefined) return Math.min(timerEnd, Math.max(playAt, round.finishedAt));
  return timerEnd;
}

/** Where the game is at `now`. */
export function locate(room: RoomState, now: number): RoomPosition {
  if (room.status === 'lobby' || room.startedAt === undefined || room.rounds.length === 0) {
    return { phase: 'lobby', roundIndex: 0 };
  }
  if (room.endedAt !== undefined && now >= room.endedAt) {
    return { phase: 'finished', roundIndex: room.rounds.length - 1 };
  }
  const freezes = freezesOf(room);
  let t = room.startedAt;
  for (let i = 0; i < room.rounds.length; i++) {
    const playAt = wallAfter(freezes, t, ROOM_LIMITS.countdownMs);
    const endsAt = roundEnd(room, room.rounds[i], playAt, freezes);
    const revealEndsAt = wallAfter(freezes, endsAt, ROOM_LIMITS.revealMs);
    if (now < playAt) return { phase: 'countdown', roundIndex: i, playAt, endsAt, revealEndsAt };
    if (now < endsAt) return { phase: 'guessing', roundIndex: i, playAt, endsAt, revealEndsAt };
    if (now < revealEndsAt) return { phase: 'reveal', roundIndex: i, playAt, endsAt, revealEndsAt };
    t = revealEndsAt;
  }
  return { phase: 'finished', roundIndex: room.rounds.length - 1 };
}

export function activePlayers(room: RoomState): RoomPlayer[] {
  return room.players.filter((p) => p.leftAt === undefined);
}

/** Is this player finished with the round (nothing more they can do)? */
function playerDone(room: RoomState, round: RoomRound, playerId: string, now: number): boolean {
  const answer = round.answers[playerId];
  if (answer?.correctAt !== undefined) return true;
  if (room.settings.mode === 'buzzer') return buzzState(round, now).lockedOut.has(playerId);
  return Boolean(answer && answer.attempts >= ROOM_LIMITS.maxAttempts);
}

/**
 * 1000 points for an instant answer, falling linearly to 100 at the end of the window.
 * `elapsedMs` is active (unfrozen) time since play started.
 */
export function scoreForAnswer(elapsedMs: number, answerSeconds: number): number {
  const fraction = Math.min(1, Math.max(0, elapsedMs / (answerSeconds * 1000)));
  return Math.round(1000 - 900 * fraction);
}

/** Marks the round finished once every active player is done. Mutates `room`. */
export function closeRoundIfEveryoneDone(room: RoomState, roundIndex: number, now: number): void {
  const round = room.rounds[roundIndex];
  if (!round || round.finishedAt !== undefined) return;
  const players = activePlayers(room);
  if (players.length > 0 && players.every((p) => playerDone(room, round, p.id, now))) {
    round.finishedAt = now;
  }
}

/**
 * An explicit `/leave`. Mutates `room`; returns false when the player is not active.
 * Never touches rounds already finished, so earlier timing and scores are unchanged.
 */
export function applyLeave(room: RoomState, playerId: string, now: number): boolean {
  const player = findActive(room, playerId);
  if (!player) return false;
  const pos = locate(room, now);
  const inGame = pos.phase === 'countdown' || pos.phase === 'guessing' || pos.phase === 'reveal';

  // A holder who leaves forfeits the open buzz: this frees the buzzer and ends the freeze.
  if (pos.phase === 'guessing') {
    const holder = buzzState(room.rounds[pos.roundIndex], now).holder;
    if (holder && holder.playerId === playerId) {
      holder.result = 'wrong';
      holder.resolvedAt = now;
    }
  }

  const wasHost = room.hostId === playerId;
  player.leftAt = now;
  if (wasHost) {
    const next = activePlayers(room)[0];
    if (next) room.hostId = next.id; // hand the host role on so the room can continue
  }
  if (room.pauseRequest && (wasHost || room.pauseRequest.playerId === playerId)) room.pauseRequest = undefined;

  if (pos.phase === 'guessing' || pos.phase === 'countdown') closeRoundIfEveryoneDone(room, pos.roundIndex, now);
  if (inGame && (room.startedWith ?? 0) >= 2 && activePlayers(room).length === 1) room.endedAt = now;
  return true;
}

export type AnswerOutcome =
  | { ok: true; correct: boolean; points: number; attemptsLeft: number }
  | { ok: false; reason: 'not-guessing' | 'already-done' | 'not-a-player' | 'not-your-turn' | 'paused' };

function guessingRound(room: RoomState, now: number) {
  const pos = locate(room, now);
  if (pos.phase !== 'guessing' || pos.playAt === undefined) return null;
  return { pos, round: room.rounds[pos.roundIndex], playAt: pos.playAt };
}

function findActive(room: RoomState, playerId: string) {
  return room.players.find((p) => p.id === playerId && p.leftAt === undefined);
}

/** Everyone-answers mode: records one guess at server time `now`. Mutates `room` on success. */
export function applyAnswer(room: RoomState, playerId: string, isCorrect: boolean, now: number): AnswerOutcome {
  const player = findActive(room, playerId);
  if (!player) return { ok: false, reason: 'not-a-player' };
  const g = guessingRound(room, now);
  if (!g) return { ok: false, reason: 'not-guessing' };
  if (pausedAt(room, now)) return { ok: false, reason: 'paused' };
  if (playerDone(room, g.round, playerId, now)) return { ok: false, reason: 'already-done' };

  const answer = g.round.answers[playerId] ?? { attempts: 0, points: 0 };
  answer.attempts += 1;
  if (isCorrect) {
    answer.correctAt = now;
    answer.points = scoreForAnswer(activeElapsed(freezesOf(room), g.playAt, now), room.settings.answerSeconds);
    player.score += answer.points;
  }
  g.round.answers[playerId] = answer;
  closeRoundIfEveryoneDone(room, g.pos.roundIndex, now);
  return {
    ok: true,
    correct: isCorrect,
    points: answer.points,
    attemptsLeft: Math.max(0, ROOM_LIMITS.maxAttempts - answer.attempts),
  };
}

export type BuzzOutcome =
  | { ok: true; deadline: number }
  | { ok: false; reason: 'not-guessing' | 'taken' | 'locked-out' | 'not-a-player' | 'too-late' | 'paused' };

/** Buzzer mode: claims the buzzer if it is free. Mutates `room` on success. */
export function applyBuzz(room: RoomState, playerId: string, now: number): BuzzOutcome {
  if (!findActive(room, playerId)) return { ok: false, reason: 'not-a-player' };
  const g = guessingRound(room, now);
  if (!g) return { ok: false, reason: 'not-guessing' };
  if (pausedAt(room, now)) return { ok: false, reason: 'paused' };
  // New buzzes only inside the answer window (game time). A buzz near the end still gets its
  // full time to answer, because the hold freezes the clock.
  if (g.pos.endsAt === undefined || now >= g.pos.endsAt) return { ok: false, reason: 'too-late' };
  const state = buzzState(g.round, now);
  if (state.lockedOut.has(playerId) || g.round.answers[playerId]?.correctAt !== undefined) {
    return { ok: false, reason: 'locked-out' };
  }
  if (state.holder) return { ok: false, reason: 'taken' };
  const deadline = now + ROOM_LIMITS.buzzAnswerMs;
  g.round.buzzes = [...(g.round.buzzes ?? []), { playerId, at: now, deadline }];
  return { ok: true, deadline };
}

/** Buzzer mode: the holder's one answer. Speed is scored from when they buzzed. */
export function applyBuzzAnswer(room: RoomState, playerId: string, isCorrect: boolean, now: number): AnswerOutcome {
  const player = findActive(room, playerId);
  if (!player) return { ok: false, reason: 'not-a-player' };
  const g = guessingRound(room, now);
  if (!g) return { ok: false, reason: 'not-guessing' };
  if (pausedAt(room, now)) return { ok: false, reason: 'paused' };
  const { holder } = buzzState(g.round, now);
  if (!holder || holder.playerId !== playerId) return { ok: false, reason: 'not-your-turn' };

  holder.result = isCorrect ? 'correct' : 'wrong';
  holder.resolvedAt = now;
  const answer = g.round.answers[playerId] ?? { attempts: 0, points: 0 };
  answer.attempts += 1;
  if (isCorrect) {
    answer.correctAt = now;
    answer.points = scoreForAnswer(activeElapsed(freezesOf(room), g.playAt, holder.at), room.settings.answerSeconds);
    player.score += answer.points;
    g.round.finishedAt = now; // someone got it: the song is over
  } else {
    closeRoundIfEveryoneDone(room, g.pos.roundIndex, now);
  }
  g.round.answers[playerId] = answer;
  return { ok: true, correct: isCorrect, points: answer.points, attemptsLeft: 0 };
}

/**
 * Where the clip should be playing: from `fromSeconds` into the clip, starting at server time
 * `at` (the end of the latest freeze since play started, or `playAt`). Undefined while frozen
 * or once the clip has fully played.
 */
function audioCueFor(room: RoomState, freezes: Freeze[], playAt: number, now: number): RoomView['audioCue'] {
  if (frozenAt(freezes, now)) return undefined;
  let at = playAt;
  for (const f of freezes) {
    if (f.from >= playAt && f.from <= now) at = Math.max(at, f.until);
  }
  const fromSeconds = Math.round(activeElapsed(freezes, playAt, at) / 10) / 100;
  if (fromSeconds >= room.settings.clipSeconds) return undefined;
  return { at, fromSeconds };
}

/** The view one player is allowed to see. Never includes the answer before the reveal. */
export function buildView(room: RoomState, viewerId: string, now: number): RoomView {
  const pos = locate(room, now);
  const round = room.status === 'playing' ? room.rounds[pos.roundIndex] : undefined;
  const showResults = pos.phase === 'reveal' || pos.phase === 'finished';
  const inRound = pos.phase === 'countdown' || pos.phase === 'guessing' || pos.phase === 'reveal';
  const freezes = freezesOf(room);
  const frozen = round !== undefined && inRound && frozenAt(freezes, now) !== undefined;
  const audioCue =
    round && (pos.phase === 'countdown' || pos.phase === 'guessing') && pos.playAt !== undefined
      ? audioCueFor(room, freezes, pos.playAt, now)
      : undefined;

  const players = room.players
    .map((p, colorIndex) => {
      const answer = round?.answers[p.id];
      return {
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.id === room.hostId,
        isMe: p.id === viewerId,
        left: p.leftAt !== undefined,
        colorIndex,
        done: round ? playerDone(room, round, p.id, now) : false,
        ...(showResults && round
          ? { roundPoints: answer?.points ?? 0, roundCorrect: answer?.correctAt !== undefined }
          : {}),
      };
    })
    .sort((a, b) => b.score - a.score || Number(a.left) - Number(b.left));

  const correct: RoomView['correct'] =
    round && (pos.phase === 'guessing' || pos.phase === 'reveal')
      ? room.players
          .flatMap((p) => {
            const a = round.answers[p.id];
            return a?.correctAt !== undefined
              ? [{ playerId: p.id, name: p.name, points: a.points, at: a.correctAt }]
              : [];
          })
          .sort((a, b) => a.at - b.at)
      : [];

  let buzz: RoomView['buzz'];
  if (room.settings.mode === 'buzzer' && round && pos.phase === 'guessing' && pos.playAt !== undefined) {
    const state = buzzState(round, now);
    const holderName = state.holder ? room.players.find((p) => p.id === state.holder!.playerId)?.name : undefined;
    const lockedOut = state.lockedOut.has(viewerId);
    const windowOpen = pos.endsAt !== undefined && now < pos.endsAt && !pausedAt(room, now);
    buzz = {
      holderId: state.holder?.playerId,
      holderName,
      deadline: state.holder?.deadline,
      lockedOut,
      canBuzz: windowOpen && !state.holder && !lockedOut && round.answers[viewerId]?.correctAt === undefined,
    };
  }

  // Pause state only matters while a round is running; a finished game shows results.
  const pauseEntry = inRound ? activePause(room, now) : undefined;
  const pause: RoomView['pause'] = pauseEntry
    ? {
        // An approved break is shown as the asking player's; a direct pause as the host's.
        byName: room.players.find((p) => p.id === (pauseEntry.requestedById ?? pauseEntry.byId))?.name ?? '',
        until: pauseEntry.until,
        resumingAt: pauseEntry.until - ROOM_LIMITS.pauseResumeMs,
      }
    : undefined;
  const req = room.pauseRequest;
  const reqPending = inRound ? pendingPauseRequest(room, now) : undefined;
  const reqName = req ? room.players.find((p) => p.id === req.playerId)?.name ?? '' : '';
  let myPauseRequest: RoomView['myPauseRequest'];
  if (inRound && req && req.playerId === viewerId) {
    const outcomeAt = req.decision ? req.decidedAt ?? req.at : req.at + ROOM_LIMITS.pauseRequestMs;
    if (reqPending) myPauseRequest = 'pending';
    else if (now < outcomeAt + PAUSE_OUTCOME_VISIBLE_MS) myPauseRequest = req.decision ?? 'expired';
  }

  const mine = round?.answers[viewerId];
  return {
    code: room.code,
    version: room.version,
    settings: room.settings,
    phase: pos.phase,
    roundIndex: pos.roundIndex,
    totalRounds: room.rounds.length || room.settings.rounds,
    serverNow: now,
    playAt: pos.playAt,
    endsAt: pos.endsAt,
    revealEndsAt: pos.revealEndsAt,
    audioUrl: inRound ? round?.audioUrl : undefined,
    players,
    correct,
    me: {
      id: viewerId,
      isHost: viewerId === room.hostId,
      attempts: mine?.attempts ?? 0,
      correct: mine?.correctAt !== undefined,
      points: mine?.points ?? 0,
    },
    reveal: showResults && round ? round.reveal : undefined,
    ...(buzz ? { buzz } : {}),
    ...(pos.phase === 'finished' && room.endedAt !== undefined ? { endedEarly: true } : {}),
    ...(round && inRound ? { frozen } : {}),
    ...(audioCue ? { audioCue } : {}),
    ...(pause ? { pause } : {}),
    ...(reqPending && req && viewerId === room.hostId
      ? { pauseRequest: { playerName: reqName, expiresAt: req.at + ROOM_LIMITS.pauseRequestMs } }
      : {}),
    ...(myPauseRequest ? { myPauseRequest } : {}),
  };
}
