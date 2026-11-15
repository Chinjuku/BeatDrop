import { runApiHandler, type ApiRequest, type ApiResponse } from '../../../../lib/http/api';
import { handleDeleteArtist } from '../../../../lib/engine/artistRoutes';
import { getArtistPageData } from '../../../../lib/engine/artistPage';

// Node runtime: audio tokens use node:crypto and the catalog lives in SQLite/Supabase.
export const runtime = 'nodejs';

/** GET /api/artists/:id — artist page data (no preview links; audio via opaque tokens). Read-only. */
async function handleGetArtistPage(req: ApiRequest, res: ApiResponse): Promise<void> {
  const data = await getArtistPageData(String(req.params.id || ''));
  if (!data) {
    res.status(404).json({ code: 404, message: 'Artist not found' });
    return;
  }
  // Tokens inside are per-response; never share the body between users.
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ code: 0, message: 'ok', data });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runApiHandler(req, handleGetArtistPage, { params: { id } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runApiHandler(req, handleDeleteArtist, { adminOnly: true, params: { id } });
}
