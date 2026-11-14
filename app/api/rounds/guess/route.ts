import { runApiHandler } from '../../../../lib/http/api';
import { handleGuess } from '../../../../lib/engine/roundEngine';

export async function POST(req: Request) {
  return runApiHandler(req, handleGuess);
}
