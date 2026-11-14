import { runApiHandler } from '../../../lib/http/api';
import { handleDaily } from '../../../lib/engine/dailyEngine';

export async function GET(req: Request) {
  return runApiHandler(req, handleDaily);
}
