/**
 * Server-side streaming of a stored preview link (Apple, or Deezer re-signed on the fly).
 * Used where the client must not learn the upstream URL (live room audio). Only audio bytes
 * and range headers are passed through; no upstream URL, redirect or header reaches the client.
 */
import { isAllowedAppleAudioUrl, isDeezerPreviewUrl } from '../audioProxyUtils';
import { createDeezerPreviewResolver } from './deezerPreview';
import { ensureCatalogLoaded, songPool } from './songPool';
import { supabaseAdmin } from '../supabase';

/** Shared by every Node route that plays Deezer previews, so they share its link cache. */
export const deezerPreviewResolver = createDeezerPreviewResolver({
  getLocalSongs: () => songPool.values(),
  findRemoteSongId: (fileKey) => supabaseAdmin.findDeezerSongIdByPreviewKey(fileKey),
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
});

const RANGE_PATTERN = /^bytes=\d*-\d*$/;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export interface StreamPreviewOptions {
  range?: string | null;
  cacheControl: string;
}

/** Fetches `sourceUrl` server-side and streams it back with only safe headers. */
export async function streamPreview(sourceUrl: string, { range, cacheControl }: StreamPreviewOptions): Promise<Response> {
  let upstreamUrl: string;
  if (isDeezerPreviewUrl(sourceUrl)) {
    ensureCatalogLoaded();
    const resolved = await deezerPreviewResolver.resolve(sourceUrl);
    if (!resolved.ok) {
      return jsonError('Audio preview unavailable', resolved.reason === 'upstream-unavailable' ? 502 : 410);
    }
    upstreamUrl = resolved.url;
  } else if (isAllowedAppleAudioUrl(sourceUrl)) {
    upstreamUrl = sourceUrl;
  } else {
    return jsonError('Audio preview unavailable', 410);
  }

  const headers: Record<string, string> = { 'User-Agent': 'BeatDrop/2.0 (Audio Preview Proxy)' };
  if (range && RANGE_PATTERN.test(range)) headers.Range = range;

  try {
    const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(8000) });
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
      return jsonError('Upstream audio error', 502);
    }
    const out = new Headers();
    const type = upstream.headers.get('Content-Type') || '';
    out.set('Content-Type', type.startsWith('audio/') ? type : 'audio/mpeg');
    const length = upstream.headers.get('Content-Length');
    if (length) out.set('Content-Length', length);
    const contentRange = upstream.headers.get('Content-Range');
    if (upstream.status === 206 && contentRange) out.set('Content-Range', contentRange);
    out.set('Accept-Ranges', 'bytes');
    out.set('Cache-Control', cacheControl);
    out.set('X-Content-Type-Options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return jsonError('Failed to fetch audio preview', 502);
  }
}
