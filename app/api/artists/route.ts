import { forwardToExpress } from '../../../lib/expressBridge';
export { POST } from './sync/route';

export async function GET(req: Request) {
  return forwardToExpress(req, '/api/artists');
}

