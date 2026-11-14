import { NextRequest, NextResponse } from 'next/server';
import { DEEZER_PREVIEW_ROUTE, isAllowedAppleAudioUrl, isDeezerPreviewUrl } from '../../../../lib/audioProxyUtils';

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
    const upstreamRes = await fetch(urlParam, {
      headers: {
        'User-Agent': 'BeatDrop/2.0 (Audio Preview Proxy)',
      },
      next: { revalidate: 86400 },
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return NextResponse.json(
        { error: 'Upstream audio error' },
        { status: upstreamRes.status || 502 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', upstreamRes.headers.get('Content-Type') || 'audio/mp4');
    const contentLength = upstreamRes.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    headers.set('Accept-Ranges', 'bytes');

    return new NextResponse(upstreamRes.body, {
      status: 200,
      headers,
    });
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
