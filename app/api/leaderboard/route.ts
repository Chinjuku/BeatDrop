import { runApiHandler } from '../../../lib/http/api';
import { handleGetLeaderboard, handlePostLeaderboard } from '../../../lib/engine/leaderboard';

export async function GET(req: Request) {
  return runApiHandler(req, handleGetLeaderboard);
}

export async function POST(req: Request) {
  return runApiHandler(req, handlePostLeaderboard);
}
