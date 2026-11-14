/**
 * Live room handlers (create, join, view, start, answer, leave). Same (req, res) shape as the
 * other engine handlers, wired to Route Handlers through runApiHandler.
 */
import type { ApiRequest, ApiResponse } from '../http/api';
import { headerValue } from '../http/api';
import type { CategoryType, DifficultyLevel, Song } from '../../shared/types';
import {
  DEFAULT_ROOM_SETTINGS,
  ROOM_LIMITS,
  type RoomAudio,
  type RoomMode,
  type RoomSettings,
} from '../../shared/roomTypes';
import { songPool } from '../engine/songPool';
import { getValidLibraryPool, matchesArtistFilter, sliceByDifficulty } from '../engine/roundEngine';
import { normalizeText } from '../engine/artists';
import { isJunkTrack } from '../itunes';
import { getRoomStore, updateRoom, type RoomStore } from './store';
import { newPlayerId, newRoomCode, normalizeRoomCode, signPlayer, verifyPlayer } from './auth';
import {
  activePlayers,
  applyAnswer,
  applyBuzz,
  applyBuzzAnswer,
  buildView,
  closeRoundIfEveryoneDone,
  locate,
  type RoomRound,
  type RoomState,
} from './timeline';

const CATEGORIES: CategoryType[] = ['all', 'thai', 'international'];
const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const AUDIO: RoomAudio[] = ['host', 'everyone'];
const MODES: RoomMode[] = ['answer', 'buzzer'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Validates settings from an untrusted body; anything unknown falls back to the default. */
export function parseRoomSettings(raw: unknown): RoomSettings {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const artist = typeof b.artistName === 'string' ? b.artistName.trim().slice(0, 80) : '';
  return {
    mode: pick(b.mode, MODES, DEFAULT_ROOM_SETTINGS.mode),
    audio: pick(b.audio, AUDIO, DEFAULT_ROOM_SETTINGS.audio),
    category: pick(b.category, CATEGORIES, DEFAULT_ROOM_SETTINGS.category),
    difficulty: pick(b.difficulty, DIFFICULTIES, DEFAULT_ROOM_SETTINGS.difficulty),
    ...(artist && artist !== 'any' ? { artistName: artist } : {}),
    rounds: pick(Number(b.rounds), ROOM_LIMITS.rounds, DEFAULT_ROOM_SETTINGS.rounds),
    clipSeconds: pick(Number(b.clipSeconds), ROOM_LIMITS.clipSeconds, DEFAULT_ROOM_SETTINGS.clipSeconds),
    answerSeconds: ROOM_LIMITS.answerSeconds,
  };
}

export function parsePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Strip control characters and collapse whitespace; names are shown to other players.
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return Array.from(name).slice(0, ROOM_LIMITS.nameMaxLength).join('');
}

