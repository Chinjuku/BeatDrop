import type { ApiRequest, ApiResponse } from '../http/api';
import crypto from 'node:crypto';
import {
  CategoryType,
  DAILY_ROUND_COUNT,
  DailyChallengeInfo,
  DAILY_TIME_STAGES,
  DifficultyLevel,
  RoundStartResponse,
  Song,
} from '../../shared/types';
import { signRoundToken, getBangkokDateKey } from '../token';
import { isDbLocal, isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { songPool } from './songPool';
import { activeRounds } from './roundEngine';
import { getAllArtists, normalizeText } from './artists';
import { getDailyPlayerId, readDailyPlayerId } from './dailySession';
import { dbService } from '../db';
import { summarizeDailyProgress } from './dailyScoring';

const ALLOWED_CATEGORIES = new Set<CategoryType>(['all', 'thai', 'international']);
const ALLOWED_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'medium', 'hard', 'expert', 'impossible']);

export function scopePlayerIdByDifficulty(playerId: string, difficulty: DifficultyLevel = 'easy'): string {
  if (!difficulty || difficulty === 'easy') return playerId;
  const hex = crypto.createHash('sha256').update(`${playerId}:${difficulty}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function seededHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chooseDailySongs(
  dateKey: string,
  category: CategoryType,
  difficulty: DifficultyLevel = 'easy'
): Song[] {
  const allPool = Array.from(songPool.values());
  if (allPool.length < DAILY_ROUND_COUNT) return [];

  const libraryArtists = getAllArtists(songPool);
  const libraryArtistIds = new Set(libraryArtists.map((a) => String(a.id)));
  const libraryArtistNames = new Set(libraryArtists.map((a) => normalizeText(a.name)));

  let candidates = allPool.filter((song) => {
    if (libraryArtists.length === 0) return true;
    if (song.artistId && libraryArtistIds.has(String(song.artistId))) return true;
    if (song.artistIds?.some((id) => libraryArtistIds.has(String(id)))) return true;
    return libraryArtistNames.has(normalizeText(song.artistName));
  });
  if (candidates.length < DAILY_ROUND_COUNT) {
    candidates = allPool;
  }
  if (category === 'thai' || category === 'international') {
    candidates = candidates.filter((song) => song.category === category);
  }
  const unique = new Map<string, Song>();
  for (const song of candidates) {
    const key = `${normalizeText(song.title)}::${normalizeText(song.artistName)}`;
    if (!unique.has(key)) unique.set(key, song);
  }

  let pool = Array.from(unique.values());
  if (pool.length > 8) {
    const sorted = [...pool].sort(
      (a, b) => (b.popularityScore || 50) - (a.popularityScore || 50)
    );
    if (difficulty === 'easy') {
      pool = sorted.slice(0, Math.max(8, Math.ceil(sorted.length * 0.25)));
    } else if (difficulty === 'medium') {
      pool = sorted.slice(0, Math.max(12, Math.ceil(sorted.length * 0.60)));
    } else if (difficulty === 'hard') {
      pool = sorted.slice(Math.floor(sorted.length * 0.15));
    } else if (difficulty === 'expert') {
      pool = sorted.slice(Math.floor(sorted.length * 0.35));
    } else if (difficulty === 'impossible') {
      pool = sorted.slice(Math.floor(sorted.length * 0.50));
    }
    if (pool.length < DAILY_ROUND_COUNT) {
      pool = sorted;
    }
  }

  const seedPrefix = difficulty === 'easy' ? `${dateKey}:${category}` : `${dateKey}:${category}:${difficulty}`;
  const seeded = [...pool].sort(
    (a, b) => seededHash(`${seedPrefix}:${a.id}`) - seededHash(`${seedPrefix}:${b.id}`)
  );

  const picked: Song[] = [];
  const seenArtists = new Set<string>();
  for (const song of seeded) {
    const artistKey = normalizeText(song.artistName);
    if (!seenArtists.has(artistKey)) {
      seenArtists.add(artistKey);
      picked.push(song);
      if (picked.length === DAILY_ROUND_COUNT) return picked;
    }
  }
  for (const song of seeded) {
    if (!picked.some((p) => p.id === song.id)) {
      picked.push(song);
      if (picked.length === DAILY_ROUND_COUNT) break;
    }
  }
  return picked.slice(0, DAILY_ROUND_COUNT);
}

async function getDailySongs(
  dateKey: string,
  category: CategoryType,
  difficulty: DifficultyLevel = 'easy'
): Promise<Song[]> {
  if (isSupabaseConfigured() && !isDbLocal()) {
    if (difficulty === 'easy') {
      const remoteSongs = await supabaseAdmin.getOrCreateDailyChallengeSongs(dateKey, category);
      if (remoteSongs.length === DAILY_ROUND_COUNT) {
        for (const song of remoteSongs) {
          songPool.set(song.id, song);
        }
        return remoteSongs;
      }
    }
    return chooseDailySongs(dateKey, category, difficulty);
  }

  const selected = chooseDailySongs(dateKey, category, difficulty);
  if (selected.length !== DAILY_ROUND_COUNT) return [];
  const dateSeedKey = difficulty === 'easy' ? dateKey : `${dateKey}:${difficulty}`;
  const ids = dbService.getOrCreateLocalDailyChallengeIds(dateSeedKey, category, selected.map((song) => song.id));
  if (ids.length !== DAILY_ROUND_COUNT) return selected;
  return ids.map((id) => songPool.get(id)).filter((song): song is Song => Boolean(song));
}

async function getOrStartRound(
  playerId: string,
  dateKey: string,
  category: CategoryType,
  roundIndex: number,
  track: Song,
  difficulty: DifficultyLevel = 'easy',
  stages: number[] = [...DAILY_TIME_STAGES]
): Promise<RoundStartResponse | null> {
  const now = Date.now();
  const progress = await dbService.getOrCreateDailyRoundProgress({
    playerId,
    dateKey,
    category,
    difficulty,
    roundIndex,
    trackId: track.id,
    startedAt: now,
    status: 'pending',
    score: 0,
    speedBonus: 0,
    answerTimeMs: 0,
  });
  if (progress && progress.status !== 'pending') {
    console.warn('[Daily] Current progress row cannot start a challenge round', {
      dateKey,
      category,
      difficulty,
      roundIndex,
      status: progress.status,
    });
    return null;
  }

  const activeTrack =
    progress && progress.trackId !== track.id
      ? songPool.get(progress.trackId) || track
      : track;
  const startedAt = progress?.startedAt || now;
  const roundState = {
    track: activeTrack,
    difficulty,
    stages,
    stage: 0,
    clipSeconds: stages[0],
    mistakes: 0,
    category,
    mode: 'daily' as const,
    startedAt,
    dailyDateKey: dateKey,
    dailyRoundIndex: roundIndex,
    dailyPlayerId: playerId,
  };
  const roundToken = signRoundToken(roundState);
  activeRounds.set(roundToken, roundState);

  return {
    roundToken,
    roundKey: `rk_daily_${dateKey}_${category}_${difficulty}_${roundIndex}`,
    audioUrl: activeTrack.previewUrl,
    difficulty,
    stages,
    stage: 0,
    clipSeconds: stages[0],
    category,
    mode: 'daily',
    poolSize: songPool.size,
    expiresAt: 0,
  };
}

export async function handleDaily(req: ApiRequest, res: ApiResponse): Promise<void> {
  const rawCategory = typeof req.query.category === 'string' ? req.query.category : 'all';
  const category = ALLOWED_CATEGORIES.has(rawCategory as CategoryType)
    ? rawCategory as CategoryType
    : 'all';
  const rawDifficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : 'easy';
  const difficulty = ALLOWED_DIFFICULTIES.has(rawDifficulty as DifficultyLevel)
    ? (rawDifficulty as DifficultyLevel)
    : 'easy';
  // Client-supplied customStages are ignored: Daily timing is identical for everyone.
  const stages = [...DAILY_TIME_STAGES];
  const basePlayerId = getDailyPlayerId(req, res);
  const playerId = scopePlayerIdByDifficulty(basePlayerId, difficulty);
  const dateKey = getBangkokDateKey();

  try {
    const songs = await getDailySongs(dateKey, category, difficulty);
    if (songs.length !== DAILY_ROUND_COUNT) {
      console.warn('[Daily] Challenge unavailable for current catalog', {
        dateKey,
        category,
        difficulty,
        expectedRounds: DAILY_ROUND_COUNT,
        actualRounds: songs.length,
      });
      res.status(503).json({ code: -503, message: 'Daily challenge is not available for this catalog yet.' });
      return;
    }

    let progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
    let summary = summarizeDailyProgress(progress);
    let currentRound: RoundStartResponse | null = null;
    if (summary.currentIndex < DAILY_ROUND_COUNT) {
      currentRound = await getOrStartRound(
        playerId,
        dateKey,
        category,
        summary.currentIndex,
        songs[summary.currentIndex],
        difficulty,
        stages
      );
      if (!currentRound) {
        progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
        summary = summarizeDailyProgress(progress);
        if (summary.currentIndex < DAILY_ROUND_COUNT) {
          currentRound = await getOrStartRound(
            playerId,
            dateKey,
            category,
            summary.currentIndex,
            songs[summary.currentIndex],
            difficulty,
            stages
          );
        }
        if (summary.currentIndex < DAILY_ROUND_COUNT && !currentRound) {
          console.warn('[Daily] Could not create current round progress', {
            dateKey,
            category,
            difficulty,
            roundIndex: summary.currentIndex,
          });
          res.status(503).json({ code: -503, message: 'Could not load your current Daily Challenge round.' });
          return;
        }
      }
      progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
      summary = summarizeDailyProgress(progress);
    }

    const rounds: RoundStartResponse[] = songs.map((track, roundIndex) => ({
      roundToken: roundIndex === summary.currentIndex ? currentRound?.roundToken || '' : '',
      roundKey: `rk_daily_${dateKey}_${category}_${difficulty}_${roundIndex}`,
      audioUrl: track.previewUrl,
      difficulty,
      stages,
      stage: 0,
      clipSeconds: stages[0],
      category,
      mode: 'daily',
      poolSize: songPool.size,
      expiresAt: 0,
    }));

    const info: DailyChallengeInfo = {
      dateKey,
      category,
      difficulty,
      totalRounds: DAILY_ROUND_COUNT,
      rounds,
      ...summary,
    };
    res.json({ code: 0, message: 'ok', data: info });
  } catch (err) {
    console.error('[Daily] Failed to create challenge', {
      dateKey,
      category,
      difficulty,
      errorType: err instanceof Error ? err.name : 'unknown',
    });
    res.status(503).json({ code: -503, message: 'Daily Challenge could not be loaded.' });
  }
}

export async function handleStartDailyRound(req: ApiRequest, res: ApiResponse): Promise<void> {
  const basePlayerId = readDailyPlayerId(req);
  const roundIndex = Number(req.body?.roundIndex);
  if (!basePlayerId || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= DAILY_ROUND_COUNT) {
    res.status(400).json({ code: -1, message: 'Invalid Daily Challenge round request.' });
    return;
  }

  const rawDifficulty = typeof req.body?.difficulty === 'string' ? req.body.difficulty : 'easy';
  const difficulty = ALLOWED_DIFFICULTIES.has(rawDifficulty as DifficultyLevel)
    ? (rawDifficulty as DifficultyLevel)
    : 'easy';
  const stages = [...DAILY_TIME_STAGES];
  const playerId = scopePlayerIdByDifficulty(basePlayerId, difficulty);
  const requestedDate = typeof req.body?.dateKey === 'string' ? req.body.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getBangkokDateKey();
  const category = ALLOWED_CATEGORIES.has(req.body?.category) ? req.body.category as CategoryType : 'all';
  try {
    const progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
    if (dateKey !== getBangkokDateKey() && progress.length === 0) {
      res.status(409).json({ code: -409, message: 'No active challenge exists for that date.' });
      return;
    }
    const songs = await getDailySongs(dateKey, category, difficulty);
    const nextIndex = summarizeDailyProgress(progress).currentIndex;
    const hasCompletedRequestedRound = progress.some(
      (item) => item.roundIndex === roundIndex && item.status !== 'pending'
    );
    const hasEarlierPendingRound = progress.some(
      (item) => item.roundIndex < roundIndex && item.status === 'pending'
    );
    if (
      songs.length !== DAILY_ROUND_COUNT ||
      hasCompletedRequestedRound ||
      hasEarlierPendingRound ||
      (progress.length > 0 && roundIndex !== nextIndex && !isSupabaseConfigured())
    ) {
      res.status(409).json({ code: -409, message: 'Daily Challenge round is out of sequence.' });
      return;
    }
    const round = await getOrStartRound(
      playerId,
      dateKey,
      category,
      roundIndex,
      songs[roundIndex],
      difficulty,
      stages
    );
    if (!round) {
      res.status(409).json({ code: -409, message: 'Daily Challenge round is already complete.' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: round });
  } catch {
    res.status(503).json({ code: -503, message: 'Could not start the Daily Challenge round.' });
  }
}

export async function handleSubmitDailyScore(req: ApiRequest, res: ApiResponse): Promise<void> {
  const basePlayerId = readDailyPlayerId(req);
  const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim().slice(0, 24) : '';
  const category = ALLOWED_CATEGORIES.has(req.body?.category) ? req.body.category as CategoryType : null;
  if (!basePlayerId || !playerName || !category) {
    res.status(400).json({ code: -1, message: 'Player name and category are required.' });
    return;
  }
  const rawDifficulty = typeof req.body?.difficulty === 'string' ? req.body.difficulty : 'easy';
  const difficulty = ALLOWED_DIFFICULTIES.has(rawDifficulty as DifficultyLevel)
    ? (rawDifficulty as DifficultyLevel)
    : 'easy';
  const playerId = scopePlayerIdByDifficulty(basePlayerId, difficulty);
  const submittedDate = typeof req.body?.dateKey === 'string' ? req.body.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(submittedDate) ? submittedDate : getBangkokDateKey();
  const progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
  const summary = summarizeDailyProgress(progress);
  if (summary.currentIndex !== DAILY_ROUND_COUNT || progress.length !== DAILY_ROUND_COUNT) {
    res.status(409).json({ code: -409, message: 'Finish all five rounds before submitting.' });
    return;
  }
  const entry = {
    id: `daily-${dateKey}-${category}-${difficulty}-${crypto.randomUUID()}`,
    playerId,
    dateKey,
    category,
    difficulty,
    playerName,
    score: summary.score,
    correctCount: summary.correctCount,
    skipCount: summary.skipCount,
    totalAnswerTimeMs: summary.totalAnswerTimeMs,
    createdAt: new Date().toISOString(),
  };
  const result = await dbService.submitDailyLeaderboard(entry);
  if (!result.entry) {
    res.status(503).json({ code: -503, message: 'Could not save Daily Challenge score.' });
    return;
  }
  res.status(result.inserted ? 200 : 409).json({
    code: result.inserted ? 0 : -409,
    message: result.inserted ? 'ok' : 'A Daily Challenge submission already exists for this player today.',
    data: { ...result.entry, difficulty },
  });
}

function extractEntryDifficulty(entry: { id: string; difficulty?: DifficultyLevel }): DifficultyLevel {
  if (entry.difficulty && ALLOWED_DIFFICULTIES.has(entry.difficulty)) {
    return entry.difficulty;
  }
  const match = entry.id.match(/^daily-\d{4}-\d{2}-\d{2}-(?:all|thai|international)-(easy|medium|hard|expert|impossible)-/);
  if (match && ALLOWED_DIFFICULTIES.has(match[1] as DifficultyLevel)) {
    return match[1] as DifficultyLevel;
  }
  return 'easy';
}

export async function handleGetDailyLeaderboard(req: ApiRequest, res: ApiResponse): Promise<void> {
  const rawCategory = typeof req.query.category === 'string' ? req.query.category : 'all';
  const category = ALLOWED_CATEGORIES.has(rawCategory as CategoryType)
    ? rawCategory as CategoryType
    : 'all';
  const rawDifficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : 'all';
  const difficultyFilter = ALLOWED_DIFFICULTIES.has(rawDifficulty as DifficultyLevel)
    ? (rawDifficulty as DifficultyLevel)
    : null;
  const requestedDate = typeof req.query.dateKey === 'string' ? req.query.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getBangkokDateKey();
  const entries = await dbService.getDailyLeaderboard(dateKey, category, 100);
  const hydrated = entries.map((e) => ({
    ...e,
    difficulty: extractEntryDifficulty(e),
  }));
  const filtered = difficultyFilter
    ? hydrated.filter((e) => e.difficulty === difficultyFilter)
    : hydrated;
  res.json({ code: 0, message: 'ok', data: filtered.slice(0, 50) });
}
