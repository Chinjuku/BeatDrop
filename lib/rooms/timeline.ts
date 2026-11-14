/**
 * Live room state and its timeline. Everything here is pure: the current phase is derived
 * from the stored timestamps and `now`, so reading a room never needs to write it.
 *
 * A round's early end (`finishedAt`) is only ever written by a write request (answer, buzz
 * answer, leave). It is never re-derived from the current player list, so a player leaving
 * later cannot shift the timing of rounds that were already played.
 */
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

function roundEnd(room: RoomState, round: RoomRound, playAt: number): number {
  const timerEnd = playAt + room.settings.answerSeconds * 1000;
  let end = timerEnd;
  if (room.settings.mode === 'buzzer') {
    // A buzz pressed before the timer ran out still gets its full time to answer.
    const last = round.buzzes?.[round.buzzes.length - 1];
    if (last && last.at < timerEnd) end = Math.max(timerEnd, last.resolvedAt ?? last.deadline);
  }
  if (round.finishedAt !== undefined) end = Math.min(end, Math.max(playAt, round.finishedAt));
  return end;
}

/** Where the game is at `now`. */
export function locate(room: RoomState, now: number): RoomPosition {
  if (room.status === 'lobby' || room.startedAt === undefined || room.rounds.length === 0) {
    return { phase: 'lobby', roundIndex: 0 };
  }
  let t = room.startedAt;
  for (let i = 0; i < room.rounds.length; i++) {
    const playAt = t + ROOM_LIMITS.countdownMs;
    const endsAt = roundEnd(room, room.rounds[i], playAt);
    const revealEndsAt = endsAt + ROOM_LIMITS.revealMs;
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

/** 1000 points for an instant answer, falling linearly to 100 at the end of the window. */
export function scoreForAnswer(playAt: number, correctAt: number, answerSeconds: number): number {
  const fraction = Math.min(1, Math.max(0, (correctAt - playAt) / (answerSeconds * 1000)));
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

export type AnswerOutcome =
  | { ok: true; correct: boolean; points: number; attemptsLeft: number }
  | { ok: false; reason: 'not-guessing' | 'already-done' | 'not-a-player' | 'not-your-turn' };

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
  if (playerDone(room, g.round, playerId, now)) return { ok: false, reason: 'already-done' };

  const answer = g.round.answers[playerId] ?? { attempts: 0, points: 0 };
  answer.attempts += 1;
  if (isCorrect) {
    answer.correctAt = now;
    answer.points = scoreForAnswer(g.playAt, now, room.settings.answerSeconds);
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
  | { ok: false; reason: 'not-guessing' | 'taken' | 'locked-out' | 'not-a-player' | 'too-late' };

/** Buzzer mode: claims the buzzer if it is free. Mutates `room` on success. */
export function applyBuzz(room: RoomState, playerId: string, now: number): BuzzOutcome {
  if (!findActive(room, playerId)) return { ok: false, reason: 'not-a-player' };
  const g = guessingRound(room, now);
  if (!g) return { ok: false, reason: 'not-guessing' };
  // New buzzes only inside the answer window; a buzz near the end still gets its full time.
  if (now >= g.playAt + room.settings.answerSeconds * 1000) return { ok: false, reason: 'too-late' };
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
  const { holder } = buzzState(g.round, now);
  if (!holder || holder.playerId !== playerId) return { ok: false, reason: 'not-your-turn' };

  holder.result = isCorrect ? 'correct' : 'wrong';
  holder.resolvedAt = now;
  const answer = g.round.answers[playerId] ?? { attempts: 0, points: 0 };
  answer.attempts += 1;
  if (isCorrect) {
    answer.correctAt = now;
    answer.points = scoreForAnswer(g.playAt, holder.at, room.settings.answerSeconds);
    player.score += answer.points;
    g.round.finishedAt = now; // someone got it: the song is over
  } else {
    closeRoundIfEveryoneDone(room, g.pos.roundIndex, now);
  }
  g.round.answers[playerId] = answer;
  return { ok: true, correct: isCorrect, points: answer.points, attemptsLeft: 0 };
}

/** The view one player is allowed to see. Never includes the answer before the reveal. */
export function buildView(room: RoomState, viewerId: string, now: number): RoomView {
  const pos = locate(room, now);
  const round = room.status === 'playing' ? room.rounds[pos.roundIndex] : undefined;
  const showResults = pos.phase === 'reveal' || pos.phase === 'finished';
  const inRound = pos.phase === 'countdown' || pos.phase === 'guessing' || pos.phase === 'reveal';

  const players = room.players
    .map((p) => {
      const answer = round?.answers[p.id];
      return {
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.id === room.hostId,
        isMe: p.id === viewerId,
        left: p.leftAt !== undefined,
        done: round ? playerDone(room, round, p.id, now) : false,
        ...(showResults && round
          ? { roundPoints: answer?.points ?? 0, roundCorrect: answer?.correctAt !== undefined }
          : {}),
      };
    })
    .sort((a, b) => b.score - a.score || Number(a.left) - Number(b.left));

  let buzz: RoomView['buzz'];
  if (room.settings.mode === 'buzzer' && round && pos.phase === 'guessing' && pos.playAt !== undefined) {
    const state = buzzState(round, now);
    const holderName = state.holder ? room.players.find((p) => p.id === state.holder!.playerId)?.name : undefined;
    const lockedOut = state.lockedOut.has(viewerId);
    const windowOpen = now < pos.playAt + room.settings.answerSeconds * 1000;
    buzz = {
      holderId: state.holder?.playerId,
      holderName,
      deadline: state.holder?.deadline,
      lockedOut,
      canBuzz: windowOpen && !state.holder && !lockedOut && round.answers[viewerId]?.correctAt === undefined,
    };
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
    me: {
      id: viewerId,
      isHost: viewerId === room.hostId,
      attempts: mine?.attempts ?? 0,
      correct: mine?.correctAt !== undefined,
      points: mine?.points ?? 0,
    },
    reveal: showResults && round ? round.reveal : undefined,
    ...(buzz ? { buzz } : {}),
  };
}
