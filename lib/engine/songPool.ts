import { Artist, Song } from '../../shared/types';
import { isDbLocal, isSupabaseConfigured } from '../supabase';
import { dbService } from '../db';
import { checkArtistStrictMatch, isJunkTrack } from '../itunes';
import { redis, isRedisConfigured } from '../redis';
import {
  CURATED_ARTISTS,
  customArtists,
  loadCustomArtists,
  getAllArtists,
  normalizeGenre,
} from './artists';

export const songPool = new Map<string, Song>(); // id -> Song
export const loadedArtistQueries = new Set<string>();

export function ensureCatalogLoaded(): void {
  if (songPool.size > 0) return;
  try {
    loadCustomArtists();
    const cachedSongs = dbService.getAllSongs();
    for (const s of cachedSongs) {
      songPool.set(s.id, s);
    }
    const modeStr = isDbLocal()
      ? 'Offline SQLite Mode (DB_LOCAL=true)'
      : isSupabaseConfigured()
      ? 'Supabase PostgreSQL Mode'
      : 'Local SQLite Fallback (No Supabase keys)';
    console.log(`[BeatDrop] Loaded ${cachedSongs.length} songs from database. Engine mode: ${modeStr}`);
  } catch (err) {
    console.warn('[BeatDrop] Could not preload songs from database:', (err as Error).message);
  }
}

interface ItunesRawTrack {
  trackId?: number;
  artistId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackViewUrl?: string;
}

// In-memory cache for iTunes search to prevent HTTP 429 bans (2 hours TTL, bounded)
const itunesSearchCache = new Map<string, { expiresAt: number; data: Song[] }>();
const ITUNES_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ITUNES_CACHE_SIZE = 500;

export async function fetchItunesSongs(
  term: string,
  country: 'TH' | 'US',
  category: 'thai' | 'international',
  limit = 20,
  overrideGenre?: string,
  byArtist = false
): Promise<Song[]> {
  const cacheKey = `${term.toLowerCase().trim()}|${country}|${category}|${limit}|${byArtist}|${overrideGenre || ''}`;
  
  // 1. L1 In-Memory Cache (0ms instant response)
  const cached = itunesSearchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // 2. L2 Upstash Redis Distributed Cache (cross-container/serverless)
  if (isRedisConfigured && redis) {
    try {
      const redisCached = await redis.get<Song[]>(`itunes:${cacheKey}`);
      if (redisCached && Array.isArray(redisCached) && redisCached.length > 0) {
        itunesSearchCache.set(cacheKey, { expiresAt: Date.now() + ITUNES_CACHE_TTL_MS, data: redisCached });
        return redisCached;
      }
    } catch {}
  }

  try {
    const attrParam = byArtist ? '&attribute=artistTerm' : '';
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=song${attrParam}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItunesRawTrack[] };
    const results = data.results || [];

    const mappedSongs: Song[] = results
      .filter(
        (t): t is Required<Pick<ItunesRawTrack, 'trackId' | 'trackName' | 'artistName' | 'previewUrl'>> & ItunesRawTrack =>
          Boolean(t.trackId && t.trackName && t.artistName && t.previewUrl)
      )
      .filter((t) => !isJunkTrack(t.trackName, t.collectionName, t.artistName))
      .map((t, index) => {
        const year = t.releaseDate ? new Date(t.releaseDate).getFullYear() : 2020;
        const artworkHiRes = t.artworkUrl100
          ? t.artworkUrl100.replace('100x100bb', '600x600bb')
          : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';

        let resolvedCategory = category;
        if (country === 'TH') {
          const knownIntl = CURATED_ARTISTS.find(
            (a) => a.category === 'international' && checkArtistStrictMatch(t.artistName!, a.name)
          );
          if (knownIntl) {
            resolvedCategory = 'international';
          }
        }

        return {
          id: String(t.trackId),
          title: t.trackName,
          artistId: t.artistId ? String(t.artistId) : undefined,
          artistName: t.artistName,
          albumName: t.collectionName || 'Single',
          releaseYear: Number.isFinite(year) ? year : 2020,
          releaseDate: t.releaseDate,
          genre: normalizeGenre(t.primaryGenreName || '', resolvedCategory, overrideGenre),
          category: resolvedCategory,
          previewUrl: t.previewUrl,
          artworkUrl: artworkHiRes,
          trackViewUrl: t.trackViewUrl,
          popularityScore: Math.max(10, 100 - index * 3),
        };
      });

    if (itunesSearchCache.size >= MAX_ITUNES_CACHE_SIZE) {
      const oldestKey = itunesSearchCache.keys().next().value;
      if (oldestKey) itunesSearchCache.delete(oldestKey);
    }
    itunesSearchCache.set(cacheKey, { expiresAt: Date.now() + ITUNES_CACHE_TTL_MS, data: mappedSongs });

    if (isRedisConfigured && redis) {
      redis.set(`itunes:${cacheKey}`, mappedSongs, { ex: 7200 }).catch(() => {});
    }

    return mappedSongs;
  } catch (err) {
    console.error(`iTunes fetch error for "${term}":`, (err as Error).message);
    return [];
  }
}

