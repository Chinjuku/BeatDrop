import crypto from 'node:crypto';

const COOKIE_NAME = 'beatdrop_daily_player';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function signingKey(): Buffer {
  const secret = process.env.GAME_TOKEN_SECRET || process.env.ROUND_TOKEN_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('GAME_TOKEN_SECRET is required for Daily Challenge sessions');
  }
  return crypto.createHash('sha256').update(secret || 'beatdrop-local-daily-session-key').digest();
}

function signature(playerId: string): string {
  return crypto.createHmac('sha256', signingKey()).update(playerId).digest('base64url');
}

function cookieHeader(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const value = req.headers?.cookie;
  return Array.isArray(value) ? value.join(';') : value || '';
}

function verifyCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const [playerId, suppliedSignature] = decodeURIComponent(raw).split('.');
    if (!playerId || !suppliedSignature) return null;
    const expected = Buffer.from(signature(playerId));
    const actual = Buffer.from(suppliedSignature);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
      ? playerId
      : null;
  } catch {
    return null;
  }
}

export function getDailyPlayerId(
  req: { headers?: Record<string, string | string[] | undefined> },
  res?: { setHeader?: (name: string, value: string) => unknown }
): string {
  const raw = cookieHeader(req)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  const validPlayerId = verifyCookieValue(raw);
  if (validPlayerId) return validPlayerId;

  const playerId = crypto.randomUUID();
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production';
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(`${playerId}.${signature(playerId)}`)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  res?.setHeader?.('Set-Cookie', cookie);
  return playerId;
}

export function readDailyPlayerId(req: { headers?: Record<string, string | string[] | undefined> }): string | null {
  const raw = cookieHeader(req)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return verifyCookieValue(raw);
}
