import { runApiHandler } from '../../../../lib/http/api';
import { handleSkip } from '../../../../lib/engine/roundEngine';

export async function POST(req: Request) {
  return runApiHandler(req, handleSkip);
}
