/**
 * Server data for the artist page (`/categories/artist/[id]`).
 *
 * Songs come from the same filter Artist Mode rounds use (`matchesArtistFilter` over the
 * loaded catalog), so the list is what the quiz can draw. Read-only: it may warm the
 * in-memory pool from the cloud catalog but never ingests from iTunes or writes the DB.
 *
 * No preview or store link leaves the server: each song carries an opaque, expiring
 * `/api/artists/preview?t=` path instead (see `audioToken.ts`).
 */
import type { Artist, Song } from '../../shared/types';
import {
  dedupeArtistSongs,
  sortPopular,
  type ArtistPageArtist,
  type ArtistPageData,
  type ArtistPageSong,
} from '../../shared/artistPage';
import { dbService } from '../db';
import { isJunkTrack } from '../itunes';
import { artistPreviewPath } from './audioToken';
import { getMergedArtists } from './artistRoutes';
import { parseTrackArtistCredits } from './artists';
import { matchesArtistFilter } from './roundEngine';
import { ensureCatalogLoaded, loadArtistSongsFromCloud, songPool } from './songPool';

/** Live iTunes search results get a random id per search: not linkable. */
export function isLinkableArtistId(id: string): boolean {
  return Boolean(id) && id.length <= 200 && !id.startsWith('discovered-') && !id.startsWith('temp');
}

/** Distinct credited artists on the track, from the track–artist credits (never name splitting here). */
function creditedArtistCount(song: Song): number {
  const credits = song.artists && song.artists.length > 0 ? song.artists : parseTrackArtistCredits(song.id, song.artistName, song.title);
  return new Set(credits.map((c) => c.artistId)).size;
}

export function toArtistPageSong(song: Song): ArtistPageSong | null {
  if (!song.previewUrl) return null;
  return {
    id: song.id,
    title: song.title,
    artistName: song.artistName,
    albumName: song.albumName || '',
    releaseYear: Number.isFinite(song.releaseYear) ? song.releaseYear : 0,
    ...(song.releaseDate ? { releaseDate: song.releaseDate } : {}),
    artworkUrl: song.artworkUrl || '',
    popularityScore: typeof song.popularityScore === 'number' ? song.popularityScore : 50,
    isCollab: creditedArtistCount(song) > 1,
    audioUrl: artistPreviewPath(song.previewUrl),
  };
}

function toArtistPageArtist(artist: Artist, songCount: number): ArtistPageArtist {
  return {
    id: artist.id,
    name: artist.name,
    category: artist.category,
    mainGenre: artist.mainGenre || '',
    avatarUrl: artist.avatarUrl || '',
    trackCount: songCount,
  };
}

export async function getArtistPageData(id: string): Promise<ArtistPageData | null> {
  if (!isLinkableArtistId(id)) return null;
  const artist = (await getMergedArtists()).find((a) => a.id === id);
  if (!artist) return null;

  ensureCatalogLoaded();
  await loadArtistSongsFromCloud(artist.name);

  const isArtistSong = (s: Song) =>
    !isJunkTrack(s.title, s.albumName, s.artistName) && matchesArtistFilter(s, artist.name);
  let matched = Array.from(songPool.values()).filter(isArtistSong);
  if (matched.length === 0) {
    // Same SQLite fallback Artist Mode rounds use when the pool has nothing for the artist.
    matched = dbService.searchSongs(artist.name, { artist: artist.name, limit: 200 }).filter(isArtistSong);
  }

  const songs = sortPopular(
    dedupeArtistSongs(matched.map(toArtistPageSong).filter((s): s is ArtistPageSong => s !== null))
  );
  return { artist: toArtistPageArtist(artist, songs.length), songs };
}
