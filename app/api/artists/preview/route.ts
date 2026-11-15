import { verifyRateLimit } from '../../../../lib/engine/rateLimiter';
import { verifyAudioToken } from '../../../../lib/engine/audioToken';
import { streamPreview } from '../../../../lib/engine/previewStream';

// Node runtime: token decryption uses node:crypto and Deezer re-signing needs the catalog.
export const runtime = 'nodejs';

// Browsing an artist plays one clip per tap (plus range requests); separate from round audio.
const ARTIST_PREVIEW_LIMIT = { windowMs: 60_000, maxRequests: 120, prefix: 'rl_artist_preview' };

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * GET /api/artists/preview?t= — streams the 30 s preview behind an opaque artist-page token.
 * The upstream preview URL never reaches the client. Read-only.
 */
export async function GET(req: Request) {
  const sourceUrl = verifyAudioToken(new URL(req.url).searchParams.get('t'));
  if (!sourceUrl) return Response.json({ error: 'Not found' }, { status: 404 });
  const limit = await verifyRateLimit(clientIp(req), ARTIST_PREVIEW_LIMIT);
  if (!limit.success) return Response.json({ error: 'Too many requests' }, { status: 429 });
  return streamPreview(sourceUrl, { range: req.headers.get('range'), cacheControl: 'private, max-age=3600' });
}
