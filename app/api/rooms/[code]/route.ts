import { ROOM_POLL_LIMIT, roomLimitKey, runApiHandler } from '../../../../lib/http/api';
import { handleGetRoom } from '../../../../lib/rooms/service';

type Ctx = { params: Promise<{ code: string }> };

/** Polled about once a second by every player, so it has its own per-player limit. */
export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  return runApiHandler(req, handleGetRoom, {
    params: { code },
    skipGeneralLimit: true,
    limit: ROOM_POLL_LIMIT,
    limitKey: roomLimitKey,
  });
}
