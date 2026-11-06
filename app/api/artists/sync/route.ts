import { NextResponse } from 'next/server';
import { syncArtistSongs, recoverPendingArtistSyncJobs } from '../../../../lib/itunes';
import { checkArtistSyncLimit } from '../../../../lib/engine/rateLimiter';
import { invalidateArtistsServerCache } from '../../../../lib/engine/artistRoutes';
import { parseArtistSyncDTO } from '../../../../shared/validation';
import { dbService } from '../../../../lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId')?.trim();

    if (jobId) {
      const job = dbService.getSyncJob(jobId);
      if (!job) {
        return NextResponse.json({ code: 404, message: 'Sync job not found' }, { status: 404 });
      }
      return NextResponse.json({ code: 0, message: 'ok', data: job });
    }

    const recoverable = dbService.getRecoverableSyncJobs();
    return NextResponse.json({ code: 0, message: 'ok', data: { recoverable } });
  } catch (err) {
    return NextResponse.json(
      { code: -500, message: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const configuredKey = process.env.ADMIN_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const providedKey =
      req.headers.get('x-admin-key') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const isAdmin = Boolean(
      (configuredKey && providedKey === configuredKey) ||
        (cronSecret && providedKey === cronSecret)
    );

    const rawBody = await req.json().catch(() => null);

    // State-mutating recovery action requires Admin or Cron authorization
    if (rawBody && typeof rawBody === 'object' && (rawBody as any).action === 'recover') {
      // Fail closed when no server-side secret is configured. Recovery replays
      // queued work and must never be exposed as a public endpoint.
      if (!isAdmin) {
        return NextResponse.json(
          { code: 401, message: 'Unauthorized recovery request' },
          { status: 401 }
        );
      }
      const recovered = await recoverPendingArtistSyncJobs();
      return NextResponse.json({ code: 0, message: 'ok', data: { recovered } });
    }

    // Hybrid Permission Guardrails:
    // General users (public) are capped at 5 sync requests per minute to prevent Apple iTunes 429 bans
    if (!isAdmin) {
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = (forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip')) || '127.0.0.1';
      const rl = await checkArtistSyncLimit(ip);
      if (!rl.success) {
        const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
        return NextResponse.json(
          {
            code: 429,
            message: 'จำกัดการดึงเพลงเข้าคลังไม่เกิน 5 ครั้งต่อนาที เพื่อป้องกันการโดน Apple แบน',
            retryAfter,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
            },
          }
        );
      }
    }

    const parsed = parseArtistSyncDTO(rawBody);
    if (!parsed.ok || parsed.data.name.length < 2) {
      return NextResponse.json(
        { code: -1, message: 'กรุณาระบุชื่อศิลปินอย่างน้อย 2 ตัวอักษร' },
        { status: 400 }
      );
    }

    const forceRefresh = Boolean(rawBody && typeof rawBody === 'object' && 'forceRefresh' in rawBody && (rawBody as any).forceRefresh);
    // Public users get up to 50 curated tracks; Admin gets full 200 tracks catalog
    const maxLimit = isAdmin ? 200 : 50;
    const result = await syncArtistSongs(parsed.data.name, parsed.data.category, maxLimit, forceRefresh);
    if (result.body.code === 0 && result.body.data?.artist) {
      invalidateArtistsServerCache(result.body.data.artist);
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { code: -500, message: `เกิดข้อผิดพลาดในการซิงค์เพลง: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

