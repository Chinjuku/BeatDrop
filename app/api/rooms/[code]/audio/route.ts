import type { NextRequest } from 'next/server';
import { verifyRateLimit } from '../../../../../lib/engine/rateLimiter';
import { streamPreview } from '../../../../../lib/engine/previewStream';
import { normalizeRoomCode } from '../../../../../lib/rooms/auth';
import { resolveRoomAudio } from '../../../../../lib/rooms/audio';
import { getRoomStore } from '../../../../../lib/rooms/store';

// Node runtime: Deezer re-signing needs the in-memory catalog.
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

// An <audio> element makes a few (range) requests per clip; leave plenty of headroom.
const ROOM_AUDIO_LIMIT = { windowMs: 60_000, maxRequests: 240, prefix: 'rl_room_audio' };

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

/**
 * GET /api/rooms/[code]/audio?round=&k= — streams a round's clip. The URL is opaque (HMAC
 * over room + game + round) and the upstream preview link never leaves the server, so the
 * song cannot be identified from it before the reveal. Read-only.
 */
export async function GET(req: NextRequest | Request, { params }: Ctx) {
  const code = normalizeRoomCode((await params).code);
  if (!code) return notFound();
  const limit = await verifyRateLimit(clientIp(req), ROOM_AUDIO_LIMIT);
  if (!limit.success) return Response.json({ error: 'Too many requests' }, { status: 429 });

  const store = getRoomStore();
  if (!store) return Response.json({ error: 'Live rooms are unavailable' }, { status: 503 });
  const room = await store.get(code);
  if (!room) return notFound();

  const url = new URL(req.url);
  const resolved = resolveRoomAudio(room, url.searchParams.get('round'), url.searchParams.get('k'), Date.now());
  if (!resolved.ok) return notFound();

  // Private: the path is per room and game, never worth sharing through a CDN.
  return streamPreview(resolved.sourceUrl, { range: req.headers.get('range'), cacheControl: 'private, max-age=3600' });
}
