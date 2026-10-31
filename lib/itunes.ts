/**
 * BeatDrop — lib/itunes.ts
 * Searches and fetches up to 200 songs (limit=200) per artist from iTunes Search & Lookup API,
 * with timeout, HTTP 429/403 rate-limit retry, and chunked Supabase / Local DB ingestion.
 */

import type { Artist, CategoryType, Song } from '../shared/types';
import { isSupabaseConfigured, supabaseAdmin } from './supabase';

export interface ItunesTrackItem {
  wrapperType?: string;
  kind?: string;
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

const ITUNES_FETCH_TIMEOUT_MS = 4500;
const VERCEL_SAFE_BUDGET_MS = 7500;
const CHUNK_SIZE = 50;

export function hasThaiScript(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\.?|ft\.?/gi, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanTrackTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\((feat\.?|ft\.?|ร่วมกับ|เพลงประกอบ).*?\)/gi, '')
    .replace(/\s*\[(feat\.?|ft\.?|official|ost).*?\]/gi, '')
    .trim();
}

export function mapGenreTag(rawGenre?: string, category?: CategoryType): string {
  const g = (rawGenre || '').toLowerCase();
  if (g.includes('hip-hop') || g.includes('rap')) return 'Hip-Hop';
  if (g.includes('r&b') || g.includes('soul')) return 'R&B';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'Rock';
  if (g.includes('alternative') || g.includes('indie')) return 'Indie';
  if (g.includes('electronic') || g.includes('dance') || g.includes('house') || g.includes('edm')) return 'EDM';
  if (g.includes('country') || g.includes('ลูกทุ่ง') || g.includes('เพื่อชีวิต')) return 'LukThung';
  if (g.includes('soundtrack')) return 'Soundtrack';
  if (g.includes('t-pop') || g.includes('thai pop')) return 'T-Pop';
  if (g.includes('k-pop')) return 'K-Pop';
  if (g.includes('pop')) return category === 'thai' ? 'T-Pop' : 'Pop';
  return category === 'thai' ? 'T-Pop' : 'Pop';
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchItunesWithRetry(
  url: string,
  retries = 1
): Promise<{ results?: ItunesTrackItem[]; rateLimited?: boolean }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BeatDrop/2.0 (Next.js App Router; +https://vercel.com)',
        },
        signal: AbortSignal.timeout(ITUNES_FETCH_TIMEOUT_MS),
      });

      if (response.status === 429 || response.status === 403) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        return { results: [], rateLimited: true };
      }

      if (!response.ok) return { results: [] };
      const data = (await response.json()) as { results?: ItunesTrackItem[] };
      return { results: data.results || [] };
    } catch {
      if (attempt >= retries) return { results: [] };
    }
  }
  return { results: [] };
}

