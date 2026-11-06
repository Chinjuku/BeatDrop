/**
 * BeatDrop — lib/itunes.ts
 * Searches and fetches up to 200 songs (limit=200) per artist from iTunes Search & Lookup API,
 * with timeout, HTTP 429/403 rate-limit retry, and chunked Supabase / Local DB ingestion.
 */

import type { Artist, ArtistSyncJob, CategoryType, Song } from '../shared/types';
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

const ITUNES_FETCH_TIMEOUT_MS = 3200;
const VERCEL_SAFE_BUDGET_MS = 7500;
const CHUNK_SIZE = 100;
const SYNC_LOCK_TTL_MS = 45_000;

const normTextCache = new Map<string, string>();
const candidateTokensCache = new Map<string, string[]>();
const imposterRegexCache = new Map<string, RegExp>();

export function hasThaiScript(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

export function normalizeText(value: string): string {
  if (!value) return '';
  const cached = normTextCache.get(value);
  if (cached !== undefined) return cached;
  const computed = value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\.?|ft\.?/gi, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normTextCache.size < 15000) {
    normTextCache.set(value, computed);
  }
  return computed;
}

export const KNOWN_ARTIST_ALIASES: Record<string, string[]> = {
  // TaitosmitH
  taitosmith: ['ไททศสมิธ', 'ไททศมิตร', 'ไททศ'],
  'ไททศสมิธ': ['taitosmith', 'ไททศมิตร'],
  'ไททศมิตร': ['taitosmith', 'ไททศสมิธ'],

  // Stamp
  stamp: ['แสตมป์', 'แสตมป์ อภิวัชร์', 'stamp apiwat'],
  'stamp apiwat': ['stamp', 'แสตมป์', 'แสตมป์ อภิวัชร์'],
  'แสตมป์': ['stamp', 'stamp apiwat', 'แสตมป์ อภิวัชร์'],
  'แสตมป์ อภิวัชร์': ['stamp', 'stamp apiwat', 'แสตมป์'],

  // Common popular Thai artists with English & Thai spellings
  bodyslam: ['บอดี้สแลม'],
  'บอดี้สแลม': ['bodyslam'],
  'tilly birds': ['ทิลลี่เบิร์ด', 'ทิลลี่เบิร์ดส์'],
  'three man down': ['ทรีแมนดาวน์', 'ทรี แมน ดาวน์'],
  cocktail: ['ค็อกเทล'],
  bowkylion: ['โบกี้ไลอ้อน', 'โบกี้ ไลอ้อน'],
  'nont tanont': ['นนท์ ธนนท์', 'นนท์'],
  potato: ['โปเตโต้'],
  'slot machine': ['สล็อตแมชชีน', 'สล็อต แมชชีน'],
  'jeff satur': ['เจฟ ซาเตอร์'],
  milli: ['มิลลิ'],
  'tattoo colour': ['แทททูคัลเลอร์', 'แทททู คัลเลอร์'],
  polycat: ['โพลีแคต', 'โพลี่แคท'],
  'ink waruntorn': ['อิ้งค์ วรันธร', 'อิ้งค์'],
  palmy: ['ปาล์มมี่'],
  '4eve': ['โฟร์อีฟ'],
  billkin: ['บิวกิ้น'],
  'violette wautier': ['วิโอเลต วอเทียร์', 'วี วิโอเลต'],
  illslick: ['อิลสลิก', 'อิล'],
  carabao: ['คาราบาว'],
  'big ass': ['บิ๊กแอส'],
  'the toys': ['เดอะทอยส์', 'ทอยส์'],
  pun: ['ปัน'],
  gunner: ['กันเนอร์'],
  'the parkinson': ['เดอะพาร์กินสัน', 'เดอะ พาร์กินสัน'],
  'safeplanet': ['เซฟแพลนเน็ต'],
  'purpeech': ['เพอร์พีช'],
  'fellow fellow': ['เฟลโล่ว เฟลโล่ว'],
  'scrubb': ['สครับบ์', 'สครับ'],
  'paradox': ['พาราด็อกซ์'],
  'loso': ['โลโซ', 'เสก โลโซ', 'sek loso'],
  'labanoon': ['ลาบานูน'],
  'silly fools': ['ซิลลี่ ฟูลส์', 'ซิลลี่ฟูลส์'],
  'moderndog': ['โมเดิร์นด็อก'],
  'urboytj': ['ยัวร์บอยทีเจ', 'ทีเจ'],
  'freehand': ['ฟรีแฮนด์'],
  'only monday': ['โอนลี่มันเดย์'],
  'hybs': ['ไฮบ์ส'],
  'dept': ['เดปท์'],
  'landokmai': ['ลานดอกไม้'],
  'whal & dolph': ['วาฬแอนด์ดอล์ฟ'],
  'bus': ['บัส', 'because of you i shine'],
  'proxie': ['พร็อกซี'],
  'perses': ['เพอร์เซส'],
  'pixxie': ['พิกซี่'],
  'atlas': ['แอทลาส'],
  'bamm': ['แบมม์'],
  'pp krit': ['พีพี กฤษฏ์'],
};

