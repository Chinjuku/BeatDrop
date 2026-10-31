import { Request, Response } from 'express';
import {
  CategoryType,
  DailyChallengeInfo,
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  RoundStartResponse,
  Song,
} from '../../shared/types';
import { signRoundToken, getBangkokDateKey } from '../token';
import { isSupabaseConfigured, supabaseAdmin } from '../supabase';
import { songPool } from './songPool';
import { activeRounds, parseCustomStages } from './roundEngine';
import { normalizeText } from './artists';

export function seededHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function handleDaily(req: Request, res: Response): Promise<void> {
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const difficulty = ((req.query.difficulty as DifficultyLevel) || 'medium') as DifficultyLevel;
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  const customStagesParam = parseCustomStages(req.query.customStages);
  const roundStages = customStagesParam || (req.query.difficulty ? preset.stages : DEFAULT_TIME_STAGES);
  const dateKey = getBangkokDateKey();

  let dailySongs: Song[] = [];
  let poolCount = songPool.size;

  if (isSupabaseConfigured()) {
    try {
      const sbSongs = await supabaseAdmin.getOrCreateDailyChallengeSongs(dateKey, category);
      if (sbSongs.length >= 5) {
        dailySongs = sbSongs;
      }
    } catch (err) {
      console.warn('[Daily] Supabase daily challenge fallback to memory pool:', (err as Error).message);
    }
  }

  if (dailySongs.length < 5) {
    let candidates = Array.from(songPool.values());
    if (category === 'thai' || category === 'international') {
      candidates = candidates.filter((s) => s.category === category);
    }
    if (candidates.length < 5) {
      candidates = Array.from(songPool.values());
    }
    poolCount = candidates.length;

    const sorted = [...candidates].sort((a, b) => {
      const ha = seededHash(`${dateKey}:${category}:${a.id}`);
      const hb = seededHash(`${dateKey}:${category}:${b.id}`);
      return ha - hb;
    });

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
  }

  const rounds: RoundStartResponse[] = dailySongs.map((track, idx) => {
    const roundState = {
      track,
      difficulty,
      stages: roundStages,
      stage: 0,
      clipSeconds: roundStages[0],
      mistakes: 0,
      category,
      mode: 'daily' as const,
    };
    const roundToken = signRoundToken(roundState);
    activeRounds.set(roundToken, roundState);

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
      poolSize: poolCount,
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
}

