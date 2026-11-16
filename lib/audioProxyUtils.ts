/**
 * Pure URL checks shared by the audio proxy (Edge), the Deezer refresh route (Node) and the
 * client audio hooks. No server-only imports here: this module is bundled for the browser too.
 */

export function isAllowedAppleAudioUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'audio-ssl.itunes.apple.com' ||
      host.endsWith('.itunes.apple.com') ||
      (host.endsWith('.apple.com') && host.includes('audio'))
    );
  } catch {
    return false;
  }
}

/** Deezer preview CDN hosts, e.g. `cdnt-preview.dzcdn.net`, `cdns-preview-e.dzcdn.net`. */
const DEEZER_PREVIEW_HOST = /^cdn[a-z]?-preview(?:-[0-9a-z])?\.dzcdn\.net$/;
/** `/api/1/1/a/e/b/0/<32 hex>.mp3`: the hex name identifies the recording and survives refreshes. */
const DEEZER_PREVIEW_PATH = /^\/api\/\d{1,3}\/\d{1,3}\/(?:[0-9a-z]\/){1,8}([0-9a-f]{32})\.mp3$/;

export interface DeezerPreviewRef {
  /** Stable 32-hex file key from the path; identical in an expired link and its refreshed one. */
  fileKey: string;
  /** Signed-link expiry in epoch ms, or null when the link carries no `exp`. */
  expiresAtMs: number | null;
}

/**
 * Strictly parses a Deezer preview link (https, known CDN host, exact path shape, no
 * credentials or custom port). Returns null for anything else.
 */
export function parseDeezerPreviewUrl(rawUrl: string): DeezerPreviewRef | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return null;
  if (!DEEZER_PREVIEW_HOST.test(parsed.hostname.toLowerCase())) return null;
  const match = DEEZER_PREVIEW_PATH.exec(parsed.pathname);
  if (!match) return null;

  // hdnea=exp=1793536656~acl=...~hmac=... (URLSearchParams decodes it for us)
  const hdnea = parsed.searchParams.get('hdnea') || '';
  const exp = /(?:^|~)exp=(\d{9,11})(?:~|$)/.exec(hdnea);
  return {
    fileKey: match[1],
    expiresAtMs: exp ? Number(exp[1]) * 1000 : null,
  };
}

export function isDeezerPreviewUrl(rawUrl: string): boolean {
  return parseDeezerPreviewUrl(rawUrl) !== null;
}

/** Path of the Node route that re-signs Deezer previews before streaming them. */
export const DEEZER_PREVIEW_ROUTE = '/api/proxy/deezer';

/** Same-origin URL the client should fetch for any stored preview link. */
export function proxiedAudioUrl(rawUrl: string): string {
  const route = isDeezerPreviewUrl(rawUrl) ? DEEZER_PREVIEW_ROUTE : '/api/proxy/audio';
  return `${route}?url=${encodeURIComponent(rawUrl)}`;
}

// --- HTTP Range pass-through -------------------------------------------------
// The HTML5 <audio> fallback seeks with Range requests. Without them the browser cannot
// jump to an offset, so resuming a paused preview restarted it at 0s.

const RANGE_HEADER = /^bytes=\d*-\d*$/;

/** The client's Range header when it is a single well-formed byte range, else null. */
export function forwardableRange(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return RANGE_HEADER.test(trimmed) && trimmed !== 'bytes=-' ? trimmed : null;
}

/** Status the proxy answers with: 206 / 416 pass through, anything else becomes 200. */
export function proxiedAudioStatus(upstreamStatus: number): 200 | 206 | 416 {
  return upstreamStatus === 206 || upstreamStatus === 416 ? upstreamStatus : 200;
}

/** Copies the length/range headers a seeking media element needs. */
export function copyRangeHeaders(from: Headers, to: Headers): void {
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = from.get(name);
    if (value) to.set(name, value);
  }
  to.set('Accept-Ranges', 'bytes');
}