export function isKnownThaiArtistName(name: string): boolean {
  if (!name) return false;
  if (hasThaiScript(name)) return true;
  const norm = normalizeText(name);
  if (norm in KNOWN_ARTIST_ALIASES) return true;
  return Object.values(KNOWN_ARTIST_ALIASES).some((aliases) =>
    aliases.some((a) => normalizeText(a) === norm)
  );
}

export function isThaiGenreTag(rawGenre?: string): boolean {
  const g = (rawGenre || '').toLowerCase();
  return (
    g.includes('thai') ||
    g.includes('t-pop') ||
    g.includes('tpop') ||
    g.includes('luk thung') ||
    g.includes('lukthung') ||
    g.includes('ลูกทุ่ง') ||
    g.includes('เพื่อชีวิต')
  );
}

export function getArtistCandidateTokens(name: string): string[] {
  if (!name) return [];
  const cached = candidateTokensCache.get(name);
  if (cached !== undefined) return cached;

  const result = new Set<string>();

  const baseNorm = normalizeText(name);
  if (baseNorm) result.add(baseNorm);

  // Extract from parentheses e.g. "ไททศสมิธ (TaitosmitH)" -> ["ไททศสมิธ", "TaitosmitH"]
  if (name.includes('(') || name.includes('[')) {
    const parenMatches = name.match(/\((.*?)\)|\[(.*?)\]/g);
    if (parenMatches) {
      for (const m of parenMatches) {
        const inside = m.replace(/[()[\]]/g, '').trim();
        const normInside = normalizeText(inside);
        if (normInside) result.add(normInside);
      }
      const withoutParen = name.replace(/\(.*?\)|\[.*?\]/g, '').trim();
      const normWithout = normalizeText(withoutParen);
      if (normWithout) result.add(normWithout);
    }
  }

  // Also split by / or & or | if present in name
  if (name.includes('/') || name.includes('|')) {
    const slashes = name.split(/[\/|]/).map((s) => normalizeText(s.trim())).filter(Boolean);
    for (const s of slashes) result.add(s);
  }

  // Add all known aliases for all candidate tokens
  const currentTokens = Array.from(result);
  for (const tok of currentTokens) {
    const aliases = KNOWN_ARTIST_ALIASES[tok];
    if (aliases) {
      for (const a of aliases) {
        const normA = normalizeText(a);
        if (normA) result.add(normA);
      }
    }
  }

  const out = Array.from(result);
  if (candidateTokensCache.size < 10000) {
    candidateTokensCache.set(name, out);
  }
  return out;
}

export function cleanTrackTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\((feat\.?|ft\.?|ร่วมกับ|เพลงประกอบ).*?\)/gi, '')
    .replace(/\s*\[(feat\.?|ft\.?|official|ost).*?\]/gi, '')
    .trim();
}

const JUNK_TERMS_REGEX = /\b(karaoke|tribute|instrumental|music box|sleep music|lullaby|relaxation|in the style of|made famous by|originally performed|backing track|ringtone|piano cover|guitar cover|soundtrack cast|loopable|nature sounds|ambient rain|white noise)\b/i;

export function isJunkTrack(title?: string, albumName?: string, artistName?: string): boolean {
  const t = title || '';
  const a = albumName || '';
  const art = artistName || '';
  const normArt = normalizeText(art);
  const normTitle = normalizeText(t);

  // Preserve real songs like Tattoo Colour's 'คาราโอเกะ (Karaoke)'
  if (normArt === 'tattoo colour' && normTitle.includes('karaoke')) {
    return false;
  }

  // Reject explicit (Instrumental) / [Instrumental] tags
  if (/\((?:instrumental|karaoke|tribute)\)|\[(?:instrumental|karaoke|tribute)\]/i.test(t)) {
    return true;
  }

  return JUNK_TERMS_REGEX.test(t) || JUNK_TERMS_REGEX.test(a) || JUNK_TERMS_REGEX.test(art);
}

