import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const { id } = await req.json().catch(()=>({}));
  if (!id) return json(req, { error: 'id-required' }, 400);

  await sql`UPDATE matches SET a1=NULL WHERE a1=${id}`;
  await sql`UPDATE matches SET a2=NULL WHERE a2=${id}`;
  await sql`UPDATE matches SET b1=NULL WHERE b1=${id}`;
  await sql`UPDATE matches SET b2=NULL WHERE b2=${id}`;
  await sql`DELETE FROM players WHERE id=${id}`;
  return json(req, { ok: true });
}
