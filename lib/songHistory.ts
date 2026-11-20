/**
 * Songs this device has played, for the "My song history" page.
 *
 * Stored through the consent-gated preference storage: nothing is written unless the player
 * allowed preference cookies. It is a local convenience only: never sent anywhere and never
 * used for scores or leaderboards. Values read back are validated because localStorage is
 * editable by the player.
 */
import { getPreference, removePreference, setPreference } from './preferenceStorage';
import type { Song } from '../shared/types';

const KEY = 'songspot:song-history:v1';
const MAX_ENTRIES = 200;

export interface SongHistoryEntry {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  trackViewUrl?: string;
  outcome: 'correct' | 'failed';
  playCount: number;
  at: number;
}

const str = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const httpsUrl = (v: unknown): v is string => str(v, 1000) && /^https:\/\//.test(v);

function isEntry(value: unknown): value is SongHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    str(v.id, 100) && str(v.title) && str(v.artistName) &&
    typeof v.albumName === 'string' && v.albumName.length <= 300 &&
    (v.artworkUrl === '' || httpsUrl(v.artworkUrl)) &&
    (v.trackViewUrl === undefined || httpsUrl(v.trackViewUrl)) &&
    (v.outcome === 'correct' || v.outcome === 'failed') &&
    typeof v.playCount === 'number' && Number.isInteger(v.playCount) && v.playCount >= 1 &&
    typeof v.at === 'number' && Number.isFinite(v.at)
  );
}

/** Newest first. */
export function readSongHistory(): SongHistoryEntry[] {
  try {
    const raw = getPreference(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** One entry per song id: a replay moves it to the top and keeps the latest outcome. */
export function recordSongResult(song: Song, outcome: 'correct' | 'failed'): void {
  const previous = readSongHistory();
  const old = previous.find((e) => e.id === song.id);
  const entry: SongHistoryEntry = {
    id: song.id,
    title: song.title,
    artistName: song.artistName,
    albumName: song.albumName ?? '',
    artworkUrl: /^https:\/\//.test(song.artworkUrl ?? '') ? song.artworkUrl : '',
    trackViewUrl: song.trackViewUrl && /^https:\/\//.test(song.trackViewUrl) ? song.trackViewUrl : undefined,
    outcome,
    playCount: (old?.playCount ?? 0) + 1,
    at: Date.now(),
  };
  if (!isEntry(entry)) return;
  const next = [entry, ...previous.filter((e) => e.id !== song.id)].slice(0, MAX_ENTRIES);
  setPreference(KEY, JSON.stringify(next));
}

export function clearSongHistory(): void {
  removePreference(KEY);
}

/** The track's own Apple Music page when known, otherwise an Apple Music search. */
export function appleMusicUrl(title: string, artistName: string, trackViewUrl?: string): string {
  if (trackViewUrl && /^https:\/\//.test(trackViewUrl)) return trackViewUrl;
  return `https://music.apple.com/search?term=${encodeURIComponent(`${title} ${artistName}`)}`;
}

export function spotifySearchUrl(title: string, artistName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artistName}`)}`;
}