export function checkArtistStrictMatch(
  trackArtist: string,
  targetArtist: string,
  targetArtistId?: number | null,
  trackArtistId?: number | null,
  trackTitle?: string
): boolean {
  if (!trackArtist || !targetArtist) return false;
  if (targetArtistId && trackArtistId && targetArtistId === trackArtistId) {
    return true;
  }

  const targetTokens = getArtistCandidateTokens(targetArtist);
  const actual = normalizeText(trackArtist);
  if (!actual || targetTokens.length === 0) return false;

  // Direct token match & prefix/suffix match (e.g. "Stamp Apiwat" matches "Stamp")
  for (const target of targetTokens) {
    if (actual === target) return true;

    if (actual.startsWith(target + ' ') || actual.endsWith(' ' + target)) {
      // Reject imposter patterns e.g. "Illslick Music", "Taylor Swift Songs", "Taylor Swift Tribute Band"
      let imposter = imposterRegexCache.get(target);
      if (!imposter) {
        imposter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(music|song|songs|band|orchestra|project|experience|records|tribute|cover|soundtrack)$`, 'i');
        if (imposterRegexCache.size < 5000) imposterRegexCache.set(target, imposter);
      }
      if (!imposter.test(actual)) {
        return true;
      }
    }
  }

  // Tokenized collaboration match (e.g. "TAITOSMITH & MILLI", "ILLSLICK, SANTAZ & DM", "ZAYN & Taylor Swift")
  const trackTokens = trackArtist
    .split(/[,&/]|\b(?:feat\.?|ft\.?|featuring|with|x|and|ร่วมกับ)\b/i)
    .flatMap((t) => getArtistCandidateTokens(t))
    .filter(Boolean);

  for (const target of targetTokens) {
    if (trackTokens.includes(target)) return true;
  }

  // Check feat in track title e.g. "ชุดวิวาห์ (feat. Illslick)" or "กาลครั้งหนึ่ง (feat. ปาล์มมี่)"
  if (trackTitle) {
    const featMatch = trackTitle.match(/\((?:feat\.?|ft\.?|featuring|with|ร่วมกับ)\s+([^)]+)\)/i);
    if (featMatch && featMatch[1]) {
      const featTokens = featMatch[1]
        .split(/[,&/]|\b(?:feat\.?|ft\.?|featuring|with|x|and|ร่วมกับ)\b/i)
        .flatMap((t) => getArtistCandidateTokens(t))
        .filter(Boolean);
      for (const target of targetTokens) {
        if (featTokens.includes(target)) return true;
      }
    }
  }

  return false;
}

export function mapGenreTag(rawGenre?: string, category?: CategoryType): string {
  const g = (rawGenre || '').trim().toLowerCase();
  if (g.includes('k-pop') || g.includes('kpop')) return 'K-Pop';
  if (g.includes('hip-hop') || g.includes('hip hop') || g.includes('rap')) return 'Hip-Hop/Rap';
  if (g.includes('r&b') || g.includes('soul') || g.includes('funk')) return 'R&B';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'Rock';
  if (g.includes('alternative') || g.includes('indie')) return 'Indie';
  if (g.includes('electronic') || g.includes('dance') || g.includes('house') || g.includes('edm')) return 'EDM';
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
  return category === 'thai' ? 'T-Pop' : 'Pop';
}

export function resolveArtistMainGenre(
  songs: Song[],
  category: 'thai' | 'international',
  artistPrimaryGenre?: string
): string {
  const counts = new Map<string, number>();
  for (const s of songs) {
    const g = s.genre || (category === 'thai' ? 'T-Pop' : 'Pop');
    const weight = g === 'Soundtrack' ? 0.3 : g === 'K-Pop' ? 1.6 : 1;
    counts.set(g, (counts.get(g) || 0) + weight);
  }

  if (artistPrimaryGenre) {
    const mapped = mapGenreTag(artistPrimaryGenre, category);
    if (mapped && mapped !== 'Soundtrack') {
      const boost = mapped === 'Pop' || mapped === 'T-Pop' ? 1.5 : Math.max(3, songs.length * 0.35);
      counts.set(mapped, (counts.get(mapped) || 0) + boost);
    }
  }

  let bestGenre = artistPrimaryGenre
    ? mapGenreTag(artistPrimaryGenre, category)
    : category === 'thai'
      ? 'T-Pop'
      : 'Pop';
  let bestScore = -1;
  for (const [genre, score] of counts.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genre;
    }
  }
  return bestGenre;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface ItunesFetchResult {
  songs: Song[];
  rateLimited: boolean;
  artistPrimaryGenre?: string;
  resolvedArtistName?: string;
  resolvedArtistId?: string;
  detectedCategory: 'thai' | 'international';
}

const itunesArtistFetchCache = new Map<string, { expiresAt: number; result: ItunesFetchResult }>();
const inFlightItunesArtistFetches = new Map<string, Promise<ItunesFetchResult>>();
const ITUNES_ARTIST_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        return { results: [], rateLimited: true };
      }

      if (!response.ok) return { results: [] };
      const data = (await response.json()) as { results?: ItunesTrackItem[] };
      return { results: Array.isArray(data?.results) ? data.results : [] };
    } catch {
      if (attempt >= retries) return { results: [] };
    }
  }
  return { results: [] };
}

export async function fetchArtistSongsUpTo200(
  artistQuery: string,
  preferredCategory?: CategoryType,
  maxLimit = 200
): Promise<ItunesFetchResult> {
  const targetLimit = Math.min(200, Math.max(10, maxLimit));
  const cacheKey = `${normalizeText(artistQuery)}::${preferredCategory || 'auto'}::${targetLimit}`;

  // 1. L1 Memory Cache
  const cached = itunesArtistFetchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt && cached.result.songs.length > 0) {
    return cached.result;
  }

  // 2. In-flight Request Deduplication
  const inFlight = inFlightItunesArtistFetches.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async (): Promise<ItunesFetchResult> => {
    const preferThaiStore =
      preferredCategory === 'thai' || isKnownThaiArtistName(artistQuery);

    const countries = preferThaiStore ? ['TH', 'US'] : ['US', 'TH'];
    const rawCollected = new Map<string, { item: ItunesTrackItem; cleanedTitle: string; idx: number }>();
    let rateLimited = false;
    let artistPrimaryGenre: string | undefined;
    let topResolvedArtistName: string | undefined;
    let topResolvedArtistId: string | undefined;

    const collectTracks = (rawTracks: ItunesTrackItem[], resolvedArtistId: number | null) => {
      rawTracks.forEach((item, idx) => {
        if (rawCollected.size >= targetLimit) return;
        if (!item || !item.trackId || !item.trackName || !item.artistName || !item.previewUrl) return;
        if (isJunkTrack(item.trackName, item.collectionName, item.artistName)) return;

        const isArtistMatch = checkArtistStrictMatch(
          item.artistName,
          artistQuery,
          resolvedArtistId,
          item.artistId,
          item.trackName
        );
        if (!isArtistMatch) return;

        const cleanedTitle = cleanTrackTitle(item.trackName);
        if (!cleanedTitle) return;

        const normArtist = normalizeText(item.artistName);
        const dedupeKey = `${normalizeText(cleanedTitle)}__${normArtist}`;
        if (!rawCollected.has(dedupeKey)) {
          rawCollected.set(dedupeKey, { item, cleanedTitle, idx });
        }
      });
    };

    for (let cIdx = 0; cIdx < countries.length; cIdx++) {
      const country = countries[cIdx];
      // Smart early exit: if primary country already found a solid catalog (>= 12 songs or targetLimit), skip secondary country
      if (rawCollected.size >= targetLimit || (cIdx > 0 && rawCollected.size >= 12)) {
        break;
      }

      const artistSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        artistQuery
      )}&country=${country}&media=music&entity=musicArtist&limit=5`;
      const primarySongSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        artistQuery
      )}&country=${country}&media=music&entity=song&limit=${targetLimit}`;

      // Controlled concurrency: run artist lookup and primary song search in parallel
      const [artistRes, primarySongRes] = await Promise.all([
        fetchItunesWithRetry(artistSearchUrl, 1),
        fetchItunesWithRetry(primarySongSearchUrl, 1),
      ]);
      if (artistRes.rateLimited || primarySongRes.rateLimited) rateLimited = true;

      let resolvedArtistId: number | null = null;
      for (const a of artistRes.results || []) {
        const aName = String(a.artistName || '');
        if (checkArtistStrictMatch(aName, artistQuery)) {
          resolvedArtistId = Number(a.artistId) || null;
          if (!topResolvedArtistName && aName.trim()) {
            topResolvedArtistName = aName.trim();
          }
          if (!topResolvedArtistId && resolvedArtistId) {
            topResolvedArtistId = String(resolvedArtistId);
          }
          if (a.primaryGenreName && !artistPrimaryGenre) {
            artistPrimaryGenre = a.primaryGenreName;
          }
          break;
        }
      }

      collectTracks(primarySongRes.results || [], resolvedArtistId);

      // If artistId was resolved and we need more tracks, perform targeted artistId lookup
      if (resolvedArtistId && rawCollected.size < targetLimit) {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&country=${country}&limit=${targetLimit}`;
        const lookupRes = await fetchItunesWithRetry(lookupUrl, 0);
        if (lookupRes.rateLimited) rateLimited = true;
        const lookupTracks: ItunesTrackItem[] = [];
        for (const item of lookupRes.results || []) {
          if (item.wrapperType === 'track' || item.kind === 'song') {
            lookupTracks.push(item);
          } else if (item.wrapperType === 'artist' && item.primaryGenreName && !artistPrimaryGenre) {
            artistPrimaryGenre = item.primaryGenreName;
          }
        }
        collectTracks(lookupTracks, resolvedArtistId);
      }

      // Only query additional alias tokens if we still have very few songs (< 8)
      if (rawCollected.size < 8) {
        const candidateTokens = getArtistCandidateTokens(artistQuery).filter(
          (tok) => tok !== normalizeText(artistQuery)
        );
        const aliasTerms = candidateTokens.slice(0, 2);
        if (aliasTerms.length > 0) {
          const aliasResults = await Promise.all(
            aliasTerms.map((term) =>
              fetchItunesWithRetry(
                `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&entity=song&limit=${targetLimit}`,
                0
              )
            )
          );
          for (const res of aliasResults) {
            if (res.rateLimited) rateLimited = true;
            collectTracks(res.results || [], resolvedArtistId);
          }
        }
      }
    }

    // Determine true artist category from actual iTunes track/artist evidence
    const entries = Array.from(rawCollected.values()).slice(0, targetLimit);
    const thaiTrackEvidenceCount = entries.filter(
      ({ item }) =>
        hasThaiScript(item.trackName || '') ||
        hasThaiScript(item.artistName || '') ||
        hasThaiScript(item.collectionName || '') ||
        isThaiGenreTag(item.primaryGenreName)
    ).length;

    const isArtistThai =
      isKnownThaiArtistName(artistQuery) ||
      (entries[0]?.item.artistName ? isKnownThaiArtistName(entries[0].item.artistName) : false) ||
      isThaiGenreTag(artistPrimaryGenre) ||
      (entries.length > 0 && thaiTrackEvidenceCount / entries.length >= 0.1);

    const detectedCategory: 'thai' | 'international' = isArtistThai ? 'thai' : 'international';

    const songs: Song[] = entries.map(({ item, cleanedTitle, idx }) => {
      const isTrackThai =
        isArtistThai ||
        hasThaiScript(item.trackName || '') ||
        hasThaiScript(item.artistName || '') ||
        hasThaiScript(item.collectionName || '') ||
        isThaiGenreTag(item.primaryGenreName);

      const finalCategory: 'thai' | 'international' = isTrackThai ? 'thai' : 'international';
      const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2020;

      return {
        id: String(item.trackId),
        title: cleanedTitle,
        artistName: item.artistName!.trim(),
        albumName: (item.collectionName || 'Single').trim(),
        releaseYear: Number.isNaN(releaseYear) ? 2020 : releaseYear,
        genre: mapGenreTag(item.primaryGenreName || artistPrimaryGenre, finalCategory),
        category: finalCategory,
        previewUrl: item.previewUrl!,
        artworkUrl: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        trackViewUrl: item.trackViewUrl || '',
        popularityScore: Math.max(10, 100 - Math.floor(idx / 2)),
      };
    });

    const finalResult: ItunesFetchResult = {
      songs,
      rateLimited,
      artistPrimaryGenre,
      resolvedArtistName: topResolvedArtistName,
      resolvedArtistId: topResolvedArtistId,
      detectedCategory,
    };

    if (songs.length > 0) {
      if (itunesArtistFetchCache.size >= 300) {
        const oldest = itunesArtistFetchCache.keys().next().value;
        if (oldest) itunesArtistFetchCache.delete(oldest);
      }
      itunesArtistFetchCache.set(cacheKey, {
        expiresAt: Date.now() + ITUNES_ARTIST_CACHE_TTL_MS,
        result: finalResult,
      });
    }

    return finalResult;
  })();

  inFlightItunesArtistFetches.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightItunesArtistFetches.delete(cacheKey);
  }
}

