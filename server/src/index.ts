import express, { Request, Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Artist,
  CategoryType,
  DailyChallengeInfo,
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GameMode,
  LeaderboardEntry,
  RoundActionResponse,
  RoundStartResponse,
  Song,
} from '../../shared/types.js';
import { dbService } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const CUSTOM_ARTISTS_FILE = path.join(DATA_DIR, 'custom-artists.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// Curated seed artists (Thai & International)
const CURATED_ARTISTS: Artist[] = [
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
];

// In-memory state
let customArtists: Artist[] = [];
const songPool = new Map<string, Song>(); // id -> Song
const loadedArtistQueries = new Set<string>();

interface ActiveRoundState {
  track: Song;
  difficulty: DifficultyLevel;
  stages: number[];
  stage: number;
  clipSeconds: number;
  mistakes: number;
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
}

const activeRounds = new Map<string, ActiveRoundState>();
let leaderboardEntries: LeaderboardEntry[] = [];

const SEED_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'lb-1', playerName: 'MelodyKing_TH', score: 980, streak: 18, fastestSeconds: 0.1, difficulty: 'impossible', category: 'thai', isDaily: true, createdAt: '2026-10-29T04:10:00Z' },
  { id: 'lb-2', playerName: 'SwiftieForever', score: 950, streak: 14, fastestSeconds: 0.2, difficulty: 'expert', category: 'international', isDaily: true, createdAt: '2026-10-29T04:15:00Z' },
  { id: 'lb-3', playerName: 'NontFam99', score: 910, streak: 12, fastestSeconds: 0.5, difficulty: 'hard', category: 'thai', isDaily: false, createdAt: '2026-10-29T04:22:00Z' },
  { id: 'lb-4', playerName: 'VinylCollector', score: 870, streak: 10, fastestSeconds: 1, difficulty: 'medium', category: 'all', isDaily: true, createdAt: '2026-10-29T04:30:00Z' },
  { id: 'lb-5', playerName: 'TPopHunter', score: 840, streak: 9, fastestSeconds: 0.5, difficulty: 'hard', category: 'thai', isDaily: false, createdAt: '2026-10-29T04:45:00Z' },
  { id: 'lb-6', playerName: 'BangkokBeats', score: 790, streak: 7, fastestSeconds: 1, difficulty: 'medium', category: 'thai', isDaily: true, createdAt: '2026-10-29T05:00:00Z' },
  { id: 'lb-7', playerName: 'IndieVibes', score: 750, streak: 6, fastestSeconds: 2, difficulty: 'medium', category: 'international', isDaily: false, createdAt: '2026-10-29T05:10:00Z' },
];

function loadLeaderboard(): void {
  dbService.migrateFromJsonFiles(DATA_DIR, SEED_LEADERBOARD);
  try {
    const dbEntries = dbService.getLeaderboard();
    if (dbEntries.length > 0) {
      leaderboardEntries = dbEntries;
      return;
    }
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        leaderboardEntries = parsed;
        return;
      }
    }
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
  leaderboardEntries = [...SEED_LEADERBOARD];
  saveLeaderboard();
}

function saveLeaderboard(): void {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardEntries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save leaderboard:', err);
  }
}

