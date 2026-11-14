import { runApiHandler } from '../../../../lib/http/api';
import { handleGetDailyLeaderboard } from '../../../../lib/engine/dailyEngine';

export async function GET(req: Request) {
  return runApiHandler(req, handleGetDailyLeaderboard);
}
