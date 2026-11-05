import crypto from 'node:crypto';
import type { CategoryType, DifficultyLevel, GameMode, Song } from './types';

export interface StatelessRoundPayload {
  track: Song;
  difficulty: DifficultyLevel;
  stages: number[];
  stage: number;
  clipSeconds: number;
  mistakes: number;
  category: CategoryType;
  mode: GameMode;
  exp: number;
  startedAt?: number;
}

const getKey = (): Buffer => {
  const secret = process.env.GAME_TOKEN_SECRET || process.env.ROUND_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY CRITICAL] GAME_TOKEN_SECRET (or ROUND_TOKEN_SECRET) must be set in production to prevent token forging!'
      );
    }
    return crypto.createHash('sha256').update('beatdrop-stateless-round-secret-2026').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
};

export function signRoundToken(state: Omit<StatelessRoundPayload, 'exp'>, ttlMs = 1000 * 60 * 60 * 12): string {
  const payload: StatelessRoundPayload = {
    ...state,
    exp: Date.now() + ttlMs,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `bd2.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function verifyRoundToken(token: string | undefined | null): StatelessRoundPayload | null {
  if (!token || typeof token !== 'string' || !token.startsWith('bd2.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 4) return null;

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted) as StatelessRoundPayload;
    if (!parsed || !parsed.track || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getBangkokDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

