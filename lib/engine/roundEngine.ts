import type { ApiRequest, ApiResponse } from '../http/api';
import crypto from 'node:crypto';
import {
  CategoryType,
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GameMode,
  MAX_SNIPPET_DURATION,
  MIN_SNIPPET_DURATION,
  DAILY_ALLOWED_TIME_MS,
  SONGSPOT_STAGES,
  RoundActionResponse,
  RoundStartResponse,
  Song,
} from '../../shared/types';
import { signRoundToken, verifyRoundToken } from '../token';
import { parseGuessDTO, parseSkipDTO } from '../../shared/validation';
import { dbService } from '../db';
import { checkArtistStrictMatch, isJunkTrack } from '../itunes';
import { songPool, ingestArtistSongs, fetchItunesSongs } from './songPool';
import { buildCanonicalArtistId, getAllArtists, normalizeText } from './artists';
import { redis, isRedisConfigured } from '../redis';
import { isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { readDailyPlayerId } from './dailySession';
import { finalizeDailyRound, isDailyRoundExpired } from './dailyScoring';
import { scopePlayerIdByDifficulty } from './dailyEngine';
import { selectGuesserChoices } from './guesserChoices';

export interface ActiveRoundState {
  track: Song;
  difficulty: DifficultyLevel;
  stages: number[];
  stage: number;
  clipSeconds: number;
  mistakes: number;
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
  startedAt?: number;
  dailyDateKey?: string;
  dailyRoundIndex?: number;
  dailyPlayerId?: string;
  roundId?: string;
}

export const activeRounds = new Map<string, ActiveRoundState>();

let cachedValidLibraryPool: Song[] = [];
let lastValidPoolSize = -1;
let lastValidArtistsCount = -1;

function getValidLibraryPool(): Song[] {
  const libraryArtists = getAllArtists(songPool);
  if (
    cachedValidLibraryPool.length > 0 &&
    songPool.size === lastValidPoolSize &&
    libraryArtists.length === lastValidArtistsCount
  ) {
    return cachedValidLibraryPool;
  }

  const libraryArtistIdSet = new Set(libraryArtists.map((a) => a.id));
  const libraryArtistNormSet = new Set(libraryArtists.map((a) => normalizeText(a.name)));
  const artistMatchByRawName = new Map<string, boolean>();
  const valid: Song[] = [];
  for (const s of songPool.values()) {
    if (isJunkTrack(s.title, s.albumName, s.artistName)) continue;
    let matched = false;
    if (s.artists && s.artists.length > 0) {
      matched = s.artists.some(
        (c) =>
          libraryArtistIdSet.has(c.artistId) || libraryArtistNormSet.has(normalizeText(c.artistName))
      );
    }
    if (!matched) {
      const cachedMatch = artistMatchByRawName.get(s.artistName);
      if (cachedMatch !== undefined) {
        matched = cachedMatch;
      } else {
        matched = libraryArtists.some((a) => checkArtistStrictMatch(s.artistName, a.name));
        artistMatchByRawName.set(s.artistName, matched);
      }
    }
    if (!matched && /\((?:feat\.?|ft\.?|featuring|with|ร่วมกับ)\s+/i.test(s.title)) {
      matched = libraryArtists.some((a) =>
        checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title)
      );
    }
    if (matched) {
      valid.push(s);
    }
  }

  cachedValidLibraryPool = valid;
  lastValidPoolSize = songPool.size;
  lastValidArtistsCount = libraryArtists.length;
  return valid;
}

// Replay attack protection: record tokens once consumed to prevent duplicate guessing/score pumping
const consumedRoundTokens = new Set<string>();
const MAX_CONSUMED_TOKENS = 10_000;

async function isTokenConsumed(token: string): Promise<boolean> {
  if (!token) return true;
  if (consumedRoundTokens.has(token)) return true;
  if (isRedisConfigured && redis) {
    try {
      const exists = await redis.get(`beatdrop:token:${token}`);
      if (exists) return true;
    } catch {}
  }
  return false;
}

function consumeToken(token: string) {
  if (!token) return;
  if (consumedRoundTokens.size >= MAX_CONSUMED_TOKENS) {
    const oldest = consumedRoundTokens.keys().next().value;
    if (oldest) consumedRoundTokens.delete(oldest);
  }
  consumedRoundTokens.add(token);

  if (isRedisConfigured && redis) {
    redis.set(`beatdrop:token:${token}`, '1', { ex: 3600 }).catch(() => {});
  }
}

export function parseCustomStages(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n >= MIN_SNIPPET_DURATION && n <= MAX_SNIPPET_DURATION);
  if (parts.length >= 2) {
    const unique = Array.from(new Set(parts)).sort((a, b) => a - b);
    return unique.length >= 2 ? unique : null;
  }
  return null;
}

