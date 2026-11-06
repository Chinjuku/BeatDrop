import { forwardToExpress } from '../../../../lib/expressBridge';

export async function POST(req: Request) {
  return forwardToExpress(req, '/api/daily/round');
}
