import { DISCOVER_LIMIT, runApiHandler } from '../../../lib/http/api';
import { handleGetArtists } from '../../../lib/engine/artistRoutes';
export { POST } from './sync/route';

export async function GET(req: Request) {
  // Live iTunes discovery gets its own, tighter limit.
  return runApiHandler(req, handleGetArtists, {
    limit: (apiReq) => (apiReq.query.discover === 'true' ? DISCOVER_LIMIT : undefined),
  });
}
