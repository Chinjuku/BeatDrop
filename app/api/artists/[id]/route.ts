import { runApiHandler } from '../../../../lib/http/api';
import { handleDeleteArtist } from '../../../../lib/engine/artistRoutes';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runApiHandler(req, handleDeleteArtist, { adminOnly: true, params: { id } });
}
