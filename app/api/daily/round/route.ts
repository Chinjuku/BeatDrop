import { runApiHandler } from '../../../../lib/http/api';
import { handleStartDailyRound } from '../../../../lib/engine/dailyEngine';

export async function POST(req: Request) {
  return runApiHandler(req, handleStartDailyRound);
}
