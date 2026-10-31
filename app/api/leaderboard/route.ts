import { forwardToExpress } from '../../../lib/expressBridge';

export async function GET(req: Request) {
  return forwardToExpress(req, '/api/leaderboard');
}

export async function POST(req: Request) {
  return forwardToExpress(req, '/api/leaderboard');
}

