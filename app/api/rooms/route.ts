import { ROOM_CREATE_LIMIT, runApiHandler } from '../../../lib/http/api';
import { handleCreateRoom } from '../../../lib/rooms/service';

export async function POST(req: Request) {
  return runApiHandler(req, handleCreateRoom, { limit: ROOM_CREATE_LIMIT });
}
