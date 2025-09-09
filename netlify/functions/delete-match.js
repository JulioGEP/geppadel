// netlify/functions/delete-match.js
import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const { id } = await req.json().catch(()=>({}));
  if (!id) return json(req, { error: 'id-required' }, 400);

  await sql`DELETE FROM matches WHERE id=${id}`;
  return json(req, { ok: true });
};