/** Picks distinct songs for a game with the same catalog rules as solo rounds. */
export function pickRoomSongs(settings: RoomSettings, count: number): Song[] {
  let pool: Song[];
  if (settings.artistName) {
    // Like solo artist rounds: the artist may exist only in the cloud catalog.
    pool = Array.from(songPool.values()).filter(
      (s) => !isJunkTrack(s.title, s.albumName, s.artistName) && matchesArtistFilter(s, settings.artistName)
    );
  } else {
    pool = getValidLibraryPool();
    if (settings.category !== 'all') pool = pool.filter((s) => s.category === settings.category);
  }
  pool = pool.filter((s) => typeof s.previewUrl === 'string' && s.previewUrl.startsWith('http'));

  const unique = new Map<string, Song>();
  for (const s of pool) {
    const k = `${normalizeText(s.title)}::${normalizeText(s.artistName)}`;
    const existing = unique.get(k);
    if (!existing || (s.popularityScore || 50) > (existing.popularityScore || 50)) unique.set(k, s);
  }
  const candidates = sliceByDifficulty(Array.from(unique.values()), settings.difficulty);
  // Fisher–Yates on a copy, then take the first `count`.
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function toRound(song: Song): RoomRound {
  return {
    songId: String(song.id),
    audioUrl: song.previewUrl,
    reveal: { id: String(song.id), title: song.title, artistName: song.artistName, artworkUrl: song.artworkUrl },
    answers: {},
  };
}

function isCorrectGuess(round: RoomRound, body: Record<string, unknown>): boolean {
  const trackId = typeof body.candidateTrackId === 'string' || typeof body.candidateTrackId === 'number'
    ? String(body.candidateTrackId).slice(0, 128)
    : '';
  if (trackId && trackId === round.songId) return true;
  const known = trackId ? songPool.get(trackId) : undefined;
  const title = known?.title || (typeof body.candidateTitle === 'string' ? body.candidateTitle.slice(0, 300) : '');
  const artist = known?.artistName || (typeof body.candidateArtist === 'string' ? body.candidateArtist.slice(0, 300) : '');
  if (!title || normalizeText(title) !== normalizeText(round.reveal.title)) return false;
  const a = normalizeText(artist);
  const b = normalizeText(round.reveal.artistName);
  return !a || a.includes(b) || b.includes(a);
}

// ---------------------------------------------------------------------------------------------

function requireStore(res: ApiResponse): RoomStore | null {
  const store = getRoomStore();
  if (!store) {
    res.status(503).json({ code: -503, message: 'Live rooms need a shared store (Upstash Redis) on this deployment.' });
  }
  return store;
}

function roomCodeFrom(req: ApiRequest, res: ApiResponse): string | null {
  const code = normalizeRoomCode(req.params.code);
  if (!code) res.status(404).json({ code: -404, message: 'Room not found' });
  return code;
}

function playerFrom(req: ApiRequest, code: string, res: ApiResponse): string | null {
  const playerId = verifyPlayer(code, headerValue(req, 'x-room-token'));
  if (!playerId) res.status(401).json({ code: -401, message: 'Join the room first' });
  return playerId;
}

function sendView(res: ApiResponse, room: RoomState, playerId: string, extra?: Record<string, unknown>) {
  res.json({ code: 0, message: 'ok', data: { room: buildView(room, playerId, Date.now()), ...extra } });
}

/** POST /api/rooms — { name, settings } */
export async function handleCreateRoom(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const name = parsePlayerName(req.body?.name);
  if (!name) {
    res.status(400).json({ code: -1, message: 'Enter a name' });
    return;
  }
  const settings = parseRoomSettings(req.body?.settings);
  const hostId = newPlayerId();
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const room: RoomState = {
      code: newRoomCode(ROOM_LIMITS.codeLength),
      version: 1,
      createdAt: now,
      hostId,
      settings,
      players: [{ id: hostId, name, joinedAt: now, score: 0 }],
      status: 'lobby',
      rounds: [],
    };
    if (await store.create(room)) {
      sendView(res, room, hostId, { playerToken: signPlayer(room.code, hostId) });
      return;
    }
  }
  res.status(503).json({ code: -503, message: 'Could not create a room, please retry' });
}

/** GET /api/rooms/[code] — read-only view for the caller. */
export async function handleGetRoom(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const room = await store.get(code);
  if (!room) {
    res.status(404).json({ code: -404, message: 'Room not found' });
    return;
  }
  const playerId = verifyPlayer(code, headerValue(req, 'x-room-token'));
  if (!playerId || !room.players.some((p) => p.id === playerId)) {
    // Not joined yet: only enough to show the join screen.
    res.json({
      code: 0,
      message: 'ok',
      data: {
        preview: {
          code: room.code,
          players: activePlayers(room).length,
          full: activePlayers(room).length >= ROOM_LIMITS.maxPlayers,
          started: room.status === 'playing' && locate(room, Date.now()).phase !== 'finished',
          settings: room.settings,
        },
      },
    });
    return;
  }
  sendView(res, room, playerId);
}

/** POST /api/rooms/[code]/join — { name } */
export async function handleJoinRoom(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const name = parsePlayerName(req.body?.name);
  if (!name) {
    res.status(400).json({ code: -1, message: 'Enter a name' });
    return;
  }
  // Rejoining with a valid token keeps the same player (refresh, second tab).
  const existingId = verifyPlayer(code, headerValue(req, 'x-room-token'));
  let failure: { status: number; message: string } | null = null;
  const playerId = existingId ?? newPlayerId();

  const outcome = await updateRoom(store, code, (room) => {
    const known = room.players.find((p) => p.id === playerId);
    if (known) {
      known.leftAt = undefined;
      known.name = name;
      return true;
    }
    if (activePlayers(room).length >= ROOM_LIMITS.maxPlayers) {
      failure = { status: 409, message: 'This room is full' };
      return false;
    }
    room.players.push({ id: playerId, name, joinedAt: Date.now(), score: 0 });
    return true;
  });
  if (!outcome.room) {
    res.status(404).json({ code: -404, message: 'Room not found' });
    return;
  }
  if (outcome.result === false) {
    const f = failure as { status: number; message: string } | null;
    res.status(f?.status ?? 409).json({ code: -(f?.status ?? 409), message: f?.message ?? 'Could not join' });
    return;
  }
  sendView(res, outcome.room, playerId, { playerToken: signPlayer(code, playerId) });
}