export async function fetchDeezerSongs(
  term: string,
  category: 'thai' | 'international',
  limit = 15,
  overrideGenre?: string
): Promise<Song[]> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<any> };
    return (data.data || [])
      .filter((t) => t.id && t.title && t.preview && t.artist?.name)
      .map((t, idx) => ({
        id: `dz_${t.id}`,
        title: t.title,
        artistName: t.artist.name,
        albumName: t.album?.title || 'Single',
        releaseYear: 2022,
        genre: overrideGenre || (category === 'thai' ? 'T-Pop' : 'Pop'),
        category,
        previewUrl: t.preview,
        artworkUrl: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || '',
        popularityScore: Math.max(10, 100 - idx * 4),
      }));
  } catch {
    return [];
  }
}

export async function ingestArtistSongs(artist: Artist, limit = 200): Promise<number> {
  const key = `${artist.category}:${artist.name.toLowerCase()}`;
  const country = artist.category === 'thai' ? 'TH' : 'US';
  let tracks = await fetchItunesSongs(artist.name, country, artist.category, limit, artist.mainGenre, true);

  if (tracks.length < limit) {
    const fallbackTracks = await fetchItunesSongs(artist.name, country, artist.category, limit, artist.mainGenre, false);
    for (const fb of fallbackTracks) {
      if (!tracks.some((t) => t.id === fb.id)) {
        tracks.push(fb);
      }
    }
  }

  if (tracks.length === 0) {
    tracks = await fetchDeezerSongs(artist.name, artist.category, limit, artist.mainGenre);
  }

  const matchingTracks = tracks.filter(
    (t) =>
      checkArtistStrictMatch(t.artistName, artist.name, undefined, undefined, t.title) &&
      !isJunkTrack(t.title, t.albumName, t.artistName)
  );

  const finalTracks = matchingTracks.slice(0, limit);
  for (const song of finalTracks) {
    songPool.set(song.id, song);
  }
  dbService.saveSongs(finalTracks);

  if (finalTracks.length > 0 && !artist.avatarUrl) {
    artist.avatarUrl = finalTracks[0].artworkUrl;
  }
  artist.trackCount = Array.from(songPool.values()).filter(
    (s) =>
      checkArtistStrictMatch(s.artistName, artist.name, undefined, undefined, s.title) &&
      !isJunkTrack(s.title, s.albumName, s.artistName)
  ).length;

  dbService.updateArtistTrackCount(artist.name, artist.trackCount || 0);
  loadedArtistQueries.add(key);
  return finalTracks.length;
}

export async function warmupInitialCatalog(): Promise<void> {
  loadCustomArtists();

  const cachedSongs = dbService.getAllSongs();
  const allArtists = getAllArtists();
  for (const s of cachedSongs) {
    const isLibrarySong = allArtists.some((a) =>
      checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title)
    );
    if (isLibrarySong && !isJunkTrack(s.title, s.albumName, s.artistName)) {
      songPool.set(s.id, s);
    }
  }
  console.log(`[SQLite] Loaded ${cachedSongs.length} persistent songs from SQLite database.`);
  console.log(`[Server] Warming up song catalog for ${allArtists.length} artists...`);

  const batchSize = 8;
  for (let i = 0; i < allArtists.length; i += batchSize) {
    const batch = allArtists.slice(i, i + batchSize);
    await Promise.all(batch.map((artist) => ingestArtistSongs(artist, 40)));
  }

  console.log(`[Server] Warmup complete! Total songs in pool: ${songPool.size} (DB total: ${dbService.countSongs()})`);
}

