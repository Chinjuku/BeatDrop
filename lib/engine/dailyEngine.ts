import { Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  CategoryType,
  DAILY_ALLOWED_TIME_MS,
  DAILY_ROUND_COUNT,
  DailyChallengeInfo,
  RoundStartResponse,
  Song,
  SONGSPOT_STAGES,
} from '../../shared/types';
import { signRoundToken, getBangkokDateKey } from '../token';
import { isDbLocal, isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { songPool } from './songPool';
import { activeRounds } from './roundEngine';
import { normalizeText } from './artists';
import { getDailyPlayerId, readDailyPlayerId } from './dailySession';
import { dbService } from '../db';
import { summarizeDailyProgress } from './dailyScoring';

const ALLOWED_CATEGORIES = new Set<CategoryType>(['all', 'thai', 'international']);

export function seededHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chooseDailySongs(dateKey: string, category: CategoryType): Song[] {
  let candidates = Array.from(songPool.values());
  if (category === 'thai' || category === 'international') {
    candidates = candidates.filter((song) => song.category === category);
  }
  const unique = new Map<string, Song>();
  for (const song of candidates) {
    const key = `${normalizeText(song.title)}::${normalizeText(song.artistName)}`;
    if (!unique.has(key)) unique.set(key, song);
  }
  return Array.from(unique.values())
    .sort((a, b) => seededHash(`${dateKey}:${category}:${a.id}`) - seededHash(`${dateKey}:${category}:${b.id}`))
    .slice(0, DAILY_ROUND_COUNT);
}

async function getDailySongs(dateKey: string, category: CategoryType): Promise<Song[]> {
  if (isSupabaseConfigured() && !isDbLocal()) {
    return supabaseAdmin.getOrCreateDailyChallengeSongs(dateKey, category);
  }

  const selected = chooseDailySongs(dateKey, category);
  if (selected.length !== DAILY_ROUND_COUNT) return [];
  const ids = dbService.getOrCreateLocalDailyChallengeIds(dateKey, category, selected.map((song) => song.id));
  if (ids.length !== DAILY_ROUND_COUNT) return [];
  return ids.map((id) => songPool.get(id)).filter((song): song is Song => Boolean(song));
}

async function getOrStartRound(
  playerId: string,
  dateKey: string,
  category: CategoryType,
  roundIndex: number,
  track: Song
): Promise<RoundStartResponse | null> {
  const progress = await dbService.getOrCreateDailyRoundProgress({
    playerId,
    dateKey,
    category,
    roundIndex,
    trackId: track.id,
    startedAt: Date.now(),
    status: 'pending',
    score: 0,
    speedBonus: 0,
    answerTimeMs: 0,
  });
  if (!progress || progress.status !== 'pending' || progress.trackId !== track.id) {
    console.warn('[Daily] Current progress row cannot start a challenge round', {
      dateKey,
      category,
      roundIndex,
      status: progress?.status || 'missing',
      trackMatches: progress ? progress.trackId === track.id : false,
    });
    return null;
  }

  const difficulty = 'medium' as const;
  const roundState = {
    track,
    difficulty,
    stages: SONGSPOT_STAGES,
    stage: 0,
    clipSeconds: SONGSPOT_STAGES[0],
    mistakes: 0,
    category,
    mode: 'daily' as const,
    startedAt: progress.startedAt,
    dailyDateKey: dateKey,
    dailyRoundIndex: roundIndex,
    dailyPlayerId: playerId,
  };
  const roundToken = signRoundToken(roundState, DAILY_ALLOWED_TIME_MS + 60_000);
  activeRounds.set(roundToken, roundState);

  return {
    roundToken,
    roundKey: `rk_daily_${dateKey}_${category}_${roundIndex}`,
    audioUrl: track.previewUrl,
    difficulty,
    stages: SONGSPOT_STAGES,
    stage: 0,
    clipSeconds: SONGSPOT_STAGES[0],
    category,
    mode: 'daily',
    poolSize: songPool.size,
    expiresAt: progress.startedAt + DAILY_ALLOWED_TIME_MS,
  };
}

export async function handleDaily(req: Request, res: Response): Promise<void> {
  const rawCategory = typeof req.query.category === 'string' ? req.query.category : 'all';
  const category = ALLOWED_CATEGORIES.has(rawCategory as CategoryType)
    ? rawCategory as CategoryType
    : 'all';
  const playerId = getDailyPlayerId(req, res);
  const dateKey = getBangkokDateKey();

  try {
    const songs = await getDailySongs(dateKey, category);
    if (songs.length !== DAILY_ROUND_COUNT) {
      console.warn('[Daily] Challenge unavailable for current catalog', {
        dateKey,
        category,
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
        playerId, dateKey, category, summary.currentIndex, songs[summary.currentIndex]
      );
      if (!currentRound) {
        // A prior tab/request can finish a round between the progress read and
        // round start. Re-read once so the caller advances to the actual next
        // pending round instead of receiving a stale-index 503.
        progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
        summary = summarizeDailyProgress(progress);
        if (summary.currentIndex < DAILY_ROUND_COUNT) {
          currentRound = await getOrStartRound(
            playerId, dateKey, category, summary.currentIndex, songs[summary.currentIndex]
          );
        }
        if (summary.currentIndex < DAILY_ROUND_COUNT && !currentRound) {
          console.warn('[Daily] Could not create current round progress', {
            dateKey,
            category,
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
      roundKey: `rk_daily_${dateKey}_${category}_${roundIndex}`,
      audioUrl: track.previewUrl,
      difficulty: 'medium',
      stages: SONGSPOT_STAGES,
      stage: 0,
      clipSeconds: SONGSPOT_STAGES[0],
      category,
      mode: 'daily',
      poolSize: songPool.size,
      expiresAt: roundIndex === summary.currentIndex ? currentRound?.expiresAt || 0 : 0,
    }));

    const info: DailyChallengeInfo = {
      dateKey,
      category,
      totalRounds: DAILY_ROUND_COUNT,
      rounds,
      ...summary,
    };
    res.json({ code: 0, message: 'ok', data: info });
  } catch (err) {
    console.error('[Daily] Failed to create challenge', {
      dateKey,
      category,
      errorType: err instanceof Error ? err.name : 'unknown',
    });
    res.status(503).json({ code: -503, message: 'Daily Challenge could not be loaded.' });
  }
}

export async function handleStartDailyRound(req: Request, res: Response): Promise<void> {
  const playerId = readDailyPlayerId(req);
  const roundIndex = Number(req.body?.roundIndex);
  if (!playerId || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= DAILY_ROUND_COUNT) {
    res.status(400).json({ code: -1, message: 'Invalid Daily Challenge round request.' });
    return;
  }

  const requestedDate = typeof req.body?.dateKey === 'string' ? req.body.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getBangkokDateKey();
  const category = ALLOWED_CATEGORIES.has(req.body?.category) ? req.body.category as CategoryType : 'all';
  try {
    const progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
    if (dateKey !== getBangkokDateKey() && progress.length === 0) {
      res.status(409).json({ code: -409, message: 'No active challenge exists for that date.' });
      return;
    }
    const songs = await getDailySongs(dateKey, category);
    const nextIndex = summarizeDailyProgress(progress).currentIndex;
    if (songs.length !== DAILY_ROUND_COUNT || roundIndex !== nextIndex) {
      res.status(409).json({ code: -409, message: 'Daily Challenge round is out of sequence.' });
      return;
    }
    const round = await getOrStartRound(playerId, dateKey, category, roundIndex, songs[roundIndex]);
    if (!round) {
      res.status(409).json({ code: -409, message: 'Daily Challenge round is already complete.' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: round });
  } catch {
    res.status(503).json({ code: -503, message: 'Could not start the Daily Challenge round.' });
  }
}

export async function handleSubmitDailyScore(req: Request, res: Response): Promise<void> {
  const playerId = readDailyPlayerId(req);
  const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim().slice(0, 24) : '';
  const category = ALLOWED_CATEGORIES.has(req.body?.category) ? req.body.category as CategoryType : null;
  if (!playerId || !playerName || !category) {
    res.status(400).json({ code: -1, message: 'Player name and category are required.' });
    return;
  }
  const submittedDate = typeof req.body?.dateKey === 'string' ? req.body.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(submittedDate) ? submittedDate : getBangkokDateKey();
  const progress = await dbService.getDailyRoundProgress(playerId, dateKey, category);
  const summary = summarizeDailyProgress(progress);
  if (summary.currentIndex !== DAILY_ROUND_COUNT || progress.length !== DAILY_ROUND_COUNT) {
    res.status(409).json({ code: -409, message: 'Finish all five rounds before submitting.' });
    return;
  }
  const entry = {
    id: `daily-${dateKey}-${category}-${crypto.randomUUID()}`,
    playerId,
    dateKey,
    category,
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
    data: result.entry,
  });
}

export async function handleGetDailyLeaderboard(req: Request, res: Response): Promise<void> {
  const rawCategory = typeof req.query.category === 'string' ? req.query.category : 'all';
  const category = ALLOWED_CATEGORIES.has(rawCategory as CategoryType)
    ? rawCategory as CategoryType
    : 'all';
  const requestedDate = typeof req.query.dateKey === 'string' ? req.query.dateKey : '';
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : getBangkokDateKey();
  const entries = await dbService.getDailyLeaderboard(dateKey, category, 50);
  res.json({ code: 0, message: 'ok', data: entries });
}
