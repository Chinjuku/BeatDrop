/**
 * Room audio: which upstream clip an opaque room audio URL stands for. Clients only ever see
 * `/api/rooms/{code}/audio?round=…&k=…`; the preview URL stays on the server, so it cannot be
 * matched against catalog data (autocomplete, the public iTunes API) before the reveal.
 */
import { roomAudioPath, verifyRoundAudio } from './auth';
import { locate, type RoomState } from './timeline';

export { roomAudioPath };

export type RoomAudioResolution = { ok: true; sourceUrl: string } | { ok: false };

/**
 * The clip behind a room audio URL, if the key is valid and the round has started (the
 * current round from its countdown on, or any earlier round). Future rounds stay locked.
 */
export function resolveRoomAudio(
  room: RoomState,
  rawRound: string | null,
  key: string | null,
  now: number
): RoomAudioResolution {
  if (room.status !== 'playing' || room.startedAt === undefined || !rawRound || !key) return { ok: false };
  if (!/^\d{1,3}$/.test(rawRound)) return { ok: false };
  const roundIndex = Number(rawRound);
  const round = room.rounds[roundIndex];
  if (!round) return { ok: false };
  if (!verifyRoundAudio(room.code, room.createdAt, room.startedAt, roundIndex, key)) return { ok: false };
  const pos = locate(room, now);
  if (pos.phase === 'lobby' || roundIndex > pos.roundIndex) return { ok: false };
  return { ok: true, sourceUrl: round.audioUrl };
}
