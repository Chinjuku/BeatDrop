import { ROUND_LIMIT, runApiHandler } from '../../../../../lib/http/api';
import { handleStartArchiveRound } from '../../../../../lib/engine/dailyArchive';

export async function POST(req: Request) {
  return runApiHandler(req, handleStartArchiveRound, { limit: ROUND_LIMIT });
}