export function matchesYearFilter(song: Song, yearFilter?: string): boolean {
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

function normalizeGenreComparison(g: string): string {
  const s = g.toLowerCase().trim();
  if (s.includes('hip-hop') || s.includes('rap')) return 'hip-hop';
  if (s.includes('r&b') || s.includes('soul')) return 'r&b';
  if (s.includes('indie') || s.includes('alt')) return 'indie';
  if (s.includes('edm') || s.includes('dance') || s.includes('electro') || s.includes('house')) return 'edm';
  if (s.includes('soundtrack') || s.includes('score')) return 'soundtrack';
  if (s.includes('k-pop') || s.includes('kpop')) return 'k-pop';
  if (s.includes('t-pop') || s.includes('tpop')) return 't-pop';
  if (s.includes('rock') || s.includes('metal') || s.includes('punk')) return 'rock';
  if (s.includes('pop')) return 'pop';
  return s;
}

export function matchesGenreFilter(song: Song, genreFilter?: string): boolean {
  if (!genreFilter || genreFilter === 'any') return true;
  const target = normalizeGenreComparison(genreFilter);
  const actual = normalizeGenreComparison(song.genre);
  const songCat = song.category;

  if (target === 't-pop') {
    return songCat === 'thai' && (actual === 't-pop' || actual === 'pop');
  }
  if (target === 'pop') {
    return actual === 'pop' || (songCat === 'thai' && actual === 't-pop');
  }
  return actual === target || actual.includes(target) || target.includes(actual);
}

export function matchesArtistFilter(song: Song, artistName?: string): boolean {
  if (!artistName || artistName === 'any') return true;
  const targetId = buildCanonicalArtistId(artistName);
  if (song.artists && song.artists.length > 0) {
    if (
      song.artists.some(
        (c) =>
          c.artistId === artistName ||
          c.artistId === targetId ||
          checkArtistStrictMatch(c.artistName, artistName)
      )
    ) {
      return true;
    }
  }
  if (song.artistIds && song.artistIds.length > 0) {
    if (song.artistIds.includes(artistName) || song.artistIds.includes(targetId)) {
      return true;
    }
  }
  return checkArtistStrictMatch(song.artistName, artistName, undefined, undefined, song.title);
}

export async function handleStartRound(req: ApiRequest, res: ApiResponse): Promise<void> {
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

  if (artistFilter && artistFilter !== 'any') {
    let existingForArtist = Array.from(songPool.values()).filter((s) =>
      matchesArtistFilter(s, artistFilter)
    );
    // 1. Try preloading from Supabase if songs already exist in Cloud DB
    if (existingForArtist.length === 0 && isSupabaseConfigured()) {
      try {
        const supaSongs = await supabaseAdmin.findSongsByArtist(artistFilter, 200);
        for (const s of supaSongs) {
          songPool.set(s.id, s);
        }
        existingForArtist = Array.from(songPool.values()).filter((s) =>
          matchesArtistFilter(s, artistFilter)
        );
      } catch (err) {
        console.warn('[RoundEngine] Supabase song lookup failed:', err);
      }
    }
    // 2. Cache-first: only query external iTunes if zero songs exist in memory/DB
    if (existingForArtist.length === 0) {
      const knownArtist = getAllArtists(songPool).find((a) =>
        matchesArtistFilter({ artistName: a.name } as Song, artistFilter)
      );
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
        50
      );
    }
  }

  const hasArtistFilter = Boolean(artistFilter && artistFilter !== 'any');
  // An explicitly chosen artist can exist only in the cloud catalog (added through Supabase),
  // so it may be missing from this instance's local library list. Artist rounds therefore draw
  // from every loaded non-junk song; the library-gated pool is for the open modes only.
  let pool = hasArtistFilter
    ? Array.from(songPool.values()).filter((s) => !isJunkTrack(s.title, s.albumName, s.artistName))
    : getValidLibraryPool();

  if (!hasArtistFilter) {
    if (category === 'thai' || category === 'international') {
      pool = pool.filter((s) => s.category === category);
    }
  }

  let candidates: Song[] = [];
  if (artistFilter && artistFilter !== 'any') {
    candidates = pool.filter((s) => matchesArtistFilter(s, artistFilter));
    if (candidates.length === 0) {
      const dbMatches = dbService
        .searchSongs(artistFilter, { artist: artistFilter, limit: 200 })
        .filter((s) => matchesArtistFilter(s, artistFilter) && !isJunkTrack(s.title, s.albumName, s.artistName));
      for (const m of dbMatches) {
        songPool.set(m.id, m);
      }
      candidates = dbMatches;
    }
  } else {
    candidates = pool;
  }

  if (mode !== 'artist') {
    if (yearFilter && yearFilter !== 'any') {
      const yearMatches = candidates.filter((s) => matchesYearFilter(s, yearFilter));
      if (yearMatches.length > 0) {
        candidates = yearMatches;
      }
    }
    if (genreFilter && genreFilter !== 'any') {
      const genreMatches = candidates.filter((s) => matchesGenreFilter(s, genreFilter));
      if (genreMatches.length > 0) {
        candidates = genreMatches;
      }
    }
  }

  if (candidates.length === 0) {
    if (artistFilter && artistFilter !== 'any') {
      candidates = pool.filter((s) => matchesArtistFilter(s, artistFilter));
    } else if (category === 'thai' || category === 'international') {
      candidates = pool.filter((s) => s.category === category);
    } else {
      candidates = pool;
    }
  }

  if (candidates.length === 0) {
    res.status(404).json({
      code: -1,
      message: 'ไม่พบเพลงที่ตรงกับตัวกรองที่เลือก กรุณาลองเลือกแนวเพลงหรือปีอื่น',
    });
    return;
  }

  const totalMatchingPoolSize = candidates.length;

  // 1. Deduplicate candidates by normalized title + artist (prevents Single vs Album / Remastered duplicates)
  const uniqueByTitle = new Map<string, Song>();
  for (const s of candidates) {
    const key = `${normalizeText(s.title)}::${normalizeText(s.artistName)}`;
    const existing = uniqueByTitle.get(key);
    if (!existing || (s.popularityScore || 50) > (existing.popularityScore || 50)) {
      uniqueByTitle.set(key, s);
    }
  }
  candidates = Array.from(uniqueByTitle.values());

  // 2. Build excluded ID set AND excluded normalized title+artist set so different trackIds of the same song never repeat
  const excludeIdSet = new Set(excludeIds);
  const excludedTitleKeys = new Set<string>();
  for (const exId of excludeIds) {
    const known = songPool.get(exId) || candidates.find((c) => String(c.id) === exId);
    if (known) {
      excludedTitleKeys.add(`${normalizeText(known.title)}::${normalizeText(known.artistName)}`);
    }
  }

  // 3. Remove all previously played songs FIRST before slicing by difficulty
  const unplayedCandidates = candidates.filter(
    (s) =>
      !excludeIdSet.has(String(s.id)) &&
      !excludedTitleKeys.has(`${normalizeText(s.title)}::${normalizeText(s.artistName)}`)
  );

  if (unplayedCandidates.length > 0) {
    candidates = unplayedCandidates;
  } else if (candidates.length > 1 && excludeIds.length > 0) {
    // Entire catalog exhausted: avoid repeating the most recently played songs
    const recentIds = new Set(excludeIds.slice(-Math.max(1, Math.min(8, candidates.length - 1))));
    const notRecent = candidates.filter((s) => !recentIds.has(String(s.id)));
    if (notRecent.length > 0) {
      candidates = notRecent;
    }
  }

  // 4. Slice unplayed pool by difficulty (automatically advances through deeper catalog as top hits are played)
  if (candidates.length > 8) {
    const sorted = [...candidates].sort(
      (a, b) => (b.popularityScore || 50) - (a.popularityScore || 50)
    );
    if (difficulty === 'easy') {
      candidates = sorted.slice(0, Math.max(8, Math.ceil(sorted.length * 0.25)));
    } else if (difficulty === 'medium') {
      candidates = sorted.slice(0, Math.max(12, Math.ceil(sorted.length * 0.60)));
    } else if (difficulty === 'hard') {
      candidates = sorted.slice(Math.floor(sorted.length * 0.15));
    } else if (difficulty === 'expert' || difficulty === 'impossible') {
      candidates = sorted.slice(Math.floor(sorted.length * 0.35));
    }
  }

  let selectedTrack = candidates[Math.floor(Math.random() * candidates.length)];
  let choices: Array<{ id: string; title: string; artistName: string; artworkUrl?: string }> | undefined;
  if (mode === 'guesser') {
    const guesserRound = selectGuesserChoices(candidates);
    if (!guesserRound) {
      res.status(503).json({ code: -503, message: 'Not enough distinct artists with compatible answer metadata for Song Guesser.' });
      return;
    }
    selectedTrack = guesserRound.answer;
    choices = guesserRound.choices;
  }
  const roundId = mode === 'guesser' ? crypto.randomUUID() : undefined;
  const roundState: ActiveRoundState = {
    track: selectedTrack,
    difficulty,
    stages: roundStages,
    stage: 0,
    clipSeconds: roundStages[0],
    mistakes: 0,
    category,
    mode,
    artistFilter: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
    startedAt: Date.now(),
    roundId,
  };
  const roundToken = signRoundToken(roundState);
  const roundKey = `rk_${crypto.randomUUID()}`;

  activeRounds.set(roundToken, roundState);

  const responsePayload: RoundStartResponse = {
    roundToken,
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
    roundKey: mode === 'guesser' ? `rk_${roundId}` : roundKey,
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

export async function handleAutocomplete(req: ApiRequest, res: ApiResponse): Promise<void> {
  const q = ((req.query.q as string) || '').trim();
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const artistFilter = ((req.query.artist as string) || '').trim();
  const limit = Math.min(60, Math.max(1, parseInt((req.query.limit as string) || '10', 10)));

  if (artistFilter && artistFilter !== 'any') {
    const existing = Array.from(songPool.values()).filter((s) => matchesArtistFilter(s, artistFilter));
    // Cache-first: do not hit iTunes during autocomplete if songs already exist in library
    if (existing.length === 0) {
      const knownArtist = getAllArtists(songPool).find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const targetCat = knownArtist?.category || (category === 'international' ? 'international' : 'thai');
      await ingestArtistSongs(
        {
          id: 'temp-auto',
          name: artistFilter,
          category: targetCat,
          mainGenre: knownArtist?.mainGenre || 'Pop',
          avatarUrl: knownArtist?.avatarUrl || '',
        },
        50
      );
    }
  }

  let pool = Array.from(songPool.values());

  if (artistFilter && artistFilter !== 'any') {
    pool = pool.filter((s) => matchesArtistFilter(s, artistFilter));
  } else if (category === 'thai' || category === 'international') {
    pool = pool.filter((s) => s.category === category);
  }

  let matches: Song[] = [];
  if (!q) {
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

    if (artistFilter && artistFilter !== 'any' && matches.length < 4 && q.length >= 1) {
      const knownArtist = getAllArtists(songPool).find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
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
      const libraryArtists = getAllArtists(songPool);
      const validLive = liveTracks.filter((t) =>
        libraryArtists.some((a) => checkArtistStrictMatch(t.artistName, a.name, undefined, undefined, t.title))
      );
      for (const lt of validLive) {
        songPool.set(lt.id, lt);
        if (!matches.some((m) => m.id === lt.id)) {
          matches.push(lt);
        }
      }
      if (validLive.length > 0) {
        dbService.saveSongs(validLive);
      }
    }
  }

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

function dailySessionMatches(req: ApiRequest, active: ActiveRoundState): boolean {
  const basePlayerId = readDailyPlayerId(req as unknown as { headers?: Record<string, string | string[] | undefined> });
  if (!basePlayerId || !active.dailyPlayerId) return false;
  const scopedPlayerId = scopePlayerIdByDifficulty(basePlayerId, active.difficulty || 'easy');
  return Boolean(
    (active.dailyPlayerId === basePlayerId || active.dailyPlayerId === scopedPlayerId) &&
    active.dailyDateKey &&
    Number.isInteger(active.dailyRoundIndex) &&
    active.startedAt
  );
}

async function finalizeDailyAction(
  req: ApiRequest,
  res: ApiResponse,
  roundToken: string,
  active: ActiveRoundState,
  requestedOutcome: 'correct' | 'wrong' | 'skipped' | 'expired'
): Promise<Awaited<ReturnType<typeof finalizeDailyRound>> | null> {
  if (!dailySessionMatches(req, active) || !active.dailyPlayerId || !active.dailyDateKey || active.dailyRoundIndex === undefined) {
    res.status(401).json({ code: -401, message: 'Daily Challenge session is invalid.' });
    return null;
  }
  const result = await finalizeDailyRound({
    playerId: active.dailyPlayerId,
    dateKey: active.dailyDateKey,
    category: active.category,
    difficulty: active.difficulty,
    roundIndex: active.dailyRoundIndex,
    trackId: active.track.id,
    startedAt: active.startedAt || Date.now(),
    stage: active.stage,
    outcome: requestedOutcome,
  });
  if (!result.updated) {
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    res.status(409).json({ code: -409, message: 'Daily Challenge round has already been finalized.' });
    return null;
  }
  consumeToken(roundToken);
  activeRounds.delete(roundToken);
  return result;
}

async function claimGuesserResult(
  roundId: string,
  requestedResult: 'correct' | 'wrong' | 'skipped',
  res: ApiResponse
): Promise<'correct' | 'wrong' | 'skipped' | null> {
  const claim = await dbService.claimGuesserRoundResult(roundId, requestedResult);
  if (claim.kind === 'unavailable') {
    res.status(503).json({ code: -503, message: 'Could not save the Song Guesser result. Please retry.' });
    return null;
  }
  return claim.result;
}

export async function handleGuess(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parsed = parseGuessDTO(req.body);
  if (!parsed.ok) {
    res.status(400).json({ code: -1, message: parsed.error });
    return;
  }
  const { roundToken, candidateTrackId, candidateTitle, candidateArtist } = parsed.data;

  const active = activeRounds.get(roundToken) || verifyRoundToken(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  if (await isTokenConsumed(roundToken)) {
    const guesserRoundId = active.roundId || `guesser_${active.track.id}_${active.startedAt || 0}`;
    const terminalResult = active.mode === 'guesser'
      ? await dbService.getGuesserRoundResult(guesserRoundId)
      : null;
    if (!terminalResult) {
      res.status(400).json({ code: -1, message: 'Invalid or already used round token (replay detected)' });
      return;
    }
  }

  if (active.mode === 'daily') {
    if (!dailySessionMatches(req, active)) {
      res.status(401).json({ code: -401, message: 'Daily Challenge session is invalid.' });
      return;
    }
  }

  // Anti-cheat: Bot detection (human reaction time cannot be < 50ms)
  if (active.startedAt && Date.now() - active.startedAt < 50) {
    res.status(400).json({ code: -1, message: 'Guess submitted too fast (< 50ms). Automated script detected.' });
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
    const dailyFinal = active.mode === 'daily'
      ? await finalizeDailyAction(req, res, roundToken, active, 'correct')
      : null;
    if (active.mode === 'daily' && !dailyFinal) return;
    const guesserRoundId = active.roundId || `guesser_${active.track.id}_${active.startedAt || 0}`;
    const guesserResult = active.mode === 'guesser'
      ? await claimGuesserResult(guesserRoundId, 'correct', res)
      : null;
    if (active.mode === 'guesser' && !guesserResult) {
      return;
    }
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: guesserResult && guesserResult !== 'correct' ? 'failed' : 'correct',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes + (guesserResult === 'wrong' ? 1 : 0),
      reveal: active.track,
      roundResult: guesserResult || 'correct',
      ...(dailyFinal ? {
        dailyResult: 'correct' as const,
        scoreDelta: dailyFinal.scoreDelta,
        speedBonus: dailyFinal.speedBonus,
        elapsedTimeMs: dailyFinal.elapsedTimeMs,
      } : {}),
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  if (active.mode === 'guesser') {
    const guesserRoundId = active.roundId || `guesser_${active.track.id}_${active.startedAt || 0}`;
    const guesserResult = await claimGuesserResult(guesserRoundId, 'wrong', res);
    if (!guesserResult) {
      return;
    }
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: guesserResult === 'correct' ? 'correct' : 'failed',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes + (guesserResult === 'wrong' ? 1 : 0),
      reveal: active.track,
      roundResult: guesserResult,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.mistakes += 1;
  active.stage += 1;

  if (active.stage >= active.stages.length) {
    const dailyFinal = active.mode === 'daily'
      ? await finalizeDailyAction(req, res, roundToken, active, 'wrong')
      : null;
    if (active.mode === 'daily' && !dailyFinal) return;
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: active.stages.length - 1,
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes,
      reveal: active.track,
      ...(dailyFinal ? {
        dailyResult: 'wrong' as const,
        scoreDelta: 0,
        speedBonus: 0,
        elapsedTimeMs: dailyFinal.elapsedTimeMs,
      } : {}),
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = signRoundToken(active);
  consumeToken(roundToken);
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

export async function handleSkip(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parsed = parseSkipDTO(req.body);
  if (!parsed.ok) {
    res.status(400).json({ code: -1, message: parsed.error });
    return;
  }
  const { roundToken, giveUp } = parsed.data;

  const active = activeRounds.get(roundToken) || verifyRoundToken(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  if (await isTokenConsumed(roundToken)) {
    const guesserRoundId = active.roundId || `guesser_${active.track.id}_${active.startedAt || 0}`;
    const terminalResult = active.mode === 'guesser' && giveUp
      ? await dbService.getGuesserRoundResult(guesserRoundId)
      : null;
    if (!terminalResult) {
      res.status(400).json({ code: -1, message: 'Invalid or already used round token (replay detected)' });
      return;
    }
  }

  if (active.mode === 'daily') {
    if (!dailySessionMatches(req, active)) {
      res.status(401).json({ code: -401, message: 'Daily Challenge session is invalid.' });
      return;
    }
    if (giveUp || active.stage + 1 >= active.stages.length) {
      const finalized = await finalizeDailyAction(req, res, roundToken, active, 'skipped');
      if (!finalized) return;
      res.json({ code: 0, message: 'ok', data: {
        outcome: 'failed',
        stage: Math.min(active.stage, active.stages.length - 1),
        clipSeconds: active.stages[active.stages.length - 1],
        mistakes: active.mistakes,
        reveal: active.track,
        dailyResult: finalized.status,
        roundResult: 'skipped',
        scoreDelta: finalized.scoreDelta,
        speedBonus: 0,
        elapsedTimeMs: finalized.elapsedTimeMs,
      } });
      return;
    }
  }

  if (active.mode === 'guesser' && (giveUp || active.stage + 1 >= active.stages.length)) {
    const guesserRoundId = active.roundId || `guesser_${active.track.id}_${active.startedAt || 0}`;
    const guesserResult = await claimGuesserResult(guesserRoundId, 'skipped', res);
    if (!guesserResult) {
      return;
    }
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    res.json({ code: 0, message: 'ok', data: {
      outcome: guesserResult === 'correct' ? 'correct' : 'failed',
      stage: Math.min(active.stage, active.stages.length - 1),
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes + (guesserResult === 'wrong' ? 1 : 0),
      reveal: active.track,
      roundResult: guesserResult,
    } });
    return;
  }

  active.stage += 1;

  if (giveUp || active.stage >= active.stages.length) {
    consumeToken(roundToken);
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: Math.min(active.stage, active.stages.length - 1),
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes,
      reveal: active.track,
      roundResult: giveUp ? 'skipped' : undefined,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = signRoundToken(active);
  consumeToken(roundToken);
  activeRounds.delete(roundToken);
  activeRounds.set(nextToken, active);

  const payload: RoundActionResponse = {
    outcome: 'active',
    roundToken: nextToken,
    stage: active.stage,
    clipSeconds: active.clipSeconds,
    mistakes: active.mistakes,
    roundResult: 'skipped',
  };
  res.json({ code: 0, message: 'ok', data: payload });
}

export async function handleExpireDailyRound(req: ApiRequest, res: ApiResponse): Promise<void> {
  const roundToken = typeof req.body?.roundToken === 'string' ? req.body.roundToken : '';
  if (!roundToken || await isTokenConsumed(roundToken)) {
    res.status(409).json({ code: -409, message: 'Daily Challenge round has already ended.' });
    return;
  }
  const active = activeRounds.get(roundToken) || verifyRoundToken(roundToken);
  if (!active || active.mode !== 'daily' || !dailySessionMatches(req, active)) {
    res.status(401).json({ code: -401, message: 'Daily Challenge session is invalid.' });
    return;
  }
  const startedAt = active.startedAt || Date.now();
  if (!isDailyRoundExpired(startedAt)) {
    res.status(409).json({
      code: -409,
      message: 'This round has not expired yet.',
      remainingMs: Math.max(0, DAILY_ALLOWED_TIME_MS - (Date.now() - startedAt)),
    });
    return;
  }
  const finalized = await finalizeDailyAction(req, res, roundToken, active, 'expired');
  if (!finalized) return;
  res.json({ code: 0, message: 'ok', data: {
    outcome: 'failed', stage: active.stage, clipSeconds: active.clipSeconds,
    mistakes: active.mistakes, reveal: active.track, dailyResult: 'expired',
    scoreDelta: 0, speedBonus: 0, elapsedTimeMs: finalized.elapsedTimeMs,
  } });
}

