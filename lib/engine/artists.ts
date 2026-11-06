import fs from 'node:fs';
import path from 'node:path';
import { Artist, CategoryType, Song } from '../../shared/types';
import { dbService } from '../db';
import { checkArtistStrictMatch, isJunkTrack } from '../itunes';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CUSTOM_ARTISTS_FILE = path.join(DATA_DIR, 'custom-artists.json');

if (!process.env.VERCEL && !fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

export const CURATED_ARTISTS: Artist[] = [
  // Thai Artists
  { id: 'th-bodyslam', name: 'Bodyslam', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-tillybirds', name: 'Tilly Birds', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-threemandown', name: 'Three Man Down', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-cocktail', name: 'Cocktail', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-bowkylion', name: 'BOWKYLION', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-nonttanont', name: 'NONT TANONT', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-potato', name: 'Potato', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-slotmachine', name: 'Slot Machine', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-jeffsatur', name: 'Jeff Satur', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-milli', name: 'MILLI', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-tattoocolour', name: 'Tattoo Colour', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-polycat', name: 'Polycat', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-inkwaruntorn', name: 'Ink Waruntorn', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-palmy', name: 'PALMY', category: 'thai', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'th-4eve', name: '4EVE', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-billkin', name: 'Billkin', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-fellowfellow', name: 'Fellow Fellow', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-violette', name: 'Violette Wautier', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-illslick', name: 'Illslick', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-purpeech', name: 'PURPEECH', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-safeplanet', name: 'Safeplanet', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-carabao', name: 'Carabao', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-bigass', name: 'Big Ass', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-thetoys', name: 'THE TOYS', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-pun', name: 'PUN', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-gunner', name: 'GUNNER', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-stamp', name: 'Stamp', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-taitosmith', name: 'TaitosmitH', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },

  // International Artists
  { id: 'intl-queen', name: 'Queen', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-taylorswift', name: 'Taylor Swift', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-brunomars', name: 'Bruno Mars', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-coldplay', name: 'Coldplay', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-theweeknd', name: 'The Weeknd', category: 'international', mainGenre: 'R&B', avatarUrl: '' },
  { id: 'intl-edsheeran', name: 'Ed Sheeran', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-eminem', name: 'Eminem', category: 'international', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'intl-billieeilish', name: 'Billie Eilish', category: 'international', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'intl-arianagrande', name: 'Ariana Grande', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-michaeljackson', name: 'Michael Jackson', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-linkinpark', name: 'LINKIN PARK', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-dualipa', name: 'Dua Lipa', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-oliviarodrigo', name: 'Olivia Rodrigo', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-bts', name: 'BTS', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-blackpink', name: 'BLACKPINK', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-newjeans', name: 'NewJeans', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-arcticmonkeys', name: 'Arctic Monkeys', category: 'international', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'intl-sabrinacarpenter', name: 'Sabrina Carpenter', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-postmalone', name: 'Post Malone', category: 'international', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'intl-aviricii', name: 'Avicii', category: 'international', mainGenre: 'EDM', avatarUrl: '' },
  { id: 'artist_katy_perry', name: 'Katy Perry', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
];

export let customArtists: Artist[] = [];

let cachedAllArtists: Artist[] | null = null;
let lastAllArtistsTime = 0;
let lastAllArtistsPoolSize = -1;
const ALL_ARTISTS_CACHE_TTL = 60_000;
const normCache = new Map<string, string>();

export function invalidateAllArtistsCache(): void {
  cachedAllArtists = null;
  lastAllArtistsTime = 0;
  lastAllArtistsPoolSize = -1;
}

export function loadCustomArtists(): void {
  try {
    invalidateAllArtistsCache();
    const dbArtists = dbService.getCustomArtists();
    if (dbArtists.length > 0) {
      customArtists = dbArtists;
      return;
    }
    if (fs.existsSync(CUSTOM_ARTISTS_FILE)) {
      const raw = fs.readFileSync(CUSTOM_ARTISTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        customArtists = parsed;
        for (const a of customArtists) {
          dbService.saveCustomArtist(a);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load custom artists:', err);
  }
}

export function saveCustomArtists(): void {
  try {
    invalidateAllArtistsCache();
    fs.writeFileSync(CUSTOM_ARTISTS_FILE, JSON.stringify(customArtists, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save custom artists:', err);
  }
}

export function addCustomArtist(newArtist: Artist): void {
  const existingIdx = customArtists.findIndex(
    (a) => normalizeText(a.name) === normalizeText(newArtist.name) || a.id === newArtist.id
  );
  if (existingIdx >= 0) {
    customArtists[existingIdx] = {
      ...customArtists[existingIdx],
      ...newArtist,
      avatarUrl: newArtist.avatarUrl || customArtists[existingIdx].avatarUrl,
      trackCount: Math.max(customArtists[existingIdx].trackCount || 0, newArtist.trackCount || 0),
    };
  } else {
    customArtists.push(newArtist);
  }
  saveCustomArtists();
  dbService.saveCustomArtist(newArtist);
}

export function deleteCustomArtist(id: string): void {
  customArtists = customArtists.filter((a) => a.id !== id);
  saveCustomArtists();
  dbService.deleteCustomArtist(id);
}

export function syncCustomArtistsInMemory(incoming: Artist[]): void {
  for (const newArtist of incoming) {
    const existingIdx = customArtists.findIndex(
      (a) => normalizeText(a.name) === normalizeText(newArtist.name) || a.id === newArtist.id
    );
    if (existingIdx >= 0) {
      customArtists[existingIdx] = {
        ...customArtists[existingIdx],
        ...newArtist,
        avatarUrl: newArtist.avatarUrl || customArtists[existingIdx].avatarUrl,
        trackCount: Math.max(customArtists[existingIdx].trackCount || 0, newArtist.trackCount || 0),
      };
    } else {
      customArtists.push(newArtist);
    }
  }
}

export function normalizeText(str: string): string {
  if (!str) return '';
  const cached = normCache.get(str);
  if (cached !== undefined) return cached;
  const computed = str
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\..*|ft\..*/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (normCache.size < 15000) {
    normCache.set(str, computed);
  }
  return computed;
}

export function extractSoloArtistNames(rawName: string): string[] {
  return (rawName || '')
    .split(/[,&/]|\b(?:feat\.?|ft\.?|featuring|with|x|and|ร่วมกับ)\b/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^(the\s+band|music|records|soundtrack|orchestra)$/i.test(t));
}

export function detectCategory(
  name: string,
  tracks: Song[],
  fallback: 'thai' | 'international' = 'international'
): 'thai' | 'international' {
  const curated = CURATED_ARTISTS.find((a) => checkArtistStrictMatch(name, a.name));
  if (curated) return curated.category;

  const thaiCharRegex = /[\u0E00-\u0E7F]/;
  if (thaiCharRegex.test(name)) return 'thai';

  const thaiTrackCount = tracks.filter(
    (t) => thaiCharRegex.test(t.title) || thaiCharRegex.test(t.artistName)
  ).length;
  if (tracks.length > 0 && thaiTrackCount / tracks.length >= 0.25) {
    return 'thai';
  }

  if (tracks.length > 0 && thaiTrackCount === 0) {
    return 'international';
  }

  return fallback;
}

export function normalizeGenre(
  rawGenre: string,
  category: 'thai' | 'international',
  fallbackGenre?: string
): string {
  const g = (rawGenre || '').trim().toLowerCase();
  if (!g) {
    if (fallbackGenre && fallbackGenre !== 'any') return fallbackGenre;
    return category === 'thai' ? 'T-Pop' : 'Pop';
  }
  if (g.includes('k-pop') || g.includes('kpop')) return 'K-Pop';
  if (g.includes('hip-hop') || g.includes('hip hop') || g.includes('rap')) return 'Hip-Hop/Rap';
  if (g.includes('r&b') || g.includes('soul') || g.includes('funk')) return 'R&B';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'Rock';
  if (g.includes('alternative') || g.includes('indie')) return 'Indie';
  if (g.includes('dance') || g.includes('electronic') || g.includes('house') || g.includes('edm')) return 'EDM';
  if (g.includes('country') || g.includes('ลูกทุ่ง') || g.includes('เพื่อชีวิต') || g.includes('folk')) {
    return category === 'thai' ? 'LukThung' : 'Country';
  }
  if (g.includes('soundtrack') || g.includes('score') || g.includes('musical') || g.includes('anime')) return 'Soundtrack';
  if (g.includes('jazz') || g.includes('blues')) return 'Jazz';
  if (g.includes('j-pop') || g.includes('jpop')) return 'J-Pop';
  if (g.includes('t-pop') || g.includes('thai pop')) return 'T-Pop';
  if (g.includes('pop') || g.includes('singer/songwriter') || g.includes('vocal')) {
    return category === 'thai' ? 'T-Pop' : 'Pop';
  }
  if (fallbackGenre && fallbackGenre !== 'any') return fallbackGenre;
  return category === 'thai' ? 'T-Pop' : 'Pop';
}

export function computeMajorityGenre(
  tracks: Song[],
  category: 'thai' | 'international',
  artistRawGenre?: string
): string {
  const mappedArtistGenre = artistRawGenre ? normalizeGenre(artistRawGenre, category) : '';
  const counts = new Map<string, number>();

  for (const t of tracks) {
    const g = t.genre || normalizeGenre('', category);
    // Weight non-Soundtrack tracks higher so OST songs don't override a band's real genre
    const weight = g === 'Soundtrack' ? 0.35 : 1;
    counts.set(g, (counts.get(g) || 0) + weight);
  }

  // Give official iTunes artist primaryGenreName a strong tie-breaking / primary boost
  if (mappedArtistGenre && mappedArtistGenre !== 'Soundtrack') {
    const boost = mappedArtistGenre === 'Pop' || mappedArtistGenre === 'T-Pop' ? 2 : Math.max(3, tracks.length * 0.25);
    counts.set(mappedArtistGenre, (counts.get(mappedArtistGenre) || 0) + boost);
  }

  let bestGenre = mappedArtistGenre || (category === 'thai' ? 'T-Pop' : 'Pop');
  let bestScore = -1;
  for (const [genre, score] of counts.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genre;
    }
  }
  return bestGenre;
}

export function getAllArtists(songPool?: Map<string, Song>): Artist[] {
  const now = Date.now();
  const currentPoolSize = songPool ? songPool.size : 0;
  if (
    cachedAllArtists &&
    now - lastAllArtistsTime < ALL_ARTISTS_CACHE_TTL &&
    currentPoolSize === lastAllArtistsPoolSize
  ) {
    return cachedAllArtists;
  }

  try {
    const dbArtists = dbService.getCustomArtists();
    if (dbArtists && dbArtists.length > 0) {
      syncCustomArtistsInMemory(dbArtists);
    }
  } catch {}

  const map = new Map<string, Artist>();
  const poolValues = songPool ? Array.from(songPool.values()) : [];

  // Index non-junk songs by unique artistName to reduce O(Artists * Songs) to O(Artists * UniqueArtistNames)
  const songsByArtistName = new Map<string, Song[]>();
  const featTitleSongs: Song[] = [];
  for (const s of poolValues) {
    if (isJunkTrack(s.title, s.albumName, s.artistName)) continue;
    const bucket = songsByArtistName.get(s.artistName);
    if (bucket) {
      bucket.push(s);
    } else {
      songsByArtistName.set(s.artistName, [s]);
    }
    if (/\((?:feat\.?|ft\.?|featuring|with|ร่วมกับ)\s+/i.test(s.title)) {
      featTitleSongs.push(s);
    }
  }

  for (const a of [...CURATED_ARTISTS, ...customArtists]) {
    const norm = a.name.toLowerCase();
    const matchedSongIds = new Set<string>();
    const tracks: Song[] = [];

    for (const [rawArtistName, group] of songsByArtistName.entries()) {
      if (checkArtistStrictMatch(rawArtistName, a.name)) {
        for (const s of group) {
          if (!matchedSongIds.has(s.id)) {
            matchedSongIds.add(s.id);
            tracks.push(s);
          }
        }
      }
    }

    for (const s of featTitleSongs) {
      if (!matchedSongIds.has(s.id) && checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title)) {
        matchedSongIds.add(s.id);
        tracks.push(s);
      }
    }

    const effectiveCount =
      a.trackCount && a.trackCount > 0
        ? Math.max(a.trackCount, tracks.length)
        : tracks.length > 0
        ? tracks.length
        : dbService.searchSongs('', { artist: a.name, limit: 250 }).length;

    const hasValidAvatar = Boolean(
      a.avatarUrl &&
        (a.avatarUrl.startsWith('http://') ||
          a.avatarUrl.startsWith('https://') ||
          a.avatarUrl.startsWith('/'))
    );
    const avatar =
      (hasValidAvatar ? a.avatarUrl : '') ||
      tracks[0]?.artworkUrl ||
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';
    map.set(norm, {
      ...a,
      avatarUrl: avatar,
      trackCount: effectiveCount,
    });
  }
  const result = Array.from(map.values());
  cachedAllArtists = result;
  lastAllArtistsTime = now;
  lastAllArtistsPoolSize = currentPoolSize;
  return result;
}

