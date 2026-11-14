import { runApiHandler } from '../../../../lib/http/api';
import { handleSubmitDailyScore } from '../../../../lib/engine/dailyEngine';

export async function POST(req: Request) {
  return runApiHandler(req, handleSubmitDailyScore);
}