/** POST /api/rooms/[code]/start — host only; also restarts a finished game with new songs. */
export async function handleStartRoom(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const playerId = playerFrom(req, code, res);
  if (!playerId) return;

  const current = await store.get(code);
  if (!current) {
    res.status(404).json({ code: -404, message: 'Room not found' });
    return;
  }
  // Pick songs outside the locked update; the catalog lookup is the slow part.
  const songs = pickRoomSongs(current.settings, current.settings.rounds);
  if (songs.length === 0) {
    res.status(404).json({ code: -404, message: 'No songs match these room settings' });
    return;
  }

  let failure: { status: number; message: string } | null = null;
  const outcome = await updateRoom(store, code, (room) => {
    if (room.hostId !== playerId) {
      failure = { status: 403, message: 'Only the host can start' };
      return false;
    }
    const phase = locate(room, Date.now()).phase;
    if (phase !== 'lobby' && phase !== 'finished') {
      failure = { status: 409, message: 'The game is already running' };
      return false;
    }
    room.status = 'playing';
    room.startedAt = Date.now();
    room.rounds = songs.map(toRound);
    for (const p of room.players) p.score = 0;
    room.players = room.players.filter((p) => p.leftAt === undefined);
    return true;
  });
  if (outcome.result === false) {
    const f = failure as { status: number; message: string } | null;
    res.status(f?.status ?? 404).json({ code: -(f?.status ?? 404), message: f?.message ?? 'Room not found' });
    return;
  }
  sendView(res, outcome.room, playerId);
}

/** POST /api/rooms/[code]/answer — { candidateTrackId, candidateTitle?, candidateArtist? } */
export async function handleRoomAnswer(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const playerId = playerFrom(req, code, res);
  if (!playerId) return;
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

  let rejected: string | null = null;
  let result: { correct: boolean; points: number; attemptsLeft: number } | null = null;
  const outcome = await updateRoom(store, code, (room) => {
    const now = Date.now(); // server receipt time decides the score
    const pos = locate(room, now);
    const round = room.rounds[pos.roundIndex];
    const correct = pos.phase === 'guessing' && round ? isCorrectGuess(round, body) : false;
    const applied = room.settings.mode === 'buzzer'
      ? applyBuzzAnswer(room, playerId, correct, now)
      : applyAnswer(room, playerId, correct, now);
    if (!applied.ok) {
      rejected = applied.reason;
      return false;
    }
    result = applied;
    return true;
  });
  if (!outcome.room) {
    res.status(404).json({ code: -404, message: 'Room not found' });
    return;
  }
  if (outcome.result === false) {
    res.status(409).json({ code: -409, message: rejected ?? 'Answer not accepted' });
    return;
  }
  sendView(res, outcome.room, playerId, { answer: result });
}

/** POST /api/rooms/[code]/buzz — buzzer mode: claim the right to answer. */
export async function handleRoomBuzz(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const playerId = playerFrom(req, code, res);
  if (!playerId) return;

  let rejected: string | null = null;
  const outcome = await updateRoom(store, code, (room) => {
    if (room.settings.mode !== 'buzzer') {
      rejected = 'not-buzzer-mode';
      return false;
    }
    const applied = applyBuzz(room, playerId, Date.now()); // server receipt time decides who was first
    if (!applied.ok) {
      rejected = applied.reason;
      return false;
    }
    return true;
  });
  if (!outcome.room) {
    res.status(404).json({ code: -404, message: 'Room not found' });
    return;
  }
  if (outcome.result === false) {
    // Losing the race is normal: still send the current view so the client shows who has it.
    res.status(409).json({
      code: -409,
      message: rejected ?? 'Buzz not accepted',
      data: { room: buildView(outcome.room, playerId, Date.now()) },
    });
    return;
  }
  sendView(res, outcome.room, playerId);
}

/** POST /api/rooms/[code]/leave */
export async function handleLeaveRoom(req: ApiRequest, res: ApiResponse): Promise<void> {
  const store = requireStore(res);
  if (!store) return;
  const code = roomCodeFrom(req, res);
  if (!code) return;
  const playerId = playerFrom(req, code, res);
  if (!playerId) return;
  await updateRoom(store, code, (room) => {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.leftAt !== undefined) return false;
    const now = Date.now();
    player.leftAt = now;
    if (room.hostId === playerId) {
      const next = activePlayers(room)[0];
      if (next) room.hostId = next.id; // hand the host role on so the room can continue
    }
    const pos = locate(room, now);
    if (pos.phase === 'guessing' || pos.phase === 'countdown') closeRoundIfEveryoneDone(room, pos.roundIndex, now);
    return true;
  });
  res.json({ code: 0, message: 'ok' });
}
