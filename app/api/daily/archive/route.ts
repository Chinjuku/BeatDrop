import { runApiHandler } from '../../../../lib/http/api';
import { handleDailyArchive } from '../../../../lib/engine/dailyArchive';

export async function GET(req: Request) {
  return runApiHandler(req, handleDailyArchive);
}