export interface SyncArtistResponse {
  status: number;
  body: {
    code: number;
    message: string;
    data?: {
      artist: Artist;
      addedCount: number;
      totalFetched: number;
      previousCount?: number;
      newCount?: number;
      added?: number;
      fetched?: number;
      cached?: boolean;
      backgroundProcessing?: boolean;
      jobStatus?: ArtistSyncJob['status'];
      jobId?: string;
    };
  };
}

const inFlightArtistSyncs = new Map<string, Promise<SyncArtistResponse>>();

export function clearItunesMemoryCaches(): void {
  itunesArtistFetchCache.clear();
  inFlightItunesArtistFetches.clear();
  inFlightArtistSyncs.clear();
}

export async function syncArtistSongs(
  query: string,
  preferredCategory?: CategoryType,
  maxLimit = 200,
  options?: { forceRefresh?: boolean } | boolean
): Promise<SyncArtistResponse> {
  const forceRefresh = typeof options === 'boolean' ? options : Boolean(options?.forceRefresh);
  const cleanQuery = (query || '').trim();
  const normKey = `${normalizeText(cleanQuery)}::${maxLimit}`;

  // 1. Prevent concurrent duplicate sync operations (coalesce identical in-flight requests)
  const activeSync = inFlightArtistSyncs.get(normKey);
  if (activeSync) {
    return activeSync;
  }

  const syncTask = (async (): Promise<SyncArtistResponse> => {
    const { dbService } = await import('./db');
    const { songPool } = await import('./engine/songPool');
    const {
      addCustomArtist,
      getAllArtists,
      extractSoloArtistNames,
      cleanArtistDisplayName,
      buildCanonicalArtistId,
      parseTrackArtistCredits,
    } = await import('./engine/artists');
    const { invalidateArtistsServerCache } = await import('./engine/artistRoutes');

    const queriedSoloNames = extractSoloArtistNames(cleanQuery);
    const primaryQueryName = queriedSoloNames[0] || cleanArtistDisplayName(cleanQuery) || cleanQuery;

    const slugBase = normalizeText(primaryQueryName).replace(/\s+/g, '_') || `custom_${Date.now()}`;
    const defaultArtistSlug = `artist_${slugBase}`;
    const jobId = `job_${slugBase}`;

    // Check existing artist & songs in persistent cache (SQLite / Memory / Supabase)
    const knownInLibrary = getAllArtists(songPool).find(
      (a) =>
        (checkArtistStrictMatch(a.name, primaryQueryName) ||
          normalizeText(a.name) === normalizeText(primaryQueryName)) &&
        extractSoloArtistNames(a.name).length === 1
    );
    const existingLocalSongs = dbService
      .searchSongs(primaryQueryName, { artist: primaryQueryName, limit: 250 })
      .filter((s) => checkArtistStrictMatch(s.artistName, primaryQueryName, undefined, undefined, s.title));

    let existingArtist = knownInLibrary || null;
    if (!existingArtist && isSupabaseConfigured()) {
      const found = await supabaseAdmin.findArtist(primaryQueryName);
      if (found && extractSoloArtistNames(found.name).length === 1) {
        existingArtist = found;
      }
    }

    const previousCount = Math.max(existingArtist?.trackCount || 0, existingLocalSongs.length);
    const initialCategory: 'thai' | 'international' =
      existingArtist?.category ||
      (isKnownThaiArtistName(cleanQuery)
        ? 'thai'
        : preferredCategory === 'international'
          ? 'international'
          : 'thai');

    // Step A: Register artist and create/update persistent job ('pending' -> 'processing') BEFORE iTunes network fetch
    const existingJob =
      dbService.getSyncJob(jobId) ||
      (isSupabaseConfigured() ? await supabaseAdmin.getSyncJob(jobId) : null);

    // Check if another worker holds an active lock
    if (
      existingJob &&
      existingJob.status === 'processing' &&
      existingJob.lockedUntil &&
      existingJob.lockedUntil > Date.now() &&
      previousCount > 0
    ) {
      const lockedArtist: Artist = existingArtist || {
        id: existingJob.artistId || defaultArtistSlug,
        name: existingJob.artistName || cleanQuery,
        category: existingJob.category,
        mainGenre: 'Pop',
        avatarUrl: existingLocalSongs[0]?.artworkUrl || '',
        isCustom: true,
        trackCount: previousCount,
      };
      return {
        status: 200,
        body: {
          code: 0,
          message: 'ok',
          data: {
            artist: lockedArtist,
            addedCount: 0,
            totalFetched: previousCount,
            previousCount,
            newCount: previousCount,
            added: 0,
            fetched: previousCount,
            jobStatus: 'processing',
            jobId,
          },
        },
      };
    }

    // Fast Cache Path: If persistent DB already has enough songs (>= maxLimit or >= 35 for public 50-limit) and not forced, serve immediately!
    if (
      !forceRefresh &&
      existingLocalSongs.length >= Math.min(maxLimit, 35) &&
      existingArtist
    ) {
      for (const s of existingLocalSongs) {
        songPool.set(s.id, s);
      }
      const cachedArtist: Artist = {
        ...existingArtist,
        avatarUrl: existingArtist.avatarUrl || existingLocalSongs[0]?.artworkUrl || '',
        trackCount: Math.max(previousCount, existingLocalSongs.length),
      };
      addCustomArtist(cachedArtist);
      invalidateArtistsServerCache(cachedArtist);

      const completedJob: ArtistSyncJob = {
        id: jobId,
        artistId: cachedArtist.id,
        artistName: cachedArtist.name,
        category: cachedArtist.category,
        status: 'completed',
        maxLimit,
        fetchedCount: existingLocalSongs.length,
        addedCount: 0,
        attempts: (existingJob?.attempts || 0) + 1,
        lastError: null,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      };
      dbService.upsertSyncJob(completedJob);

      return {
        status: 200,
        body: {
          code: 0,
          message: 'ok',
          data: {
            artist: cachedArtist,
            addedCount: 0,
            totalFetched: existingLocalSongs.length,
            previousCount,
            newCount: cachedArtist.trackCount || existingLocalSongs.length,
            added: 0,
            fetched: existingLocalSongs.length,
            cached: true,
            backgroundProcessing: false,
            jobStatus: 'completed',
            jobId,
          },
        },
      };
    }

    // Persist 'processing' job state with lock
    const processingJob: ArtistSyncJob = {
      id: jobId,
      artistId: existingArtist?.id || defaultArtistSlug,
      artistName: existingArtist?.name || cleanQuery,
      category: initialCategory,
      status: 'processing',
      maxLimit,
      fetchedCount: existingLocalSongs.length,
      addedCount: 0,
      attempts: (existingJob?.attempts || 0) + 1,
      lastError: null,
      lockedUntil: Date.now() + SYNC_LOCK_TTL_MS,
      updatedAt: new Date().toISOString(),
    };
    dbService.upsertSyncJob(processingJob);

    try {
      const {
        songs: fetchedSongs,
        rateLimited,
        artistPrimaryGenre,
        resolvedArtistName,
        resolvedArtistId,
        detectedCategory,
      } = await fetchArtistSongsUpTo200(primaryQueryName, preferredCategory, maxLimit);

      if (fetchedSongs.length === 0) {
        // Fallback: if DB already has songs for this artist, preserve & return them instead of failing!
        if (existingLocalSongs.length > 0) {
          const fallbackSoloName =
            existingArtist?.name ||
            extractSoloArtistNames(existingLocalSongs[0].artistName).find((n) =>
              checkArtistStrictMatch(n, primaryQueryName)
            ) ||
            cleanArtistDisplayName(primaryQueryName);
          const fallbackArtist: Artist = existingArtist || {
            id: buildCanonicalArtistId(fallbackSoloName),
            name: fallbackSoloName,
            category: existingLocalSongs[0].category,
            mainGenre: existingLocalSongs[0].genre,
            avatarUrl: existingLocalSongs[0].artworkUrl,
            isCustom: true,
            trackCount: existingLocalSongs.length,
          };
          addCustomArtist(fallbackArtist);
          invalidateArtistsServerCache(fallbackArtist);
          dbService.upsertSyncJob({
            ...processingJob,
            status: 'completed',
            fetchedCount: existingLocalSongs.length,
            lockedUntil: null,
            updatedAt: new Date().toISOString(),
          });
          return {
            status: 200,
            body: {
              code: 0,
              message: 'ok',
              data: {
                artist: fallbackArtist,
                addedCount: 0,
                totalFetched: existingLocalSongs.length,
                previousCount,
                newCount: existingLocalSongs.length,
                added: 0,
                fetched: existingLocalSongs.length,
                jobStatus: 'completed',
                jobId,
              },
            },
          };
        }

        const errMsg = rateLimited
          ? 'iTunes API มีผู้ใช้งานหนาแน่น (Rate Limit) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
          : `ไม่พบเพลงที่มีตัวอย่างเสียงของ "${cleanQuery}" บน iTunes`;

        dbService.upsertSyncJob({
          ...processingJob,
          status: 'failed',
          lastError: errMsg,
          lockedUntil: null,
          updatedAt: new Date().toISOString(),
        });

        return {
          status: rateLimited ? 429 : 404,
          body: {
            code: rateLimited ? -429 : -1,
            message: errMsg,
          },
        };
      }

      const primarySample = fetchedSongs[0];
      // Resolve a strictly solo/band canonicalName — NEVER a combined collaboration string
      let canonicalName = existingArtist?.name || '';
      if (!canonicalName || extractSoloArtistNames(canonicalName).length > 1) {
        if (
          resolvedArtistName &&
          extractSoloArtistNames(resolvedArtistName).length === 1 &&
          checkArtistStrictMatch(resolvedArtistName, primaryQueryName)
        ) {
          canonicalName = cleanArtistDisplayName(resolvedArtistName);
        } else {
          let matchedSoloCredit = '';
          for (const s of fetchedSongs) {
            const credits = parseTrackArtistCredits(s.id, s.artistName, s.title);
            const hit = credits.find(
              (c) =>
                checkArtistStrictMatch(c.artistName, primaryQueryName) &&
                extractSoloArtistNames(c.artistName).length === 1
            );
            if (hit) {
              matchedSoloCredit = hit.artistName;
              break;
            }
          }
          canonicalName = matchedSoloCredit || cleanArtistDisplayName(primaryQueryName);
        }
      }

      const artistId = existingArtist?.id || buildCanonicalArtistId(canonicalName);
      const resolvedMainGenre = resolveArtistMainGenre(
        fetchedSongs,
        detectedCategory,
        artistPrimaryGenre
      );

      const songsWithArtist: Song[] = fetchedSongs.map((s) => {
        const parsedCredits = parseTrackArtistCredits(s.id, s.artistName, s.title, {
          id: artistId,
          name: canonicalName,
        });
        const existingInPool = songPool.get(s.id);
        const mergedCreditsMap = new Map<string, (typeof parsedCredits)[number]>();
        if (existingInPool?.artists) {
          for (const ec of existingInPool.artists) {
            mergedCreditsMap.set(ec.artistId, ec);
          }
        }
        for (const pc of parsedCredits) {
          mergedCreditsMap.set(pc.artistId, pc);
        }
        const finalCredits = Array.from(mergedCreditsMap.values()).sort(
          (a, b) => a.position - b.position
        );
        return {
          ...s,
          artistId: finalCredits[0]?.artistId || artistId,
          artistIds: finalCredits.map((c) => c.artistId),
          artists: finalCredits,
        };
      });

      // Save to local SQLite (songs + track_artists) & in-memory songPool immediately
      dbService.saveSongs(songsWithArtist, false);
      for (const s of songsWithArtist) {
        songPool.set(s.id, s);
      }

      // If the user explicitly queried a collaboration string (e.g. "ROSÉ & Bruno Mars"),
      // register every collaborating artist as an independent selectable artist too.
      if (queriedSoloNames.length > 1) {
        for (const extraRaw of queriedSoloNames.slice(1)) {
          const extraName = cleanArtistDisplayName(extraRaw);
          if (!extraName || normalizeText(extraName) === normalizeText(canonicalName)) continue;
          const extraId = buildCanonicalArtistId(extraName);
          const extraSongs = songsWithArtist.filter((s) =>
            s.artists?.some(
              (c) => c.artistId === extraId || checkArtistStrictMatch(c.artistName, extraName)
            )
          );
          if (extraSongs.length > 0) {
            const extraArtist: Artist = {
              id: extraId,
              name: extraName,
              category: detectedCategory,
              mainGenre: resolvedMainGenre,
              avatarUrl: extraSongs[0]?.artworkUrl || primarySample.artworkUrl || '',
              isCustom: true,
              trackCount: extraSongs.length,
            };
            dbService.saveCustomArtist(extraArtist, false);
            addCustomArtist(extraArtist);
            invalidateArtistsServerCache(extraArtist);
          }
        }
      }

      const newCount = Math.max(previousCount, songsWithArtist.length);
      const addedCount = Math.max(0, newCount - previousCount);

      const finalArtist: Artist = {
        id: artistId,
        itunesArtistId: resolvedArtistId || existingArtist?.itunesArtistId,
        name: canonicalName,
        category: detectedCategory,
        mainGenre: resolvedMainGenre,
        avatarUrl: primarySample.artworkUrl || existingArtist?.avatarUrl || '',
        isCustom: existingArtist ? existingArtist.isCustom : true,
        trackCount: newCount,
      };

      // Register artist immediately in local DB and memory cache
      dbService.saveCustomArtist(finalArtist, false);
      addCustomArtist(finalArtist);
      invalidateArtistsServerCache(finalArtist);

      // Sync to Supabase if configured (parallelized chunks, fast & bounded)
      if (isSupabaseConfigured()) {
        await supabaseAdmin.upsertArtist(finalArtist);
        const upsertedCount = await supabaseAdmin.upsertSongs(songsWithArtist, CHUNK_SIZE);
        if (upsertedCount < songsWithArtist.length) {
          // Partial failure recovery: mark job as 'pending' so remaining songs can be retried
          dbService.upsertSyncJob({
            ...processingJob,
            artistId: finalArtist.id,
            artistName: finalArtist.name,
            category: finalArtist.category,
            status: 'pending',
            fetchedCount: songsWithArtist.length,
            addedCount: upsertedCount,
            lastError: `Partial sync (${upsertedCount}/${songsWithArtist.length} songs saved to cloud)`,
            lockedUntil: null,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const cloudCount = await supabaseAdmin.refreshArtistTrackCount(
            canonicalName,
            finalArtist.avatarUrl
          );
          if (cloudCount > finalArtist.trackCount!) {
            finalArtist.trackCount = cloudCount;
            addCustomArtist(finalArtist);
            invalidateArtistsServerCache(finalArtist);
          }
          dbService.upsertSyncJob({
            ...processingJob,
            artistId: finalArtist.id,
            artistName: finalArtist.name,
            category: finalArtist.category,
            status: 'completed',
            fetchedCount: songsWithArtist.length,
            addedCount,
            lastError: null,
            lockedUntil: null,
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        dbService.upsertSyncJob({
          ...processingJob,
          artistId: finalArtist.id,
          artistName: finalArtist.name,
          category: finalArtist.category,
          status: 'completed',
          fetchedCount: songsWithArtist.length,
          addedCount,
          lastError: null,
          lockedUntil: null,
          updatedAt: new Date().toISOString(),
        });
      }

      return {
        status: 200,
        body: {
          code: 0,
          message: 'ok',
          data: {
            artist: finalArtist,
            addedCount,
            totalFetched: songsWithArtist.length,
            previousCount,
            newCount: finalArtist.trackCount || newCount,
            added: addedCount,
            fetched: songsWithArtist.length,
            backgroundProcessing: false,
            jobStatus: 'completed',
            jobId,
          },
        },
      };
    } catch (err) {
      const errMsg = (err as Error)?.message || 'Unknown sync error';
      dbService.upsertSyncJob({
        ...processingJob,
        status: 'failed',
        lastError: errMsg,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      });
      throw err;
    }
  })();

  inFlightArtistSyncs.set(normKey, syncTask);
  try {
    return await syncTask;
  } finally {
    inFlightArtistSyncs.delete(normKey);
  }
}

/**
 * Recover and retry any pending, failed, or stale processing artist sync jobs
 */
export async function recoverPendingArtistSyncJobs(maxJobs = 3): Promise<ArtistSyncJob[]> {
  const { dbService } = await import('./db');
  const jobs = dbService.getRecoverableSyncJobs(maxJobs).filter((j) => j.attempts < 5);
  const completed: ArtistSyncJob[] = [];

  for (const job of jobs) {
    try {
      await syncArtistSongs(job.artistName, job.category, job.maxLimit, { forceRefresh: true });
      const updated = dbService.getSyncJob(job.id);
      if (updated) completed.push(updated);
    } catch {}
  }
  return completed;
}