function loadCustomArtists(): void {
  loadLeaderboard();
  try {
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

function saveCustomArtists(): void {
  try {
    fs.writeFileSync(CUSTOM_ARTISTS_FILE, JSON.stringify(customArtists, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save custom artists:', err);
  }
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\..*|ft\..*/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Detect whether an artist/tracks belong to Thai or International catalog accurately
function detectCategory(name: string, tracks: Song[], fallback: 'thai' | 'international' = 'international'): 'thai' | 'international' {
  // 1. Check if artist exists in curated catalogue (exact or partial name match e.g. "Taylor Swift" in "ZAYN & Taylor Swift")
  const norm = normalizeText(name);
  const curated = CURATED_ARTISTS.find((a) => {
    const curNorm = normalizeText(a.name);
    return curNorm === norm || norm.includes(curNorm) || curNorm.includes(norm);
  });
  if (curated) return curated.category;

  // 2. Check for Thai Unicode characters in artist name or track titles
  const thaiCharRegex = /[\u0E00-\u0E7F]/;
  if (thaiCharRegex.test(name)) return 'thai';

  const thaiTrackCount = tracks.filter((t) => thaiCharRegex.test(t.title) || thaiCharRegex.test(t.artistName)).length;
  if (tracks.length > 0 && thaiTrackCount / tracks.length >= 0.25) {
    return 'thai';
  }

  // 3. If there are no Thai characters in name or any tracks, an artist discovered with purely Latin name is international
  if (tracks.length > 0 && thaiTrackCount === 0) {
    return 'international';
  }

  // 4. Fallback
  return fallback;
}

function normalizeGenre(rawGenre: string, category: 'thai' | 'international', fallbackGenre?: string): string {
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

async function fetchItunesSongs(
  term: string,
  country: 'TH' | 'US',
  category: 'thai' | 'international',
  limit = 20,
  overrideGenre?: string,
  byArtist = false
): Promise<Song[]> {
  try {
    const attrParam = byArtist ? '&attribute=artistTerm' : '';
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=song${attrParam}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItunesRawTrack[] };
    const results = data.results || [];

    return results
      .filter((t): t is Required<Pick<ItunesRawTrack, 'trackId' | 'trackName' | 'artistName' | 'previewUrl'>> & ItunesRawTrack =>
        Boolean(t.trackId && t.trackName && t.artistName && t.previewUrl)
      )
      .map((t, index) => {
        const year = t.releaseDate ? new Date(t.releaseDate).getFullYear() : 2020;
        const artworkHiRes = t.artworkUrl100
          ? t.artworkUrl100.replace('100x100bb', '600x600bb')
          : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
        return {
          id: String(t.trackId),
          title: t.trackName,
          artistId: t.artistId ? String(t.artistId) : undefined,
          artistName: t.artistName,
          albumName: t.collectionName || 'Single',
          releaseYear: Number.isFinite(year) ? year : 2020,
          releaseDate: t.releaseDate,
          genre: normalizeGenre(t.primaryGenreName || '', category, overrideGenre),
          category,
          previewUrl: t.previewUrl,
          artworkUrl: artworkHiRes,
          trackViewUrl: t.trackViewUrl,
          popularityScore: Math.max(10, 100 - index * 3), // Earlier iTunes results are higher popularity
        };
      });
  } catch (err) {
    console.error(`iTunes fetch error for "${term}":`, (err as Error).message);
    return [];
  }
}

// Deezer fallback for international/Thai tracks if iTunes returns empty
async function fetchDeezerSongs(
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

async function ingestArtistSongs(artist: Artist, limit = 50): Promise<number> {
  const key = `${artist.category}:${artist.name.toLowerCase()}`;
  const country = artist.category === 'thai' ? 'TH' : 'US';
  let tracks = await fetchItunesSongs(artist.name, country, artist.category, limit, artist.mainGenre, true);

  // If attribute=artistTerm returned few results, try standard term search
  if (tracks.length < 5) {
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

  // Filter tracks where artistName reasonably matches the artist to avoid unrelated covers
  const targetNorm = normalizeText(artist.name);
  const matchingTracks = tracks.filter((t) => {
    const trackArtistNorm = normalizeText(t.artistName);
    return trackArtistNorm.includes(targetNorm) || targetNorm.includes(trackArtistNorm);
  });

  const finalTracks = matchingTracks.length >= 3 ? matchingTracks : tracks;
  for (const song of finalTracks) {
    songPool.set(song.id, song);
  }
  // Persist tracks to SQLite database
  dbService.saveSongs(finalTracks);

  if (finalTracks.length > 0 && !artist.avatarUrl) {
    artist.avatarUrl = finalTracks[0].artworkUrl;
  }
  artist.trackCount = Array.from(songPool.values()).filter((s) => {
    const aNorm = normalizeText(s.artistName);
    return aNorm.includes(targetNorm) || targetNorm.includes(aNorm);
  }).length;

  dbService.updateArtistTrackCount(artist.name, artist.trackCount || 0);

  loadedArtistQueries.add(key);
  return finalTracks.length;
}

function getAllArtists(): Artist[] {
  const map = new Map<string, Artist>();
  for (const a of [...CURATED_ARTISTS, ...customArtists]) {
    const norm = a.name.toLowerCase();
    // Calculate current track count in pool
    const targetNorm = normalizeText(a.name);
    const tracks = Array.from(songPool.values()).filter((s) => {
      const sNorm = normalizeText(s.artistName);
      return sNorm.includes(targetNorm) || targetNorm.includes(sNorm);
    });
    const avatar = a.avatarUrl || tracks[0]?.artworkUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';
    map.set(norm, {
      ...a,
      avatarUrl: avatar,
      trackCount: tracks.length,
    });
  }
  return Array.from(map.values());
}

async function warmupInitialCatalog(): Promise<void> {
  loadCustomArtists();

  // 1. Populate songPool from permanent SQLite cache first (instant warmup)
  const cachedSongs = dbService.getAllSongs();
  for (const s of cachedSongs) {
    songPool.set(s.id, s);
  }
  console.log(`[SQLite] Loaded ${cachedSongs.length} persistent songs from SQLite database.`);

  const allArtists = [...CURATED_ARTISTS, ...customArtists];
  console.log(`[Server] Warming up song catalog for ${allArtists.length} artists...`);

  // Batch in groups of 8 to be fast and polite to iTunes API (fetch up to 40 tracks for deep catalog)
  const batchSize = 8;
  for (let i = 0; i < allArtists.length; i += batchSize) {
    const batch = allArtists.slice(i, i + batchSize);
    await Promise.all(batch.map((artist) => ingestArtistSongs(artist, 40)));
  }

  console.log(`[Server] Warmup complete! Total songs in pool: ${songPool.size} (DB total: ${dbService.countSongs()})`);
}

function matchesYearFilter(song: Song, yearFilter?: string): boolean {
  if (!yearFilter || yearFilter === 'any') return true;
  if (yearFilter.toLowerCase() === 'classic') {
    return song.releaseYear < 2000;
  }
  if (yearFilter.endsWith('s')) {
    const decadeStart = parseInt(yearFilter.slice(0, 4), 10);
    if (!Number.isNaN(decadeStart)) {
      return song.releaseYear >= decadeStart && song.releaseYear <= decadeStart + 9;
    }
  }
  const exactYear = parseInt(yearFilter, 10);
  if (!Number.isNaN(exactYear)) {
    return song.releaseYear === exactYear;
  }
  return true;
}

function matchesGenreFilter(song: Song, genreFilter?: string): boolean {
  if (!genreFilter || genreFilter === 'any') return true;
  const g = genreFilter.toLowerCase();
  const sg = song.genre.toLowerCase();
  if (g === 't-pop') {
    return song.category === 'thai' && (sg === 't-pop' || sg === 'pop');
  }
  return sg === g || sg.includes(g);
}

function matchesArtistFilter(song: Song, artistName?: string): boolean {
  if (!artistName || artistName === 'any') return true;
  const target = normalizeText(artistName);
  const actual = normalizeText(song.artistName);
  return actual.includes(target) || target.includes(actual);
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * 1. GET /api/artists
 * List curated + custom artists, optionally searching remote iTunes catalog
 */
app.get('/api/artists', async (req: Request, res: Response) => {
  const category = (req.query.category as CategoryType) || 'all';
  const q = ((req.query.q as string) || '').trim();
  const discover = req.query.discover === 'true';

  let list = getAllArtists();
  if (category === 'thai' || category === 'international') {
    list = list.filter((a) => a.category === category);
  }

  if (q) {
    const qNorm = normalizeText(q);
    list = list.filter(
      (a) =>
        normalizeText(a.name).includes(qNorm) ||
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        a.mainGenre.toLowerCase().includes(q.toLowerCase())
    );
  }

  // If user is searching for an artist not in local list or discover=true, query iTunes live
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
        const key = normalizeText(s.artistName);
        if (!remoteArtistMap.has(key)) {
          remoteArtistMap.set(key, {
            artist: {
              id: `discovered-${crypto.randomUUID().slice(0, 8)}`,
              name: s.artistName,
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

      for (const { artist, songs } of remoteArtistMap.values()) {
        // Find if artist is in curated or custom list first
        const known = getAllArtists().find((k) => normalizeText(k.name) === normalizeText(artist.name));
        const detectedCat = known ? known.category : detectCategory(artist.name, songs, sc.cat);
        const resolvedMainGenre = known ? known.mainGenre : normalizeGenre(artist.mainGenre, detectedCat);

        // Only include if matching the requested category
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
});

/**
 * 2. POST /api/artists/add
 * Add a custom artist to the curated pool, persist to disk, and fetch their tracks
 */
app.post('/api/artists/add', async (req: Request, res: Response) => {
  try {
    const { name, category = 'thai', mainGenre = 'Pop', avatarUrl = '' } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ code: -1, message: 'Artist name is required' });
      return;
    }

    const cleanName = name.trim();
    const validCat: 'thai' | 'international' = category === 'international' ? 'international' : 'thai';

    const existing = getAllArtists().find(
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

    // Fetch up to 35 songs for this artist so Artist Mode has a deep catalog
    await ingestArtistSongs(newArtist, 35);

    if (!existing) {
      customArtists.push(newArtist);
      saveCustomArtists();
      dbService.saveCustomArtist(newArtist);
    }

    const enriched = getAllArtists().find(
      (a) => normalizeText(a.name) === normalizeText(cleanName)
    ) || newArtist;

    res.json({
      code: 0,
      message: 'ok',
      data: enriched,
    });
  } catch (err) {
    res.status(500).json({ code: -1, message: (err as Error).message });
  }
});

/**
 * 3. DELETE /api/artists/:id
 * Remove a custom artist
 */
app.delete('/api/artists/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  customArtists = customArtists.filter((a) => a.id !== id);
  saveCustomArtists();
  dbService.deleteCustomArtist(id);
  res.json({ code: 0, message: 'ok', data: { removedId: id } });
});

function parseCustomStages(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0 && n <= 30);
  if (parts.length >= 2) {
    const unique = Array.from(new Set(parts)).sort((a, b) => a - b);
    return unique.length >= 2 ? unique : null;
  }
  return null;
}

/**
 * 4. GET /api/songs (and /api/round/start, /api/songspot/round)
 * Start a round with full filtering (Category, Difficulty, Mode, Artist, Year, Genre, CustomStages)
 */
async function handleStartRound(req: Request, res: Response): Promise<void> {
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const difficulty = ((req.query.difficulty as DifficultyLevel) || 'medium') as DifficultyLevel;
  const mode = ((req.query.mode as GameMode) || 'standard') as GameMode;
  const artistFilter = ((req.query.artist as string) || '').trim();
  const yearFilter = ((req.query.year as string) || 'any').trim();
  const genreFilter = ((req.query.genre as string) || 'any').trim();
  const excludeIds = ((req.query.exclude as string) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  const customStagesParam = parseCustomStages(req.query.customStages);
  const roundStages = customStagesParam || (req.query.difficulty ? preset.stages : DEFAULT_TIME_STAGES);

  // If Artist Mode is active, ensure we have plenty of songs for that artist
  if (artistFilter && artistFilter !== 'any') {
    const existingForArtist = Array.from(songPool.values()).filter((s) =>
      matchesArtistFilter(s, artistFilter)
    );
    if (existingForArtist.length < 50) {
      const knownArtist = getAllArtists().find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const targetCat: 'thai' | 'international' = knownArtist
        ? knownArtist.category
        : (category === 'international' ? 'international' : 'thai');
      await ingestArtistSongs(
        {
          id: 'temp',
          name: artistFilter,
          category: targetCat,
          mainGenre: knownArtist?.mainGenre || (genreFilter !== 'any' ? genreFilter : 'Pop'),
          avatarUrl: knownArtist?.avatarUrl || '',
        },
        200
      );
      // Also check alternate store if first store returned few tracks
      const afterFirstFetch = Array.from(songPool.values()).filter((s) =>
        matchesArtistFilter(s, artistFilter)
      );
      if (afterFirstFetch.length < 20) {
        const altCat = targetCat === 'thai' ? 'international' : 'thai';
        await ingestArtistSongs(
          {
            id: 'temp-alt',
            name: artistFilter,
            category: altCat,
            mainGenre: knownArtist?.mainGenre || 'Pop',
            avatarUrl: '',
          },
          100
        );
      }
    }
  }

  // If specific year filter has few songs in pool, dynamically fetch hits from that year
  if (yearFilter !== 'any' && (!artistFilter || artistFilter === 'any')) {
    const yearMatches = Array.from(songPool.values()).filter(
      (s) =>
        (category === 'all' || s.category === category) &&
        matchesYearFilter(s, yearFilter)
    );
    if (yearMatches.length < 6) {
      const searchYear = yearFilter.endsWith('s') ? yearFilter.slice(0, 4) : yearFilter;
      if (category === 'thai' || category === 'all') {
        const thYearTracks = await fetchItunesSongs(`เพลงฮิต ${searchYear}`, 'TH', 'thai', 25);
        thYearTracks.forEach((t) => songPool.set(t.id, t));
      }
      if (category === 'international' || category === 'all') {
        const usYearTracks = await fetchItunesSongs(`hits ${searchYear}`, 'US', 'international', 25);
        usYearTracks.forEach((t) => songPool.set(t.id, t));
      }
    }
  }

  // Filter candidate songs
  let candidates = Array.from(songPool.values());

  // 1) Category filter (unless Artist Mode overrides to a specific artist)
  if (!artistFilter || artistFilter === 'any') {
    if (category === 'thai' || category === 'international') {
      candidates = candidates.filter((s) => s.category === category);
    }
  }

  // 2) Artist filter
  if (artistFilter && artistFilter !== 'any') {
    const artistScoped = candidates.filter((s) => matchesArtistFilter(s, artistFilter));
    if (artistScoped.length > 0) {
      candidates = artistScoped;
    }
  }

  // 3) Year / Era filter (Ignore in Artist Mode so leftover filters don't reduce artist catalog)
  if (mode !== 'artist' && yearFilter && yearFilter !== 'any') {
    const yearScoped = candidates.filter((s) => matchesYearFilter(s, yearFilter));
    if (yearScoped.length > 0) {
      candidates = yearScoped;
    }
  }

  // 4) Genre filter (Ignore in Artist Mode so leftover filters don't reduce artist catalog)
  if (mode !== 'artist' && genreFilter && genreFilter !== 'any') {
    const genreScoped = candidates.filter((s) => matchesGenreFilter(s, genreFilter));
    if (genreScoped.length > 0) {
      candidates = genreScoped;
    }
  }

  const totalMatchingPoolSize = candidates.length;

  // 5) Difficulty-based weighting
  if (candidates.length > 6) {
    const sorted = [...candidates].sort(
      (a, b) => (b.popularityScore || 50) - (a.popularityScore || 50)
    );
    if (difficulty === 'easy') {
      // Top 65% most popular hits
      candidates = sorted.slice(0, Math.max(5, Math.ceil(sorted.length * 0.65)));
    } else if (difficulty === 'hard') {
      // Prefer deeper cuts (bottom 75%)
      candidates = sorted.slice(Math.floor(sorted.length * 0.25));
    }
  }

  // 6) Exclude recently played tracks
  const nonExcluded = candidates.filter((s) => !excludeIds.includes(s.id));
  if (nonExcluded.length > 0) {
    candidates = nonExcluded;
  }

  if (candidates.length === 0) {
    candidates = Array.from(songPool.values());
  }

  const selectedTrack = candidates[Math.floor(Math.random() * candidates.length)];
  const roundToken = `tok_${crypto.randomUUID()}`;
  const roundKey = `rk_${crypto.randomUUID()}`;

  // Generate 4 multiple-choice answers if in Song Guesser mode
  let choices: Array<{ id: string; title: string; artistName: string; artworkUrl?: string }> | undefined;
  if (mode === 'guesser') {
    const distractorPool = Array.from(songPool.values()).filter(
      (s) =>
        s.id !== selectedTrack.id &&
        normalizeText(s.title) !== normalizeText(selectedTrack.title) &&
        s.category === selectedTrack.category
    );
    // Prioritize same artist or same genre for realistic distractors
    const sameArtistOrGenre = distractorPool.filter(
      (s) =>
        normalizeText(s.artistName) === normalizeText(selectedTrack.artistName) ||
        s.genre.toLowerCase() === selectedTrack.genre.toLowerCase()
    );
    const poolToUse = sameArtistOrGenre.length >= 6 ? sameArtistOrGenre : distractorPool;
    const shuffledDistractors = [...poolToUse].sort(() => Math.random() - 0.5);
    const pickedDistractors: Song[] = [];
    const seenTitles = new Set<string>([normalizeText(selectedTrack.title)]);

    for (const d of shuffledDistractors) {
      const tNorm = normalizeText(d.title);
      if (!seenTitles.has(tNorm)) {
        seenTitles.add(tNorm);
        pickedDistractors.push(d);
      }
      if (pickedDistractors.length >= 3) break;
    }

    const rawOptions = [selectedTrack, ...pickedDistractors].map((s) => ({
      id: s.id,
      title: s.title,
      artistName: s.artistName,
      artworkUrl: s.artworkUrl,
    }));
    choices = rawOptions.sort(() => Math.random() - 0.5);
  }

  activeRounds.set(roundToken, {
    track: selectedTrack,
    difficulty,
    stages: roundStages,
    stage: 0,
    clipSeconds: roundStages[0],
    mistakes: 0,
    category,
    mode,
    artistFilter: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
  });

  const responsePayload: RoundStartResponse = {
    roundToken,
    roundKey,
    audioUrl: selectedTrack.previewUrl,
    difficulty,
    stages: roundStages,
    stage: 0,
    clipSeconds: roundStages[0],
    category,
    mode,
    artistFilter: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
    yearFilter,
    genreFilter,
    choices,
    poolSize: totalMatchingPoolSize,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  res.json({
    code: 0,
    message: 'ok',
    data: responsePayload,
  });
}

app.get('/api/songs', handleStartRound);
app.get('/api/round/start', handleStartRound);
app.post('/api/round/start', handleStartRound);
app.get('/api/songspot/round', handleStartRound);

/**
 * 5. GET /api/autocomplete (and /api/songspot/search)
 * Scoped autocomplete search (strictly scoped to artist in Artist Mode!)
 */
async function handleAutocomplete(req: Request, res: Response): Promise<void> {
  const q = ((req.query.q as string) || '').trim();
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const artistFilter = ((req.query.artist as string) || '').trim();
  const limit = Math.min(60, Math.max(1, parseInt((req.query.limit as string) || '10', 10)));

  // If artistFilter is active and pool has few songs, eagerly load artist tracks
  if (artistFilter && artistFilter !== 'any') {
    const existing = Array.from(songPool.values()).filter((s) => matchesArtistFilter(s, artistFilter));
    if (existing.length < 30) {
      const knownArtist = getAllArtists().find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const targetCat = knownArtist?.category || (category === 'international' ? 'international' : 'thai');
      await ingestArtistSongs(
        {
          id: 'temp-auto',
          name: artistFilter,
          category: targetCat,
          mainGenre: knownArtist?.mainGenre || 'Pop',
          avatarUrl: knownArtist?.avatarUrl || '',
        },
        100
      );
    }
  }

  let pool = Array.from(songPool.values());

  // Strictly scope to the selected artist when Artist Mode is active!
  if (artistFilter && artistFilter !== 'any') {
    pool = pool.filter((s) => matchesArtistFilter(s, artistFilter));
  } else if (category === 'thai' || category === 'international') {
    pool = pool.filter((s) => s.category === category);
  }

  let matches: Song[] = [];
  if (!q) {
    // When query is empty (e.g., on focus in Artist Mode), return top tracks in scope
    matches = pool;
  } else {
    const qNorm = normalizeText(q);
    const qLower = q.toLowerCase();
    matches = pool.filter(
      (s) =>
        s.title.toLowerCase().includes(qLower) ||
        s.artistName.toLowerCase().includes(qLower) ||
        normalizeText(s.title).includes(qNorm) ||
        normalizeText(s.artistName).includes(qNorm)
    );

    // If local matches are few, search indexed SQLite database first!
    if (matches.length < limit) {
      const dbMatches = dbService.searchSongs(q, {
        category,
        artist: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
        limit,
      });
      for (const ds of dbMatches) {
        songPool.set(ds.id, ds);
        if (!matches.some((m) => m.id === ds.id)) {
          matches.push(ds);
        }
      }
    }

    // If still few matches:
    if (artistFilter && artistFilter !== 'any' && matches.length < 4 && q.length >= 1) {
      // In Artist Mode, search iTunes live specifically for this artist's song!
      const knownArtist = getAllArtists().find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const country = (knownArtist?.category || category) === 'international' ? 'US' : 'TH';
      const targetCat = (knownArtist?.category || category) === 'international' ? 'international' : 'thai';
      const liveTracks = await fetchItunesSongs(`${artistFilter} ${q}`, country, targetCat, 20);
      const matchingLive = liveTracks.filter((t) => matchesArtistFilter(t, artistFilter));
      for (const lt of matchingLive) {
        songPool.set(lt.id, lt);
        if (!matches.some((m) => m.id === lt.id)) {
          matches.push(lt);
        }
      }
      dbService.saveSongs(matchingLive);
    } else if ((!artistFilter || artistFilter === 'any') && matches.length < 4 && q.length >= 2) {
      const country = category === 'international' ? 'US' : 'TH';
      const targetCat = category === 'international' ? 'international' : 'thai';
      const liveTracks = await fetchItunesSongs(q, country, targetCat, 8);
      for (const lt of liveTracks) {
        songPool.set(lt.id, lt);
        if (!matches.some((m) => m.id === lt.id)) {
          matches.push(lt);
        }
      }
      dbService.saveSongs(liveTracks);
    }
  }

  // Deduplicate by normalized title + artist so the autocomplete dropdown is clean
  const seenKey = new Set<string>();
  const uniqueMatches: Song[] = [];
  for (const song of matches) {
    const dedupKey = `${normalizeText(song.title)}::${normalizeText(song.artistName)}`;
    if (!seenKey.has(dedupKey)) {
      seenKey.add(dedupKey);
      uniqueMatches.push(song);
    }
    if (uniqueMatches.length >= limit) break;
  }

  res.json({
    code: 0,
    message: 'ok',
    data: uniqueMatches,
  });
}

app.get('/api/autocomplete', handleAutocomplete);
app.get('/api/songspot/search', handleAutocomplete);

/**
 * 6. POST /api/round/guess (and /api/songspot/guess)
 * Verify player's guess against active round
 */
function handleGuess(req: Request, res: Response): void {
  const { roundToken, candidateTrackId, candidateTitle, candidateArtist } = req.body || {};
  const active = activeRounds.get(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  const candidateSong = songPool.get(String(candidateTrackId));
  const guessedTitle = candidateSong?.title || candidateTitle || '';
  const guessedArtist = candidateSong?.artistName || candidateArtist || '';

  const exactIdMatch = String(active.track.id) === String(candidateTrackId);
  const titleMatch =
    Boolean(guessedTitle) &&
    normalizeText(active.track.title) === normalizeText(guessedTitle) &&
    (!guessedArtist ||
      normalizeText(active.track.artistName).includes(normalizeText(guessedArtist)) ||
      normalizeText(guessedArtist).includes(normalizeText(active.track.artistName)));

  if (exactIdMatch || titleMatch) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'correct',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  // Wrong guess -> in 'guesser' mode (Multiple Choice), fail and reveal immediately
  if (active.mode === 'guesser') {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes + 1,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  // Wrong guess -> advance stage
  active.mistakes += 1;
  active.stage += 1;

  if (active.stage >= active.stages.length) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: active.stages.length - 1,
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = `tok_${crypto.randomUUID()}`;
  activeRounds.delete(roundToken);
  activeRounds.set(nextToken, active);

  const payload: RoundActionResponse = {
    outcome: 'active',
    roundToken: nextToken,
    stage: active.stage,
    clipSeconds: active.clipSeconds,
    mistakes: active.mistakes,
  };
  res.json({ code: 0, message: 'ok', data: payload });
}

app.post('/api/round/guess', handleGuess);
app.post('/api/songspot/guess', handleGuess);

/**
 * 7. POST /api/round/skip (and /api/songspot/skip)
 * Skip current stage to unlock longer snippet or give up on final stage
 */
function handleSkip(req: Request, res: Response): void {
  const { roundToken, giveUp } = req.body || {};
  const active = activeRounds.get(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  active.stage += 1;

  if (giveUp || active.stage >= active.stages.length) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: Math.min(active.stage, active.stages.length - 1),
      clipSeconds: active.stages[ active.stages.length - 1 ],
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = `tok_${crypto.randomUUID()}`;
  activeRounds.delete(roundToken);
  activeRounds.set(nextToken, active);

  const payload: RoundActionResponse = {
    outcome: 'active',
    roundToken: nextToken,
    stage: active.stage,
    clipSeconds: active.clipSeconds,
    mistakes: active.mistakes,
  };
  res.json({ code: 0, message: 'ok', data: payload });
}

app.post('/api/round/skip', handleSkip);
app.post('/api/songspot/skip', handleSkip);

/**
 * 8. GET /api/daily
 * Deterministic 5-song Daily Challenge seeded by YYYY-MM-DD and Category
 */
function seededHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

app.get('/api/daily', (req: Request, res: Response) => {
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const difficulty = ((req.query.difficulty as DifficultyLevel) || 'medium') as DifficultyLevel;
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  const customStagesParam = parseCustomStages(req.query.customStages);
  const roundStages = customStagesParam || (req.query.difficulty ? preset.stages : DEFAULT_TIME_STAGES);
  const dateKey = new Date().toISOString().slice(0, 10);

  let candidates = Array.from(songPool.values());
  if (category === 'thai' || category === 'international') {
    candidates = candidates.filter((s) => s.category === category);
  }
  if (candidates.length < 5) {
    candidates = Array.from(songPool.values());
  }

  // Sort deterministically using seeded hash per dateKey + category + song.id
  const sorted = [...candidates].sort((a, b) => {
    const ha = seededHash(`${dateKey}:${category}:${a.id}`);
    const hb = seededHash(`${dateKey}:${category}:${b.id}`);
    return ha - hb;
  });

  // Pick 5 unique artists if possible for variety
  const dailySongs: Song[] = [];
  const usedArtists = new Set<string>();
  for (const s of sorted) {
    const aNorm = normalizeText(s.artistName);
    if (!usedArtists.has(aNorm)) {
      usedArtists.add(aNorm);
      dailySongs.push(s);
    }
    if (dailySongs.length >= 5) break;
  }
  while (dailySongs.length < 5 && sorted.length > dailySongs.length) {
    const next = sorted.find((s) => !dailySongs.some((d) => d.id === s.id));
    if (next) dailySongs.push(next);
    else break;
  }

  const rounds: RoundStartResponse[] = dailySongs.map((track, idx) => {
    const roundToken = `daily_${dateKey}_${category}_${idx}_${crypto.randomUUID().slice(0, 8)}`;
    activeRounds.set(roundToken, {
      track,
      difficulty,
      stages: roundStages,
      stage: 0,
      clipSeconds: roundStages[0],
      mistakes: 0,
      category,
      mode: 'daily',
    });

    return {
      roundToken,
      roundKey: `rk_daily_${dateKey}_${idx}`,
      audioUrl: track.previewUrl,
      difficulty,
      stages: roundStages,
      stage: 0,
      clipSeconds: roundStages[0],
      category,
      mode: 'daily',
      poolSize: candidates.length,
      expiresAt: Date.now() + 1000 * 60 * 60 * 12,
    };
  });

  const info: DailyChallengeInfo = {
    dateKey,
    category,
    totalRounds: rounds.length,
    rounds,
  };

  res.json({ code: 0, message: 'ok', data: info });
});

/**
 * 9. GET /api/leaderboard & POST /api/leaderboard
 * Global & Daily Challenge Rankings
 */
app.get('/api/leaderboard', (req: Request, res: Response) => {
  const category = (req.query.category as CategoryType) || 'all';
  const mode = (req.query.mode as string) || 'all'; // 'all' | 'daily'

  let list = [...leaderboardEntries];
  if (category === 'thai' || category === 'international') {
    list = list.filter((e) => e.category === category || e.category === 'all');
  }
  if (mode === 'daily') {
    list = list.filter((e) => e.isDaily);
  }

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.fastestSeconds - b.fastestSeconds;
  });

  res.json({ code: 0, message: 'ok', data: list.slice(0, 50) });
});

app.post('/api/leaderboard', (req: Request, res: Response) => {
  const {
    playerName,
    score = 100,
    streak = 1,
    fastestSeconds = 1,
    difficulty = 'medium',
    category = 'thai',
    isDaily = false,
  } = req.body || {};

  const cleanName = String(playerName || 'Anonymous Player').trim().slice(0, 24) || 'Player';
  const dateKey = new Date().toISOString().slice(0, 10);

  const existingIdx = leaderboardEntries.findIndex(
    (e) => e.playerName.toLowerCase() === cleanName.toLowerCase() && Boolean(e.isDaily) === Boolean(isDaily)
  );

  const entry: LeaderboardEntry = {
    id: `lb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    playerName: cleanName,
    score: Number(score) || 0,
    streak: Number(streak) || 0,
    fastestSeconds: Number(fastestSeconds) || 1,
    difficulty: difficulty as DifficultyLevel,
    category: category as CategoryType,
    isDaily: Boolean(isDaily),
    dateKey,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    const prev = leaderboardEntries[existingIdx];
    leaderboardEntries[existingIdx] = {
      ...prev,
      score: Math.max(prev.score, entry.score),
      streak: Math.max(prev.streak, entry.streak),
      fastestSeconds: Math.min(prev.fastestSeconds, entry.fastestSeconds),
      difficulty: entry.difficulty,
      category: entry.category,
      dateKey,
      createdAt: entry.createdAt,
    };
  } else {
    leaderboardEntries.push(entry);
  }

  saveLeaderboard();
  dbService.addLeaderboardEntry(entry);
  res.json({ code: 0, message: 'ok', data: entry });
});

// Start Express Server
warmupInitialCatalog().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Songspot TypeScript Backend running at http://localhost:${PORT}`);
  });
});

