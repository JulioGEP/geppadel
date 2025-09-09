import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const { id, photo_base64 } = await req.json().catch(()=>({}));
  if (!id) return json(req, { error: 'id-required' }, 400);

  await sql`UPDATE matches SET photo_base64=${photo_base64 || null} WHERE id=${id}`;
  return json(req, { ok: true });
}
