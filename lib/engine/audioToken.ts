/**
 * Opaque audio links for solo, Daily and practice rounds. The preview URL identifies the
 * song (it can be matched against the public iTunes API), so clients get an encrypted,
 * expiring token instead and `/api/round/audio` streams the clip server-side.
 *
 * Stateless (AES-256-GCM, random IV) like the round token, so any serverless instance can
 * serve it, and the same song never yields the same URL twice.
 */
import crypto from 'node:crypto';

const PREFIX = 'ba1';
/** Long enough for a paused Daily round; a stale token just 404s and the round can be skipped. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function key(): Buffer {
  const secret = process.env.GAME_TOKEN_SECRET || process.env.ROUND_TOKEN_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('GAME_TOKEN_SECRET is required to sign audio links');
  }
  // Domain-separated from the round-token key: one cannot be decrypted as the other.
  return crypto.createHash('sha256').update(`audio:${secret || 'beatdrop-local-audio-key'}`).digest();
}

export function signAudioToken(sourceUrl: string, ttlMs = DEFAULT_TTL_MS): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = JSON.stringify({ u: sourceUrl, exp: Date.now() + ttlMs });
  const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

/** The source URL behind a valid, unexpired token, else null. */
export function verifyAudioToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain) as { u?: unknown; exp?: unknown };
    if (typeof parsed.u !== 'string' || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

/** Same-origin path handed to the client in place of the preview URL. */
export function roundAudioPath(sourceUrl: string, ttlMs = DEFAULT_TTL_MS): string {
  return `/api/round/audio?t=${signAudioToken(sourceUrl, ttlMs)}`;
}
