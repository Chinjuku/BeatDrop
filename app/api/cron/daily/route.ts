import { NextResponse } from 'next/server';
import type { CategoryType } from '../../../../types';
import { getBangkokDateKey } from '../../../../lib/token';
import { isSupabaseConfigured, supabaseAdmin } from '../../../../lib/supabase';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ code: -401, message: 'Unauthorized cron invocation' }, { status: 401 });
    }
  }

  const dateKey = getBangkokDateKey();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      code: 0,
      message: 'Supabase not configured; deterministic daily challenge fallback is active.',
      data: { dateKey, source: 'deterministic-fallback' },
    });
  }

  try {
    const categories: CategoryType[] = ['all', 'thai', 'international'];
    const generated: Record<string, string[]> = {};

    for (const category of categories) {
      const songs = await supabaseAdmin.getOrCreateDailyChallengeSongs(dateKey, category);
      generated[category] = songs.map((s) => s.id);
    }

    return NextResponse.json({
      code: 0,
      message: `Daily challenges generated for ${dateKey} (UTC+7)`,
      data: {
        dateKey,
        timezone: 'Asia/Bangkok (UTC+7)',
        generated,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { code: -500, message: (err as Error).message || 'Failed to generate daily challenge' },
      { status: 500 }
    );
  }
}

