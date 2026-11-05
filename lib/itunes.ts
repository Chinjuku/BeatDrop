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
  return (value || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\.?|ft\.?/gi, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  const result = new Set<string>();

  const baseNorm = normalizeText(name);
  if (baseNorm) result.add(baseNorm);

  // Extract from parentheses e.g. "ไททศสมิธ (TaitosmitH)" -> ["ไททศสมิธ", "TaitosmitH"]
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

  // Also split by / or & or | if present in name
  const slashes = name.split(/[\/|]/).map((s) => normalizeText(s.trim())).filter(Boolean);
  for (const s of slashes) result.add(s);

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

  return Array.from(result);
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
      const imposter = new RegExp(`^${target}\\s+(music|song|songs|band|orchestra|project|experience|records|tribute|cover|soundtrack)$`, 'i');
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
  preferredCategory?: CategoryType,
  maxLimit = 200
): Promise<{ songs: Song[]; rateLimited: boolean; artistPrimaryGenre?: string; detectedCategory: 'thai' | 'international' }> {
  const targetLimit = Math.min(200, Math.max(10, maxLimit));
  const preferThaiStore =
    preferredCategory === 'thai' || isKnownThaiArtistName(artistQuery);

  const countries = preferThaiStore ? ['TH', 'US'] : ['US', 'TH'];
  const rawCollected = new Map<string, { item: ItunesTrackItem; cleanedTitle: string; idx: number }>();
  let rateLimited = false;
  let artistPrimaryGenre: string | undefined;

  for (const country of countries) {
    if (rawCollected.size >= targetLimit) break;

    const artistSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      artistQuery
    )}&country=${country}&media=music&entity=musicArtist&limit=5`;
    const artistRes = await fetchItunesWithRetry(artistSearchUrl);
    if (artistRes.rateLimited) rateLimited = true;

    let resolvedArtistId: number | null = null;
    for (const a of artistRes.results || []) {
      const aName = String(a.artistName || '');
      if (checkArtistStrictMatch(aName, artistQuery)) {
        resolvedArtistId = Number(a.artistId) || null;
        if (a.primaryGenreName && !artistPrimaryGenre) {
          artistPrimaryGenre = a.primaryGenreName;
        }
        break;
      }
    }

    const rawTracks: ItunesTrackItem[] = [];

    if (resolvedArtistId) {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${resolvedArtistId}&entity=song&country=${country}&limit=${targetLimit}`;
      const lookupRes = await fetchItunesWithRetry(lookupUrl);
      if (lookupRes.rateLimited) rateLimited = true;
      for (const item of lookupRes.results || []) {
        if (item.wrapperType === 'track' || item.kind === 'song') {
          rawTracks.push(item);
        } else if (item.wrapperType === 'artist' && item.primaryGenreName && !artistPrimaryGenre) {
          artistPrimaryGenre = item.primaryGenreName;
        }
      }
    }

    if (rawTracks.length < targetLimit) {
      const candidateTokens = getArtistCandidateTokens(artistQuery);
      const searchTerms = Array.from(new Set([artistQuery, ...candidateTokens.slice(0, 3)]));

      for (const term of searchTerms) {
        if (rawTracks.length >= targetLimit) break;
        const songSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
          term
        )}&country=${country}&media=music&entity=song&limit=${targetLimit}`;
        const songRes = await fetchItunesWithRetry(songSearchUrl);
        if (songRes.rateLimited) rateLimited = true;
        rawTracks.push(...(songRes.results || []));
      }
    }

    rawTracks.forEach((item, idx) => {
      if (rawCollected.size >= targetLimit) return;
      if (!item.trackId || !item.trackName || !item.artistName || !item.previewUrl) return;

      // Discard junk tracks (karaoke, tribute, lullaby, sleep, music box, etc.)
      if (isJunkTrack(item.trackName, item.collectionName, item.artistName)) return;

      const normArtist = normalizeText(item.artistName);
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

      const dedupeKey = `${normalizeText(cleanedTitle)}__${normArtist}`;
      if (rawCollected.has(dedupeKey)) return;

      rawCollected.set(dedupeKey, { item, cleanedTitle, idx });
    });
  }

  // Determine true artist category from actual iTunes track/artist evidence (never blindly forced by UI tab)
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

  return { songs, rateLimited, artistPrimaryGenre, detectedCategory };
}

export async function syncArtistSongs(
  query: string,
  preferredCategory?: CategoryType,
  maxLimit = 200
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
  const {
    songs: fetchedSongs,
    rateLimited,
    artistPrimaryGenre,
    detectedCategory,
  } = await fetchArtistSongsUpTo200(query, preferredCategory, maxLimit);

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
  const resolvedMainGenre = resolveArtistMainGenre(fetchedSongs, detectedCategory, artistPrimaryGenre);

  // Helper to immediately sync in-memory caches for real-time query invalidation
  const syncInMemoryCaches = async (artistObj: Artist) => {
    try {
      const { songPool } = await import('./engine/songPool');
      for (const s of fetchedSongs) {
        songPool.set(s.id, s);
      }
      const { addCustomArtist } = await import('./engine/artists');
      addCustomArtist(artistObj);
      const { invalidateArtistsServerCache } = await import('./engine/artistRoutes');
      invalidateArtistsServerCache(artistObj);
    } catch (err) {
      console.error('Failed to sync in-memory caches:', err);
    }
  };

  if (isSupabaseConfigured()) {
    const existingArtist = await supabaseAdmin.findArtist(canonicalName);
    const previousCount = existingArtist?.trackCount || 0;

    const initialArtist: Artist = {
      id: existingArtist?.id || artistSlug,
      name: canonicalName,
      category: detectedCategory,
      mainGenre: resolvedMainGenre,
      avatarUrl: primarySample.artworkUrl,
      isCustom: existingArtist ? existingArtist.isCustom : true,
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
            const totalCount = await supabaseAdmin.refreshArtistTrackCount(canonicalName, initialArtist.id);
            await syncInMemoryCaches({ ...initialArtist, trackCount: totalCount });
          } catch (bgErr) {
            console.error('[Sync Background Ingestion Error]', bgErr);
          }
        })();

        const estimatedTotal = Math.max(previousCount, fetchedSongs.length);
        const estimatedArtist = { ...initialArtist, trackCount: estimatedTotal };
        await syncInMemoryCaches(estimatedArtist);

        return {
          status: 202,
          body: {
            code: 0,
            message: 'กำลังซิงค์เพลงที่เหลือในพื้นหลัง (Background Ingestion)',
            data: {
              artist: estimatedArtist,
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
    const finalArtist = { ...initialArtist, trackCount: finalTrackCount };
    await syncInMemoryCaches(finalArtist);

    return {
      status: 200,
      body: {
        code: 0,
        message: 'ok',
        data: {
          artist: finalArtist,
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
    category: detectedCategory,
    mainGenre: resolvedMainGenre,
    avatarUrl: primarySample.artworkUrl,
    isCustom: true,
    trackCount: totalArtistTracks,
  };
  dbService.saveCustomArtist(customArtist);
  await syncInMemoryCaches(customArtist);

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

