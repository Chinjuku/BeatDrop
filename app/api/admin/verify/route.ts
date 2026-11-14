import { providedAdminKey, runApiHandler } from '../../../../lib/http/api';

/** Checks an admin key typed on the admin page (body `adminKey`, or the usual headers). */
export async function POST(req: Request) {
  return runApiHandler(req, (apiReq, res) => {
    const configured = process.env.ADMIN_API_KEY;
    if (!configured) {
      res.status(500).json({ code: -1, message: 'ADMIN_API_KEY is not configured on server' });
      return;
    }
    const fromBody = typeof apiReq.body?.adminKey === 'string' ? apiReq.body.adminKey : undefined;
    const provided = fromBody || providedAdminKey(apiReq);
    if (provided === configured) {
      res.json({ code: 0, message: 'Authenticated' });
    } else {
      res.status(403).json({ code: 403, message: 'รหัสผ่าน Admin Key ไม่ถูกต้อง' });
    }
  });
}
