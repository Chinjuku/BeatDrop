import { ROOM_ACTION_LIMIT, roomLimitKey, runApiHandler } from '../../../../../lib/http/api';
import { handleJoinRoom } from '../../../../../lib/rooms/service';

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  return runApiHandler(req, handleJoinRoom, {
    params: { code },
    skipGeneralLimit: true,
    limit: ROOM_ACTION_LIMIT,
    limitKey: roomLimitKey,
  });
}
