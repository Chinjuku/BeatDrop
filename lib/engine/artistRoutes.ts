import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { Artist, CategoryType, Song } from '../../shared/types';
import { dbService } from '../db';
import { checkArtistStrictMatch } from '../itunes';
import { isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { songPool, ingestArtistSongs, fetchItunesSongs } from './songPool';
import {
  getAllArtists,
  addCustomArtist,
  deleteCustomArtist,
  extractSoloArtistNames,
  detectCategory,
  normalizeGenre,
  normalizeText,
} from './artists';

let cachedSupabaseArtists: Artist[] = [];
let lastSupabaseFetchTime = 0;
const SUPABASE_ARTISTS_TTL_MS = 60_000;

export async function handleGetArtists(req: Request, res: Response): Promise<void> {
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
        addCustomArtist(resolvedSa);
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

  if (q.length >= 2 && (discover || list.length < 3)) {
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

export async function handleAddArtist(req: Request, res: Response): Promise<void> {
  try {
    const { name, category = 'thai', mainGenre = 'Pop', avatarUrl = '' } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ code: -1, message: 'Artist name is required' });
      return;
    }

    const rawName = name.trim();
    const soloNames = extractSoloArtistNames(rawName);
    const cleanName = soloNames.length > 0 ? soloNames[0] : rawName;
    const validCat: 'thai' | 'international' = category === 'international' ? 'international' : 'thai';

    const existing = getAllArtists(songPool).find(
      (a) => checkArtistStrictMatch(a.name, cleanName) || normalizeText(a.name) === normalizeText(cleanName)
    );

    const newArtist: Artist = existing || {
      id: `custom-${Date.now()}`,
      name: cleanName,
      category: validCat,
      mainGenre: mainGenre || (validCat === 'thai' ? 'T-Pop' : 'Pop'),
      avatarUrl: avatarUrl || '',
      isCustom: true,
    };

    const configuredKey = process.env.ADMIN_API_KEY;
    const providedKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const isAdmin = Boolean(configuredKey && providedKey === configuredKey);
    const maxLimit = isAdmin ? 200 : 50;

    await ingestArtistSongs(newArtist, maxLimit);

    if (!existing) {
      addCustomArtist(newArtist);
    }

    const enriched =
      getAllArtists(songPool).find(
        (a) => checkArtistStrictMatch(a.name, cleanName) || normalizeText(a.name) === normalizeText(cleanName)
      ) || newArtist;

    res.json({
      code: 0,
      message: 'ok',
      data: enriched,
    });
  } catch (err) {
    res.status(500).json({ code: -1, message: (err as Error).message });
  }
}

export async function handleSyncArtist(req: Request, res: Response): Promise<void> {
  try {
    const { name, id, category, mainGenre, avatarUrl } = req.body || {};
    const all = getAllArtists(songPool);
    const existing = all.find(
      (a) =>
        (id && a.id === id) ||
        (name && (checkArtistStrictMatch(a.name, name) || normalizeText(a.name) === normalizeText(name)))
    );

    const rawName = String(name || existing?.name || '').trim();
    if (!rawName) {
      res.status(400).json({ code: 400, message: 'Artist name is required' });
      return;
    }

    const soloNames = extractSoloArtistNames(rawName);
    const cleanName = existing ? existing.name : soloNames.length > 0 ? soloNames[0] : rawName;

    const validCat: 'thai' | 'international' =
      (existing?.category || category) === 'international' ? 'international' : 'thai';

    const target: Artist = existing || {
      id: `custom-${Date.now()}`,
      name: cleanName,
      category: validCat,
      mainGenre: mainGenre || (validCat === 'thai' ? 'T-Pop' : 'Pop'),
      avatarUrl: avatarUrl || '',
      isCustom: true,
      trackCount: 0,
    };

    const configuredKey = process.env.ADMIN_API_KEY;
    const providedKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const isAdmin = Boolean(configuredKey && providedKey === configuredKey);
    const maxLimit = isAdmin ? 200 : 50;

    const previousCount = target.trackCount || 0;
    const fetched = await ingestArtistSongs(target, maxLimit);

    if (!existing) {
      addCustomArtist(target);
    }

    const enriched =
      getAllArtists(songPool).find(
        (a) => checkArtistStrictMatch(a.name, cleanName) || normalizeText(a.name) === normalizeText(cleanName)
      ) || target;
    const newCount = enriched.trackCount || previousCount;
    const added = Math.max(0, newCount - previousCount);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        ...enriched,
        artist: enriched,
        previousCount,
        newCount,
        added,
        fetched,
      },
    });
  } catch (err) {
    res.status(500).json({ code: -1, message: (err as Error).message });
  }
}

export function handleDeleteArtist(req: Request, res: Response): void {
  const id = String(req.params.id);
  deleteCustomArtist(id);
  res.json({ code: 0, message: 'ok', data: { removedId: id } });
}

