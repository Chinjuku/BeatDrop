import { forwardToExpress } from '../../../../lib/expressBridge';

export async function GET(req: Request) {
  return forwardToExpress(req, '/api/daily/leaderboard');
}
