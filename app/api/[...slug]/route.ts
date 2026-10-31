import { forwardToExpress } from '../../../lib/expressBridge';

export async function GET(req: Request) {
  return forwardToExpress(req);
}

export async function POST(req: Request) {
  return forwardToExpress(req);
}

export async function DELETE(req: Request) {
  return forwardToExpress(req);
}

export async function OPTIONS(req: Request) {
  return forwardToExpress(req);
}

