/**
 * Room player credentials: a random player id plus an HMAC over room code + id. The client
 * keeps both in sessionStorage and sends the token with every room request.
 */
import crypto from 'node:crypto';

function secret(): Buffer {
  const value = process.env.GAME_TOKEN_SECRET || process.env.ROUND_TOKEN_SECRET;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('GAME_TOKEN_SECRET is required for live rooms');
  }
  return crypto.createHash('sha256').update(`room:${value || 'beatdrop-local-room-key'}`).digest();
}

export function newPlayerId(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export function signPlayer(code: string, playerId: string): string {
  const mac = crypto.createHmac('sha256', secret()).update(`${code}:${playerId}`).digest('base64url');
  return `${playerId}.${mac}`;
}

/** Returns the player id if the token is valid for this room. */
export function verifyPlayer(code: string, token: string | undefined): string | null {
  if (!token) return null;
  const [playerId, mac] = token.split('.');
  if (!playerId || !mac) return null;
  const expected = Buffer.from(signPlayer(code, playerId).split('.')[1]);
  const actual = Buffer.from(mac);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? playerId : null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{5}$/.test(code) ? code : null;
}

/**
 * Opaque key for one round's clip. Covers the room's game (createdAt + startedAt, so a rematch
 * under the same code gets new URLs) and the round index. It says nothing about the song.
 */
export function signRoundAudio(code: string, createdAt: number, startedAt: number, roundIndex: number): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`audio:${code}:${createdAt}:${startedAt}:${roundIndex}`)
    .digest('base64url')
    .slice(0, 22);
}

export function verifyRoundAudio(
  code: string,
  createdAt: number,
  startedAt: number,
  roundIndex: number,
  key: string
): boolean {
  const expected = Buffer.from(signRoundAudio(code, createdAt, startedAt, roundIndex));
  const actual = Buffer.from(key);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Same-origin path the room view hands out instead of the raw preview URL. */
export function roomAudioPath(
  room: { code: string; createdAt: number; startedAt?: number },
  roundIndex: number
): string {
  const key = signRoundAudio(room.code, room.createdAt, room.startedAt ?? 0, roundIndex);
  return `/api/rooms/${room.code}/audio?round=${roundIndex}&k=${key}`;
}
