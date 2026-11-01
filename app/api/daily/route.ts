import { NextResponse } from 'next/server';
import {
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  type CategoryType,
  type DailyChallengeInfo,
  type DifficultyLevel,
  type RoundStartResponse,
} from '../../../types';
import { getBangkokDateKey, signRoundToken } from '../../../lib/token';
import { isSupabaseConfigured, supabaseAdmin } from '../../../lib/supabase';
import { forwardToExpress } from '../../../lib/expressBridge';

function parseCustomStages(raw?: string | null): number[] | null {
  if (!raw) return null;
  const nums = raw
    .split(',')
    .map((n) => parseFloat(n.trim()))
    .filter((n) => !Number.isNaN(n) && n >= 0.1 && n <= 30);
  if (nums.length === 5) return nums.sort((a, b) => a - b);
  return null;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return forwardToExpress(req, '/api/daily');
  }

  try {
    const parsedUrl = new URL(req.url);
    const category = ((parsedUrl.searchParams.get('category') as CategoryType) || 'all') as CategoryType;
    const difficulty = ((parsedUrl.searchParams.get('difficulty') as DifficultyLevel) || 'medium') as DifficultyLevel;
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
    const customStagesParam = parseCustomStages(parsedUrl.searchParams.get('customStages'));
    const roundStages = customStagesParam || DEFAULT_TIME_STAGES;

    const dateKey = getBangkokDateKey();
    const dailySongs = await supabaseAdmin.getOrCreateDailyChallengeSongs(dateKey, category);

    if (dailySongs.length < 5) {
      return forwardToExpress(req, '/api/daily');
    }

    const rounds: RoundStartResponse[] = dailySongs.map((track, idx) => {
      const roundToken = signRoundToken({
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
        poolSize: dailySongs.length,
        expiresAt: Date.now() + 1000 * 60 * 60 * 12,
      };
    });

    const info: DailyChallengeInfo = {
      dateKey,
      category,
      totalRounds: rounds.length,
      rounds,
    };

    return NextResponse.json({ code: 0, message: 'ok', data: info });
  } catch {
    return forwardToExpress(req, '/api/daily');
  }
}

