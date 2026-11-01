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

const getSecret = (): string => {
  const secret = process.env.GAME_TOKEN_SECRET || process.env.ROUND_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY CRITICAL] GAME_TOKEN_SECRET (or ROUND_TOKEN_SECRET) must be set in production to prevent token forging!'
      );
    }
    return 'beatdrop-stateless-round-secret-2026';
  }
  return secret;
};

export function signRoundToken(state: Omit<StatelessRoundPayload, 'exp'>, ttlMs = 1000 * 60 * 60 * 12): string {
  const payload: StatelessRoundPayload = {
    ...state,
    exp: Date.now() + ttlMs,
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `bd1.${data}.${sig}`;
}

export function verifyRoundToken(token: string | undefined | null): StatelessRoundPayload | null {
  if (!token || typeof token !== 'string' || !token.startsWith('bd1.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [, data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as StatelessRoundPayload;
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

