import { NextRequest, NextResponse } from 'next/server';
import { isDeezerPreviewUrl } from '../../../../lib/audioProxyUtils';
import { createDeezerPreviewResolver } from '../../../../lib/engine/deezerPreview';
import { ensureCatalogLoaded, songPool } from '../../../../lib/engine/songPool';
import { verifyRateLimit } from '../../../../lib/engine/rateLimiter';
import { supabaseAdmin } from '../../../../lib/supabase';

// Node runtime: needs the in-memory catalog (SQLite) to map a stored link back to its track.
export const runtime = 'nodejs';

const resolver = createDeezerPreviewResolver({
  getLocalSongs: () => songPool.values(),
  findRemoteSongId: (fileKey) => supabaseAdmin.findDeezerSongIdByPreviewKey(fileKey),
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
});

const DEEZER_PROXY_LIMIT = { windowMs: 60_000, maxRequests: 120, prefix: 'rl_deezer_audio' };

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Streams a Deezer preview after re-signing an expired stored link. Read-only: the stored
 * catalog row is never rewritten (signed links expire again within minutes anyway).
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam || !isDeezerPreviewUrl(urlParam)) {
    return NextResponse.json({ error: 'Invalid audio url' }, { status: 400 });
  }

  const limit = await verifyRateLimit(clientIp(req), DEEZER_PROXY_LIMIT);
  if (!limit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  ensureCatalogLoaded();
  const resolved = await resolver.resolve(urlParam);
  if (!resolved.ok) {
    // 410: this preview cannot be played any more; the client shows its audio error state
    // and the player can skip the round as usual.
    const status = resolved.reason === 'upstream-unavailable' ? 502 : 410;
    return NextResponse.json({ error: 'Audio preview unavailable', reason: resolved.reason }, { status });
  }

  try {
    const upstreamRes = await fetch(resolved.url, {
      headers: { 'User-Agent': 'BeatDrop/2.0 (Audio Preview Proxy)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstreamRes.ok || !upstreamRes.body) {
      return NextResponse.json({ error: 'Upstream audio error' }, { status: 502 });
    }
    const headers = new Headers();
    const type = upstreamRes.headers.get('Content-Type') || '';
    headers.set('Content-Type', type.startsWith('audio/') ? type : 'audio/mpeg');
    const contentLength = upstreamRes.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);
    // The bytes behind a file key never change, so the stored-link URL is safe to cache.
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return new NextResponse(upstreamRes.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audio preview' }, { status: 502 });
  }
}
