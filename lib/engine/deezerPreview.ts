/**
 * Deezer preview links are signed and expire (`hdnea=exp=...`, ~15 minutes after issue), so a
 * link stored at ingest time stops working. Rows keep their original link; at play time we
 * find the song's Deezer track id and ask `api.deezer.com/track/{id}` for a freshly signed one.
 *
 * The client only ever sends the stored link (no track id), so answers are not leaked: the
 * file key in the path is matched back to a `dz_` song server-side.
 */
import { parseDeezerPreviewUrl } from '../audioProxyUtils';
import type { Song } from '../../shared/types';

/** A link this close to expiry is treated as expired (covers the upstream request itself). */
export const DEEZER_EXPIRY_MARGIN_MS = 60_000;
const DEEZER_API_TIMEOUT_MS = 4000;
const MAX_CACHE_ENTRIES = 1000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DeezerResolverDeps {
  /** Songs already loaded on this instance (SQLite catalog / cloud rows seen so far). */
  getLocalSongs: () => Iterable<Song>;
  /** Cloud lookup by file key; returns a `dz_` id or null. */
  findRemoteSongId: (fileKey: string) => Promise<string | null>;
  fetch: FetchLike;
  now: () => number;
}

export type DeezerResolveResult =
  | { ok: true; url: string; refreshed: boolean }
  | { ok: false; reason: 'invalid-url' | 'unknown-track' | 'upstream-unavailable' };

/** `dz_916424` -> `916424`; anything else -> null. */
export function deezerTrackIdFromSongId(songId: string): string | null {
  const m = /^dz_(\d{1,15})$/.exec(songId);
  return m ? m[1] : null;
}

export function isPreviewLinkFresh(expiresAtMs: number | null, nowMs: number): boolean {
  // No `exp` means the link is not time-limited (or not one we understand): let upstream decide.
  return expiresAtMs === null || expiresAtMs - DEEZER_EXPIRY_MARGIN_MS > nowMs;
}

export function createDeezerPreviewResolver(deps: DeezerResolverDeps) {
  const freshByTrack = new Map<string, { url: string; expiresAtMs: number | null }>();
  const trackByFileKey = new Map<string, string>();
  const inFlight = new Map<string, Promise<string | null>>();

  function remember<K, V>(map: Map<K, V>, key: K, value: V) {
    if (map.size >= MAX_CACHE_ENTRIES && !map.has(key)) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  }

  async function findTrackId(fileKey: string): Promise<string | null> {
    const cached = trackByFileKey.get(fileKey);
    if (cached) return cached;
    let songId: string | null = null;
    for (const song of deps.getLocalSongs()) {
      if (!song.id.startsWith('dz_') || typeof song.previewUrl !== 'string') continue;
      if (parseDeezerPreviewUrl(song.previewUrl)?.fileKey === fileKey) {
        songId = song.id;
        break;
      }
    }
    if (!songId) songId = await deps.findRemoteSongId(fileKey);
    const trackId = songId ? deezerTrackIdFromSongId(songId) : null;
    if (trackId) remember(trackByFileKey, fileKey, trackId);
    return trackId;
  }

  async function fetchFreshPreview(trackId: string): Promise<string | null> {
    const cached = freshByTrack.get(trackId);
    if (cached && isPreviewLinkFresh(cached.expiresAtMs, deps.now())) return cached.url;

    const pending = inFlight.get(trackId);
    if (pending) return pending;

    const request = (async () => {
      try {
        const res = await deps.fetch(`https://api.deezer.com/track/${trackId}`, {
          signal: AbortSignal.timeout(DEEZER_API_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as unknown;
        if (!body || typeof body !== 'object') return null;
        const record = body as { id?: unknown; preview?: unknown; error?: unknown };
        if (record.error || String(record.id) !== trackId || typeof record.preview !== 'string') return null;
        const ref = parseDeezerPreviewUrl(record.preview);
        if (!ref || !isPreviewLinkFresh(ref.expiresAtMs, deps.now())) return null;
        remember(freshByTrack, trackId, { url: record.preview, expiresAtMs: ref.expiresAtMs });
        return record.preview;
      } catch {
        return null;
      } finally {
        inFlight.delete(trackId);
      }
    })();
    inFlight.set(trackId, request);
    return request;
  }

  return {
    /** Returns a playable Deezer link for a stored (possibly expired) one. */
    async resolve(storedUrl: string): Promise<DeezerResolveResult> {
      const ref = parseDeezerPreviewUrl(storedUrl);
      if (!ref) return { ok: false, reason: 'invalid-url' };
      if (isPreviewLinkFresh(ref.expiresAtMs, deps.now())) return { ok: true, url: storedUrl, refreshed: false };

      const trackId = await findTrackId(ref.fileKey);
      if (!trackId) return { ok: false, reason: 'unknown-track' };
      const fresh = await fetchFreshPreview(trackId);
      if (!fresh) return { ok: false, reason: 'upstream-unavailable' };
      return { ok: true, url: fresh, refreshed: true };
    },
  };
}
