import {
  DAILY_ALLOWED_TIME_MS,
  DAILY_BASE_SCORE,
  DAILY_MAX_SPEED_BONUS,
  DAILY_SKIP_PENALTY,
  DAILY_STAGE_SCORES,
  type DailyRoundProgress,
} from '../../shared/types';
import type { CategoryType, DifficultyLevel } from '../../shared/types';
import { dbService } from '../db';

export function getDailySpeedBonus(elapsedTimeMs: number): number {
  const elapsed = Math.max(0, Math.min(DAILY_ALLOWED_TIME_MS, elapsedTimeMs));
  return Math.round(DAILY_MAX_SPEED_BONUS * (1 - elapsed / DAILY_ALLOWED_TIME_MS));
}

export function getDailyCorrectScore(elapsedTimeMs: number): { score: number; speedBonus: number } {
  const speedBonus = getDailySpeedBonus(elapsedTimeMs);
  return { score: DAILY_BASE_SCORE + speedBonus, speedBonus };
}

export function getDailyStageScore(stageIndex: number): { score: number; speedBonus: number } {
  const clampedStage = Math.max(0, Math.min(DAILY_STAGE_SCORES.length - 1, Math.floor(stageIndex)));
  const score = DAILY_STAGE_SCORES[clampedStage];
  const speedBonus = Math.max(0, score - DAILY_BASE_SCORE);
  return { score, speedBonus };
}

export function applyDailySkipPenalty(totalScore: number): number {
  return Math.max(0, totalScore - DAILY_SKIP_PENALTY);
}

export function isDailyRoundExpired(startedAt: number, now = Date.now()): boolean {
  return now - startedAt >= DAILY_ALLOWED_TIME_MS;
}

export function summarizeDailyProgress(progress: DailyRoundProgress[]) {
  const score = [...progress]
    .sort((a, b) => a.roundIndex - b.roundIndex)
    .reduce((sum, item) => Math.max(0, sum + item.score), 0);
  const correctCount = progress.filter((item) => item.status === 'correct').length;
  const skipCount = progress.filter((item) => item.status === 'skipped').length;
  const totalAnswerTimeMs = progress.reduce((sum, item) => sum + item.answerTimeMs, 0);
  const results = Array.from({ length: 5 }, (_, roundIndex) =>
    progress.find((item) => item.roundIndex === roundIndex)?.status || 'pending'
  ) as Array<DailyRoundProgress['status'] | 'pending'>;
  const currentIndex = results.findIndex((status) => status === 'pending');
  return {
    score,
    correctCount,
    skipCount,
    totalAnswerTimeMs,
    results,
    currentIndex: currentIndex < 0 ? results.length : currentIndex,
  };
}

export async function finalizeDailyRound(input: {
  playerId: string;
  dateKey: string;
  category: CategoryType;
  difficulty?: DifficultyLevel;
  roundIndex: number;
  trackId: string;
  startedAt: number;
  stage?: number;
  outcome: 'correct' | 'wrong' | 'skipped' | 'expired';
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const elapsedTimeMs = Math.max(0, now - input.startedAt);
  const status = input.outcome;

  let score = 0;
  let speedBonus = 0;
  if (status === 'correct') {
    const points = getDailyStageScore(input.stage ?? 0);
    score = points.score;
    speedBonus = points.speedBonus;
  }

  const finalized = await dbService.finalizeDailyRoundProgress({
    playerId: input.playerId,
    dateKey: input.dateKey,
    category: input.category,
    roundIndex: input.roundIndex,
    trackId: input.trackId,
    status,
    score,
    speedBonus,
    answerTimeMs: elapsedTimeMs,
  });
  return {
    ...finalized,
    status,
    elapsedTimeMs,
    scoreDelta: score,
    speedBonus,
    expired: status === 'expired',
  };
}
