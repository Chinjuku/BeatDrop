import { verifyRateLimit } from '../../../../lib/engine/rateLimiter';
import { verifyAudioToken } from '../../../../lib/engine/audioToken';
import { streamPreview } from '../../../../lib/engine/previewStream';

// Node runtime: token decryption uses node:crypto and Deezer re-signing needs the catalog.
export const runtime = 'nodejs';

// Solo play loads one clip per round (plus prefetch and range requests); leave headroom.
const ROUND_AUDIO_LIMIT = { windowMs: 60_000, maxRequests: 240, prefix: 'rl_round_audio' };

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * GET /api/round/audio?t= — streams the clip behind an opaque audio token (solo, Daily,
 * practice rounds). The upstream preview URL never reaches the client. Read-only.
 */
export async function GET(req: Request) {
  const sourceUrl = verifyAudioToken(new URL(req.url).searchParams.get('t'));
  if (!sourceUrl) return Response.json({ error: 'Not found' }, { status: 404 });
  const limit = await verifyRateLimit(clientIp(req), ROUND_AUDIO_LIMIT);
  if (!limit.success) return Response.json({ error: 'Too many requests' }, { status: 429 });
  // Private: each token is per round and expires; nothing for a CDN to share.
  return streamPreview(sourceUrl, { range: req.headers.get('range'), cacheControl: 'private, max-age=3600' });
}
