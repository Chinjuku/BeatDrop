import fs from 'node:fs';
import path from 'node:path';
import { dbService } from '../lib/db';
import {
  hasThaiScript,
  isKnownThaiArtistName,
  isThaiGenreTag,
  mapGenreTag,
  resolveArtistMainGenre,
  checkArtistStrictMatch,
  normalizeText,
  ItunesTrackItem,
} from '../lib/itunes';
import { CURATED_ARTISTS } from '../lib/engine/artists';
import { isSupabaseConfigured, supabaseAdmin } from '../lib/supabase';
import type { Artist, Song } from '../shared/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CUSTOM_ARTISTS_FILE = path.join(DATA_DIR, 'custom-artists.json');

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function lookupItunesTracksByIds(ids: string[]): Promise<Map<string, ItunesTrackItem>> {
  const map = new Map<string, ItunesTrackItem>();
  const numericIds = ids.filter((id) => /^\d+$/.test(id));
  const batches = chunk(numericIds, 150);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    for (const country of ['TH', 'US']) {
      const missing = batch.filter((id) => !map.has(id));
      if (missing.length === 0) break;
      try {
        const url = `https://itunes.apple.com/lookup?id=${missing.join(',')}&country=${country}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = (await res.json()) as { results?: ItunesTrackItem[] };
          for (const item of data.results || []) {
            if (item.trackId) {
              map.set(String(item.trackId), item);
            }
          }
        }
      } catch (err) {
        console.warn(`[iTunes Lookup] Batch ${i + 1} (${country}) warning:`, (err as Error).message);
      }
    }
    // Gentle pause between batches to respect iTunes rate limit
    await new Promise((r) => setTimeout(r, 120));
  }

  return map;
}

function detectTrueCategoryForArtist(artistName: string, tracks: Song[], itunesMap: Map<string, ItunesTrackItem>): 'thai' | 'international' {
  const curated = CURATED_ARTISTS.find((c) => checkArtistStrictMatch(artistName, c.name));
  if (curated) return curated.category;
  if (isKnownThaiArtistName(artistName)) return 'thai';

  let thaiEvidence = 0;
  for (const t of tracks) {
    const raw = itunesMap.get(String(t.id));
    if (
      hasThaiScript(t.title) ||
      hasThaiScript(t.artistName) ||
      hasThaiScript(t.albumName || '') ||
      isThaiGenreTag(raw?.primaryGenreName)
    ) {
      thaiEvidence++;
    }
  }
  if (tracks.length > 0 && thaiEvidence / tracks.length >= 0.1) {
    return 'thai';
  }
  return 'international';
}

async function main() {
  console.log('1. Loading all songs from SQLite & Supabase...');
  const localSongs = dbService.getAllSongs();
  const supaArtists = isSupabaseConfigured() ? await supabaseAdmin.getArtists() : [];
  const localCustomArtists = dbService.getCustomArtists();

  const allSongsMap = new Map<string, Song>();
  for (const s of localSongs) {
    allSongsMap.set(String(s.id), s);
  }

  if (isSupabaseConfigured()) {
    const artistNames = Array.from(
      new Set([
        ...CURATED_ARTISTS.map((a) => a.name),
        ...supaArtists.map((a) => a.name),
        ...localCustomArtists.map((a) => a.name),
      ])
    );
    for (const name of artistNames) {
      const supaSongs = await supabaseAdmin.findSongsByArtist(name, 250);
      for (const s of supaSongs) {
        if (!allSongsMap.has(String(s.id))) {
          allSongsMap.set(String(s.id), s);
        }
      }
    }
  }

  const allSongs = Array.from(allSongsMap.values());
  console.log(`   Total unique songs found: ${allSongs.length}`);

  console.log('2. Batch-querying iTunes Lookup API for official track genres...');
  const itunesMap = await lookupItunesTracksByIds(allSongs.map((s) => String(s.id)));
  console.log(`   Matched ${itunesMap.size} / ${allSongs.length} tracks directly from iTunes Lookup API.`);

  // 3. Re-compute true category and iTunes genre for every song
  const updatedSongs: Song[] = [];
  let changedSongsCount = 0;

  for (const song of allSongs) {
    const raw = itunesMap.get(String(song.id));
    const curatedArtist = CURATED_ARTISTS.find((a) =>
      checkArtistStrictMatch(song.artistName, a.name, undefined, undefined, song.title)
    );

    const isTrackThai =
      curatedArtist?.category === 'thai' ||
      (!curatedArtist &&
        (isKnownThaiArtistName(song.artistName) ||
          hasThaiScript(song.title) ||
          hasThaiScript(song.artistName) ||
          hasThaiScript(song.albumName || '') ||
          isThaiGenreTag(raw?.primaryGenreName)));

    const trueCategory: 'thai' | 'international' = isTrackThai ? 'thai' : 'international';
    const trueGenre = raw?.primaryGenreName
      ? mapGenreTag(raw.primaryGenreName, trueCategory)
      : mapGenreTag(song.genre, trueCategory);

    const hiResArtwork =
      raw?.artworkUrl100?.replace('100x100bb', '600x600bb') || song.artworkUrl;

    if (song.genre !== trueGenre || song.category !== trueCategory) {
      changedSongsCount++;
    }

    updatedSongs.push({
      ...song,
      category: trueCategory,
      genre: trueGenre,
      artworkUrl: hiResArtwork,
    });
  }

  console.log(`3. Updating ${updatedSongs.length} songs (${changedSongsCount} genre/category corrections) in SQLite & Supabase...`);
  dbService.saveSongs(updatedSongs);
  if (isSupabaseConfigured()) {
    await supabaseAdmin.upsertSongs(updatedSongs, 100);
  }

  // 4. Re-compute all artists' mainGenre, category, avatarUrl, and trackCount from their real iTunes songs
  const artistPool = new Map<string, Artist>();
  for (const a of [...CURATED_ARTISTS, ...localCustomArtists, ...supaArtists]) {
    const key = normalizeText(a.name);
    if (!key) continue;
    const prev = artistPool.get(key);
    const validAvatar =
      a.avatarUrl && (a.avatarUrl.startsWith('http://') || a.avatarUrl.startsWith('https://'))
        ? a.avatarUrl
        : prev?.avatarUrl || '';
    artistPool.set(key, {
      ...(prev || a),
      ...a,
      avatarUrl: validAvatar,
    });
  }

  const updatedArtists: Artist[] = [];
  for (const artist of artistPool.values()) {
    const artistTracks = updatedSongs.filter((s) =>
      checkArtistStrictMatch(s.artistName, artist.name, undefined, undefined, s.title)
    );
    const curated = CURATED_ARTISTS.find((c) => checkArtistStrictMatch(artist.name, c.name));
    const trueCat = detectTrueCategoryForArtist(artist.name, artistTracks, itunesMap);
    const trueMainGenre =
      artistTracks.length > 0
        ? resolveArtistMainGenre(artistTracks, trueCat, curated?.mainGenre)
        : curated?.mainGenre || mapGenreTag(artist.mainGenre, trueCat);

    const bestAvatar =
      artist.avatarUrl ||
      artistTracks.find((t) => t.artworkUrl?.startsWith('http'))?.artworkUrl ||
      '';

    const fixedArtist: Artist = {
      ...artist,
      category: trueCat,
      mainGenre: trueMainGenre,
      avatarUrl: bestAvatar,
      trackCount: Math.max(artist.trackCount || 0, artistTracks.length),
    };
    updatedArtists.push(fixedArtist);
    dbService.saveCustomArtist(fixedArtist);
    if (isSupabaseConfigured()) {
      await supabaseAdmin.upsertArtist(fixedArtist);
    }
  }

  // Update data/custom-artists.json
  const customOnly = updatedArtists.filter(
    (a) => !CURATED_ARTISTS.some((c) => normalizeText(c.name) === normalizeText(a.name))
  );
  fs.writeFileSync(CUSTOM_ARTISTS_FILE, JSON.stringify(customOnly, null, 2), 'utf-8');

  console.log(`4. Updated ${updatedArtists.length} artists across SQLite, JSON, and Supabase!`);
  for (const a of updatedArtists.filter((x) =>
    ['lisa', 'katy perry', 'bodyslam', 'taitosmith', 'urboytj', 'big ass', 'carabao', 'tilly birds'].includes(
      normalizeText(x.name)
    )
  )) {
    console.log(`   -> ${a.name}: category=${a.category}, mainGenre=${a.mainGenre}, tracks=${a.trackCount}, avatar=${a.avatarUrl ? 'OK' : 'MISSING'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

