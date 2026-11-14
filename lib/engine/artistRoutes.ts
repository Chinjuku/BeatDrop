import type { ApiRequest, ApiResponse } from '../http/api';
import crypto from 'node:crypto';
import { Artist, CategoryType, Song } from '../../shared/types';
import { isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { songPool, fetchItunesSongs } from './songPool';
import {
  getAllArtists,
  deleteCustomArtist,
  extractSoloArtistNames,
  detectCategory,
  normalizeGenre,
  normalizeText,
  invalidateAllArtistsCache,
  syncCustomArtistsInMemory,
} from './artists';

let cachedSupabaseArtists: Artist[] = [];
let lastSupabaseFetchTime = 0;
const SUPABASE_ARTISTS_TTL_MS = 60_000;

export function invalidateArtistsServerCache(upsertedArtist?: Artist): void {
  lastSupabaseFetchTime = 0;
  if (upsertedArtist) {
    const idx = cachedSupabaseArtists.findIndex(
      (a) => a.id === upsertedArtist.id || normalizeText(a.name) === normalizeText(upsertedArtist.name)
    );
    if (idx >= 0) {
      cachedSupabaseArtists[idx] = { ...cachedSupabaseArtists[idx], ...upsertedArtist };
    } else {
      cachedSupabaseArtists.push(upsertedArtist);
    }
  }
  invalidateAllArtistsCache();
}

export const invalidateSupabaseArtistsCache = invalidateArtistsServerCache;

export async function handleGetArtists(req: ApiRequest, res: ApiResponse): Promise<void> {
  const category = (req.query.category as CategoryType) || 'all';
  const q = ((req.query.q as string) || '').trim();
  const discover = req.query.discover === 'true';

  let list = getAllArtists(songPool);

  // When Supabase is configured (DB_LOCAL=false), pull artists with in-memory caching
  if (isSupabaseConfigured()) {
    const now = Date.now();
    if (now - lastSupabaseFetchTime > SUPABASE_ARTISTS_TTL_MS || cachedSupabaseArtists.length === 0) {
      try {
        const fetched = await supabaseAdmin.getArtists();
        if (fetched.length > 0) {
          cachedSupabaseArtists = fetched;
          lastSupabaseFetchTime = now;
        }
      } catch (err) {
        console.warn('[handleGetArtists] Supabase getArtists error:', err);
      }
    }

    for (const sa of cachedSupabaseArtists) {
      const hasValidAvatar = Boolean(
        sa.avatarUrl &&
          (sa.avatarUrl.startsWith('http://') ||
            sa.avatarUrl.startsWith('https://') ||
            sa.avatarUrl.startsWith('/'))
      );
      const resolvedSa: Artist = {
        ...sa,
        avatarUrl: hasValidAvatar ? sa.avatarUrl : '',
      };
      const idx = list.findIndex(
        (a) => normalizeText(a.name) === normalizeText(resolvedSa.name) || a.id === resolvedSa.id
      );
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          ...resolvedSa,
          avatarUrl: resolvedSa.avatarUrl || list[idx].avatarUrl,
          trackCount: Math.max(list[idx].trackCount || 0, resolvedSa.trackCount || 0),
        };
      } else {
        list.push(resolvedSa);
        syncCustomArtistsInMemory([resolvedSa]);
      }
    }
  }

  if (category === 'thai' || category === 'international') {
    list = list.filter((a) => a.category === category);
  }

  if (q) {
    const qNorm = normalizeText(q);
    const qNoVowels = qNorm.replace(/[aeiou]/g, '');
    list = list.filter((a) => {
      const aNorm = normalizeText(a.name);
      if (aNorm.includes(qNorm) || a.name.toLowerCase().includes(q.toLowerCase())) return true;
      if (a.mainGenre.toLowerCase().includes(q.toLowerCase())) return true;
      const aNoVowels = aNorm.replace(/[aeiou]/g, '');
      if (qNoVowels.length >= 3 && (aNoVowels.includes(qNoVowels) || qNoVowels.includes(aNoVowels))) {
        return true;
      }
      return false;
    });
  }

  if (q.length >= 2 && (discover || list.length === 0)) {
    const searchCountries: Array<{ country: 'TH' | 'US'; cat: 'thai' | 'international' }> =
      category === 'thai'
        ? [{ country: 'TH', cat: 'thai' }]
        : category === 'international'
          ? [{ country: 'US', cat: 'international' }]
          : [
              { country: 'TH', cat: 'thai' },
              { country: 'US', cat: 'international' },
            ];

    // Fetch countries in parallel instead of sequential awaits
    const remoteSongsGroups = await Promise.all(
      searchCountries.map(async (sc) => {
        const songs = await fetchItunesSongs(q, sc.country, sc.cat, 15);
        return { sc, songs };
      })
    );

    const remoteArtistMap = new Map<string, { artist: Artist; songs: Song[] }>();

    for (const { sc, songs: remoteSongs } of remoteSongsGroups) {
      for (const s of remoteSongs) {
        const soloNames = extractSoloArtistNames(s.artistName);
        for (const soloName of soloNames) {
          const key = normalizeText(soloName);
          if (!remoteArtistMap.has(key)) {
            remoteArtistMap.set(key, {
              artist: {
                id: `discovered-${crypto.randomUUID().slice(0, 8)}`,
                name: soloName,
                category: sc.cat,
                mainGenre: s.genre,
                avatarUrl: s.artworkUrl,
                isCustom: false,
                trackCount: 1,
              },
              songs: [s],
            });
          } else {
            remoteArtistMap.get(key)!.songs.push(s);
            remoteArtistMap.get(key)!.artist.trackCount = remoteArtistMap.get(key)!.songs.length;
          }
        }
      }
    }

    for (const { artist, songs } of remoteArtistMap.values()) {
      // Use existing list in memory instead of re-executing getAllArtists queries
      const known = list.find(
        (k) => normalizeText(k.name) === normalizeText(artist.name)
      );
      const detectedCat = known ? known.category : detectCategory(artist.name, songs, artist.category);
      const resolvedMainGenre = known ? known.mainGenre : normalizeGenre(artist.mainGenre, detectedCat);

      if (category !== 'all' && detectedCat !== category) {
        continue;
      }

      const resolvedArtist: Artist = {
        ...artist,
        category: detectedCat,
        mainGenre: resolvedMainGenre,
      };

      if (!list.some((existing) => normalizeText(existing.name) === normalizeText(resolvedArtist.name))) {
        list.push(resolvedArtist);
      }
    }
  }

  res.json({
    code: 0,
    message: 'ok',
    data: list,
  });
}

export function handleDeleteArtist(req: ApiRequest, res: ApiResponse): void {
  const id = String(req.params.id);
  deleteCustomArtist(id);
  res.json({ code: 0, message: 'ok', data: { removedId: id } });
}

