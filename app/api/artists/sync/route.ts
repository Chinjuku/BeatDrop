import { NextResponse } from 'next/server';
import { syncArtistSongs } from '../../../../lib/itunes';
import { checkArtistSyncLimit } from '../../../../lib/engine/rateLimiter';
import { invalidateArtistsServerCache } from '../../../../lib/engine/artistRoutes';
import { parseArtistSyncDTO } from '../../../../shared/validation';

export async function POST(req: Request) {
  try {
    const configuredKey = process.env.ADMIN_API_KEY;
    const providedKey =
      req.headers.get('x-admin-key') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const isAdmin = Boolean(configuredKey && providedKey === configuredKey);

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

    const rawBody = await req.json().catch(() => null);
    const parsed = parseArtistSyncDTO(rawBody);
    if (!parsed.ok || parsed.data.name.length < 2) {
      return NextResponse.json(
        { code: -1, message: 'กรุณาระบุชื่อศิลปินอย่างน้อย 2 ตัวอักษร' },
        { status: 400 }
      );
    }

    // Public users get up to 50 curated tracks; Admin gets full 200 tracks catalog
    const maxLimit = isAdmin ? 200 : 50;
    const result = await syncArtistSongs(parsed.data.name, parsed.data.category, maxLimit);
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

