/**
 * Daily Challenge archive: replay a past date's stored songs as practice.
 *
 * Rules
 * - Only dates before today (Asia/Bangkok) and only sequences that were actually stored.
 *   Nothing is recomputed, so a replay always uses the songs that were played that day.
 * - Practice rounds are plain rounds (mode 'standard'): they never write Daily progress,
 *   never reach any leaderboard, and use the Daily clip stages (Standard preset).
 * - Listing is read-only: it reads the player cookie if present but never sets one.
 */
import type { ApiRequest, ApiResponse } from '../http/api';
import {
  DAILY_ROUND_COUNT,
  DAILY_TIME_STAGES,
  type CategoryType,
  type DifficultyLevel,
} from '../../shared/types';
import { getBangkokDateKey } from '../token';
import { dbService } from '../db';
import { readDailyPlayerId } from './dailySession';
import { resolveSongs, scopePlayerIdByDifficulty } from './dailyEngine';
import { issuePracticeRound } from './roundEngine';

const CATEGORIES: CategoryType[] = ['all', 'thai', 'international'];
const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];
export const ARCHIVE_DAYS = 60;

export interface DailyArchiveDay {
  dateKey: string;
  /** The player's official result for that day, if they played it when it was live. */
  official?: { roundsPlayed: number; score: number; complete: boolean };
}

function pickCategory(raw: unknown): CategoryType {
  return CATEGORIES.includes(raw as CategoryType) ? (raw as CategoryType) : 'all';
}
function pickDifficulty(raw: unknown): DifficultyLevel {
  return DIFFICULTIES.includes(raw as DifficultyLevel) ? (raw as DifficultyLevel) : 'easy';
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/daily/archive?category=&difficulty= */
export async function handleDailyArchive(req: ApiRequest, res: ApiResponse): Promise<void> {
  const category = pickCategory(req.query.category);
  const difficulty = pickDifficulty(req.query.difficulty);
  const today = getBangkokDateKey();
  const dates = await dbService.listDailyChallengeDates(category, difficulty, today, ARCHIVE_DAYS);

  const playerId = readDailyPlayerId(req);
  const official = new Map<string, { roundsPlayed: number; score: number }>();
  if (playerId && dates.length > 0) {
    const rows = await dbService.getDailyProgressForDates(scopePlayerIdByDifficulty(playerId, difficulty), category, dates);
    for (const row of rows) {
      if (row.status === 'pending') continue;
      const entry = official.get(row.dateKey) ?? { roundsPlayed: 0, score: 0 };
      entry.roundsPlayed += 1;
      entry.score += row.score;
      official.set(row.dateKey, entry);
    }
  }

  const days: DailyArchiveDay[] = dates.map((dateKey) => {
    const o = official.get(dateKey);
    return o ? { dateKey, official: { ...o, complete: o.roundsPlayed >= DAILY_ROUND_COUNT } } : { dateKey };
  });
  res.json({ code: 0, message: 'ok', data: { today, category, difficulty, days } });
}

/** POST /api/daily/archive/round — { dateKey, category, difficulty, roundIndex } */
export async function handleStartArchiveRound(req: ApiRequest, res: ApiResponse): Promise<void> {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const dateKey = typeof body.dateKey === 'string' && DATE_RE.test(body.dateKey) ? body.dateKey : '';
  const category = pickCategory(body.category);
  const difficulty = pickDifficulty(body.difficulty);
  const roundIndex = Number(body.roundIndex);

  if (!dateKey || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= DAILY_ROUND_COUNT) {
    res.status(400).json({ code: -1, message: 'Invalid archive round request.' });
    return;
  }
  // Today's challenge is live and competitive: it can't be opened here.
  if (dateKey >= getBangkokDateKey()) {
    res.status(403).json({ code: -403, message: 'Only past challenges can be replayed.' });
    return;
  }

  const ids = await dbService.getStoredDailyChallengeIds(dateKey, category, difficulty);
  if (!ids) {
    res.status(404).json({ code: -404, message: 'No stored challenge for that date.' });
    return;
  }
  const songs = await resolveSongs(ids);
  if (songs.length !== DAILY_ROUND_COUNT) {
    res.status(404).json({ code: -404, message: 'Songs for that date are no longer in the catalog.' });
    return;
  }

  const round = issuePracticeRound(songs[roundIndex], { stages: [...DAILY_TIME_STAGES], difficulty, category });
  res.json({
    code: 0,
    message: 'ok',
    data: { ...round, dateKey, roundIndex, totalRounds: DAILY_ROUND_COUNT },
  });
}
