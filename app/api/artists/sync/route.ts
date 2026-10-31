import { NextResponse } from 'next/server';
import type { CategoryType } from '../../../../types';
import { syncArtistSongs } from '../../../../lib/itunes';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      artistName?: string;
      name?: string;
      artist?: string;
      category?: CategoryType;
      mainGenre?: string;
      avatarUrl?: string;
      id?: string;
    };
    const query = String(body.artistName || body.name || body.artist || '').trim();

    if (!query || query.length < 2) {
      return NextResponse.json(
        { code: -1, message: 'กรุณาระบุชื่อศิลปินอย่างน้อย 2 ตัวอักษร' },
        { status: 400 }
      );
    }

    const result = await syncArtistSongs(query, body.category);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { code: -500, message: `เกิดข้อผิดพลาดในการซิงค์เพลง: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

