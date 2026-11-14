import { runApiHandler } from '../../../lib/http/api';
import { handleAutocomplete } from '../../../lib/engine/roundEngine';

export async function GET(req: Request) {
  return runApiHandler(req, handleAutocomplete);
}
