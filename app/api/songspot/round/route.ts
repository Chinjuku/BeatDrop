import { ROUND_LIMIT, runApiHandler } from '../../../../lib/http/api';
import { handleStartRound } from '../../../../lib/engine/roundEngine';

export async function GET(req: Request) {
  return runApiHandler(req, handleStartRound, { limit: ROUND_LIMIT });
}