export async function fetchArtistSongsUpTo200(
  artistQuery: string,
  preferredCategory?: CategoryType
): Promise<{ songs: Song[]; rateLimited: boolean }> {
  const autoCategory: CategoryType =
    preferredCategory && preferredCategory !== 'all'
      ? preferredCategory
      : hasThaiScript(artistQuery)
      ? 'thai'
      : 'international';

  const countries = autoCategory === 'thai' ? ['TH', 'US'] : ['US', 'TH'];
  const collected = new Map<string, Song>();
  const normQuery = normalizeText(artistQuery);
  let rateLimited = false;

  for (const country of countries) {
    if (collected.size >= 200) break;

    const artistSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      artistQuery
    )}&country=${country}&media=music&entity=musicArtist&limit=5`;
    const artistRes = await fetchItunesWithRetry(artistSearchUrl);
    if (artistRes.rateLimited) rateLimited = true;

    let resolvedArtistId: number | null = null;
    for (const a of artistRes.results || []) {
      const aName = String(a.artistName || '');
      const normA = normalizeText(aName);
      if (normA && (normA === normQuery || normA.includes(normQuery) || normQuery.includes(normA))) {
        resolvedArtistId = Number(a.artistId) || null;
        break;
      }
    }

    const rawTracks: ItunesTrackItem[] = [];

    if (resolvedArtistId) {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&country=${country}&limit=200`;
      const lookupRes = await fetchItunesWithRetry(lookupUrl);
      if (lookupRes.rateLimited) rateLimited = true;
      for (const item of lookupRes.results || []) {
        if (item.wrapperType === 'track' || item.kind === 'song') {
          rawTracks.push(item);
        }
      }
    }

    if (rawTracks.length < 200) {
      const songSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        artistQuery
      )}&country=${country}&media=music&entity=song&limit=200`;
      const songRes = await fetchItunesWithRetry(songSearchUrl);
      if (songRes.rateLimited) rateLimited = true;
      rawTracks.push(...(songRes.results || []));
    }

    rawTracks.forEach((item, idx) => {
      if (collected.size >= 200) return;
      if (!item.trackId || !item.trackName || !item.artistName || !item.previewUrl) return;

      const normArtist = normalizeText(item.artistName);
      const isArtistMatch =
        (resolvedArtistId && item.artistId === resolvedArtistId) ||
        normArtist.includes(normQuery) ||
        normQuery.includes(normArtist);
      if (!isArtistMatch) return;

      const cleanedTitle = cleanTrackTitle(item.trackName);
      if (!cleanedTitle) return;

      const dedupeKey = `${normalizeText(cleanedTitle)}__${normArtist}`;
      if (collected.has(dedupeKey)) return;

      const isThai =
        autoCategory === 'thai' ||
        hasThaiScript(item.trackName) ||
        hasThaiScript(item.artistName) ||
        (item.primaryGenreName || '').toLowerCase().includes('thai');

      const finalCategory: CategoryType = isThai ? 'thai' : 'international';
      const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2020;

      collected.set(dedupeKey, {
        id: String(item.trackId),
        title: cleanedTitle,
        artistName: item.artistName.trim(),
        albumName: (item.collectionName || 'Single').trim(),
        releaseYear: Number.isNaN(releaseYear) ? 2020 : releaseYear,
        genre: mapGenreTag(item.primaryGenreName, finalCategory),
        category: finalCategory,
        previewUrl: item.previewUrl,
        artworkUrl: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        trackViewUrl: item.trackViewUrl || '',
        popularityScore: Math.max(10, 100 - Math.floor(idx / 2)),
      });
    });
  }

  return { songs: Array.from(collected.values()).slice(0, 200), rateLimited };
}

export async function syncArtistSongs(
  query: string,
  preferredCategory?: CategoryType
): Promise<{
  status: number;
  body: {
    code: number;
    message: string;
    data?: {
      artist: Artist;
      addedCount: number;
      totalFetched: number;
      backgroundProcessing?: boolean;
    };
  };
}> {
  const startedAt = Date.now();
  const { songs: fetchedSongs, rateLimited } = await fetchArtistSongsUpTo200(query, preferredCategory);

  if (fetchedSongs.length === 0) {
    if (rateLimited) {
      return {
        status: 429,
        body: {
          code: -429,
          message: 'iTunes API มีผู้ใช้งานหนาแน่น (Rate Limit) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        },
      };
    }
    return {
      status: 404,
      body: {
        code: -1,
        message: `ไม่พบเพลงที่มีตัวอย่างเสียงของ "${query}" บน iTunes`,
      },
    };
  }

  const primarySample = fetchedSongs[0];
  const canonicalName = primarySample.artistName;
  const artistSlug = `artist_${normalizeText(canonicalName).replace(/\s+/g, '_')}`;

  if (isSupabaseConfigured()) {
    const existingArtist = await supabaseAdmin.findArtist(canonicalName);
    const previousCount = existingArtist?.trackCount || 0;

    const initialArtist: Artist = {
      id: existingArtist?.id || artistSlug,
      name: canonicalName,
      category: primarySample.category,
      mainGenre: primarySample.genre,
      avatarUrl: primarySample.artworkUrl,
      isCustom: true,
      trackCount: Math.max(previousCount, fetchedSongs.length),
    };
    await supabaseAdmin.upsertArtist(initialArtist);

    const songsWithArtist = fetchedSongs.map((s) => ({ ...s, artistId: initialArtist.id }));
    const chunks = chunkArray(songsWithArtist, CHUNK_SIZE);
    let processedChunks = 0;

    for (const chunk of chunks) {
      await supabaseAdmin.upsertSongs(chunk, CHUNK_SIZE);
      processedChunks++;

      if (Date.now() - startedAt > VERCEL_SAFE_BUDGET_MS && processedChunks < chunks.length) {
        const remainingChunks = chunks.slice(processedChunks);
        void (async () => {
          try {
            for (const rem of remainingChunks) {
              await supabaseAdmin.upsertSongs(rem, CHUNK_SIZE);
            }
            await supabaseAdmin.refreshArtistTrackCount(canonicalName, initialArtist.id);
          } catch (bgErr) {
            console.error('[Sync Background Ingestion Error]', bgErr);
          }
        })();

        const estimatedTotal = Math.max(previousCount, fetchedSongs.length);
        return {
          status: 202,
          body: {
            code: 0,
            message: 'กำลังซิงค์เพลงที่เหลือในพื้นหลัง (Background Ingestion)',
            data: {
              artist: { ...initialArtist, trackCount: estimatedTotal },
              addedCount: Math.max(0, estimatedTotal - previousCount),
              totalFetched: fetchedSongs.length,
              backgroundProcessing: true,
            },
          },
        };
      }
    }

    const finalTrackCount = await supabaseAdmin.refreshArtistTrackCount(canonicalName, initialArtist.id);
    const addedCount = Math.max(0, finalTrackCount - previousCount);

    return {
      status: 200,
      body: {
        code: 0,
        message: 'ok',
        data: {
          artist: { ...initialArtist, trackCount: finalTrackCount },
          addedCount,
          totalFetched: fetchedSongs.length,
          backgroundProcessing: false,
        },
      },
    };
  }

  // Fallback to local SQLite/Express DB service when Supabase env vars are not set
  const { dbService } = await import('./db');
  const existingTracks = dbService.searchSongs(canonicalName, { artist: canonicalName, limit: 250 }).length;
  dbService.saveSongs(fetchedSongs);
  const totalArtistTracks =
    dbService.searchSongs(canonicalName, { artist: canonicalName, limit: 250 }).length || fetchedSongs.length;

  const customArtist: Artist = {
    id: artistSlug,
    name: canonicalName,
    category: primarySample.category,
    mainGenre: primarySample.genre,
    avatarUrl: primarySample.artworkUrl,
    isCustom: true,
    trackCount: totalArtistTracks,
  };
  dbService.saveCustomArtist(customArtist);

  return {
    status: 200,
    body: {
      code: 0,
      message: 'ok',
      data: {
        artist: customArtist,
        addedCount: Math.max(0, totalArtistTracks - existingTracks),
        totalFetched: fetchedSongs.length,
      },
    },
  };
}

