import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { Artist, CategoryType, Song } from '../../shared/types';
import { dbService } from '../db';
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

export async function handleGetArtists(req: Request, res: Response): Promise<void> {
  const category = (req.query.category as CategoryType) || 'all';
  const q = ((req.query.q as string) || '').trim();
  const discover = req.query.discover === 'true';

  let list = getAllArtists(songPool);
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

    for (const sc of searchCountries) {
      const remoteSongs = await fetchItunesSongs(q, sc.country, sc.cat, 20);
      const remoteArtistMap = new Map<string, { artist: Artist; songs: Song[] }>();

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

      for (const { artist, songs } of remoteArtistMap.values()) {
        const known = getAllArtists(songPool).find(
          (k) => normalizeText(k.name) === normalizeText(artist.name)
        );
        const detectedCat = known ? known.category : detectCategory(artist.name, songs, sc.cat);
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
      (a) => normalizeText(a.name) === normalizeText(cleanName)
    );

    const newArtist: Artist = existing || {
      id: `custom-${Date.now()}`,
      name: cleanName,
      category: validCat,
      mainGenre: mainGenre || (validCat === 'thai' ? 'T-Pop' : 'Pop'),
      avatarUrl: avatarUrl || '',
      isCustom: true,
    };

    await ingestArtistSongs(newArtist, 200);

    if (!existing) {
      addCustomArtist(newArtist);
    }

    const enriched =
      getAllArtists(songPool).find((a) => normalizeText(a.name) === normalizeText(cleanName)) ||
      newArtist;

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
      (a) => (id && a.id === id) || (name && normalizeText(a.name) === normalizeText(name))
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

    const previousCount = target.trackCount || 0;
    const fetched = await ingestArtistSongs(target, 200);

    if (!existing) {
      addCustomArtist(target);
    }

    const enriched =
      getAllArtists(songPool).find((a) => normalizeText(a.name) === normalizeText(cleanName)) ||
      target;
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

