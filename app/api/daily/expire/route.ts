import { runApiHandler } from '../../../../lib/http/api';
import { handleExpireDailyRound } from '../../../../lib/engine/roundEngine';

export async function POST(req: Request) {
  return runApiHandler(req, handleExpireDailyRound);
}
