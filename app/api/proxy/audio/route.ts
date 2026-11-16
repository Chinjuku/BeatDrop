import { NextRequest, NextResponse } from 'next/server';
import {
  DEEZER_PREVIEW_ROUTE,
  copyRangeHeaders,
  forwardableRange,
  isAllowedAppleAudioUrl,
  isDeezerPreviewUrl,
  proxiedAudioStatus,
} from '../../../../lib/audioProxyUtils';

/** Deezer links expire, so they go to the Node route that re-signs them (same `url` query). */
function deezerRedirect(req: NextRequest, urlParam: string): NextResponse {
  const target = new URL(DEEZER_PREVIEW_ROUTE, req.nextUrl.origin);
  target.searchParams.set('url', urlParam);
  return NextResponse.redirect(target, 307);
}

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (urlParam && isDeezerPreviewUrl(urlParam)) return deezerRedirect(req, urlParam);
  if (!urlParam || !isAllowedAppleAudioUrl(urlParam)) {
    return NextResponse.json({ error: 'Invalid audio url' }, { status: 400 });
  }

  try {
    const range = forwardableRange(req.headers.get('range'));
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'BeatDrop/2.0 (Audio Preview Proxy)',
    };
    if (range) upstreamHeaders.Range = range;
    const upstreamRes = await fetch(urlParam, {
      headers: upstreamHeaders,
      // A partial response must never be cached and served as the whole file.
      ...(range ? { cache: 'no-store' as const } : { next: { revalidate: 86400 } }),
    });

    const status = proxiedAudioStatus(upstreamRes.status);
    if (status === 416) {
      const headers = new Headers();
      copyRangeHeaders(upstreamRes.headers, headers);
      return new NextResponse(null, { status, headers });
    }
    if (!upstreamRes.ok || !upstreamRes.body) {
      return NextResponse.json(
        { error: 'Upstream audio error' },
        { status: upstreamRes.status || 502 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', upstreamRes.headers.get('Content-Type') || 'audio/mp4');
    copyRangeHeaders(upstreamRes.headers, headers);
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    if (range) headers.set('Vary', 'Range');

    return new NextResponse(upstreamRes.body, { status, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audio preview' }, { status: 502 });
  }
}

export async function HEAD(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (urlParam && isDeezerPreviewUrl(urlParam)) return deezerRedirect(req, urlParam);
  if (!urlParam || !isAllowedAppleAudioUrl(urlParam)) {
    return new NextResponse(null, { status: 400 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  });
}
