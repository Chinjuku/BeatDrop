/**
 * HTTP Range pass-through in the audio proxies. The HTML5 <audio> fallback seeks with
 * Range requests; without them resuming a paused reveal restarted the song at 0s.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/proxy/audio/route';

const APPLE = 'https://audio-ssl.itunes.apple.com/itunes-assets/sample.m4a';
const realFetch = globalThis.fetch;
let seen: Headers | null = null;

function mockUpstream(status: number, headers: Record<string, string>) {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return new Response(new Uint8Array(16), { status, headers });
  }) as typeof fetch;
}

function proxyRequest(range?: string) {
  const url = `http://localhost/api/proxy/audio?url=${encodeURIComponent(APPLE)}`;
  return new NextRequest(url, { headers: range ? { Range: range } : {} });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  seen = null;
});

describe('audio proxy Range support', () => {
  it('forwards Range and answers 206 with Content-Range', async () => {
    mockUpstream(206, {
      'Content-Type': 'audio/mp4',
      'Content-Length': '16',
      'Content-Range': 'bytes 1000-1015/500000',
    });
    const res = await GET(proxyRequest('bytes=1000-'));
    assert.equal(seen?.get('range'), 'bytes=1000-');
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('Content-Range'), 'bytes 1000-1015/500000');
    assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
  });

  it('keeps 200 for a plain request', async () => {
    mockUpstream(200, { 'Content-Type': 'audio/mp4', 'Content-Length': '16' });
    const res = await GET(proxyRequest());
    assert.equal(seen?.get('range'), null);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Range'), null);
  });

  it('does not forward a malformed Range header', async () => {
    mockUpstream(200, { 'Content-Type': 'audio/mp4' });
    await GET(proxyRequest('bytes=abc; drop'));
    assert.equal(seen?.get('range'), null);
  });

  it('passes an unsatisfiable range through as 416', async () => {
    mockUpstream(416, { 'Content-Range': 'bytes */500000' });
    const res = await GET(proxyRequest('bytes=999999999-'));
    assert.equal(res.status, 416);
    assert.equal(res.headers.get('Content-Range'), 'bytes */500000');
  });
});
