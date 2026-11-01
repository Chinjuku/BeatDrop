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
const ALL_ARTISTS_CACHE_TTL = 15_000;

export function invalidateAllArtistsCache(): void {
  cachedAllArtists = null;
  lastAllArtistsTime = 0;
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
  const existing = customArtists.find(
    (a) => normalizeText(a.name) === normalizeText(newArtist.name)
  );
  if (!existing) {
    customArtists.push(newArtist);
    saveCustomArtists();
    dbService.saveCustomArtist(newArtist);
  }
}

export function deleteCustomArtist(id: string): void {
  customArtists = customArtists.filter((a) => a.id !== id);
  saveCustomArtists();
  dbService.deleteCustomArtist(id);
}

export function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\..*|ft\..*/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
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
  const g = (rawGenre || '').toLowerCase();
  if (g.includes('k-pop') || g.includes('kpop')) return 'K-Pop';
  if (g.includes('hip-hop') || g.includes('rap')) return 'Hip-Hop/Rap';
  if (g.includes('r&b') || g.includes('soul')) return 'R&B';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'Rock';
  if (g.includes('alternative') || g.includes('indie')) return 'Indie';
  if (g.includes('dance') || g.includes('electronic') || g.includes('house') || g.includes('edm')) return 'EDM';
  if (g.includes('soundtrack') || g.includes('score') || g.includes('musical')) return 'Soundtrack';
  if (category === 'thai') {
    if (g.includes('thai') || g.includes('t-pop')) return 'T-Pop';
    if (g.includes('pop')) return 'T-Pop';
  }
  if (fallbackGenre && fallbackGenre !== 'any') return fallbackGenre;
  return 'Pop';
}

export function getAllArtists(songPool?: Map<string, Song>): Artist[] {
  const now = Date.now();
  if (cachedAllArtists && now - lastAllArtistsTime < ALL_ARTISTS_CACHE_TTL) {
    return cachedAllArtists;
  }

  try {
    const dbArtists = dbService.getCustomArtists();
    if (dbArtists && dbArtists.length > 0) {
      customArtists = dbArtists;
    }
  } catch {}

  const map = new Map<string, Artist>();
  const poolValues = songPool ? Array.from(songPool.values()) : [];

  for (const a of [...CURATED_ARTISTS, ...customArtists]) {
    const norm = a.name.toLowerCase();
    const tracks = poolValues.filter(
      (s) =>
        checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title) &&
        !isJunkTrack(s.title, s.albumName, s.artistName)
    );
    const effectiveCount =
      a.trackCount && a.trackCount > 0
        ? a.trackCount
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
  return result;
}

