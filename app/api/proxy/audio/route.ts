import { NextRequest, NextResponse } from 'next/server';
import { isAllowedAppleAudioUrl } from '../../../../lib/audioProxyUtils';

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
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
