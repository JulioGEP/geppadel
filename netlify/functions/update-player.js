import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const b = await req.json().catch(()=>({}));
  const { id } = b;
  if (!id) return json(req, { error: 'id-required' }, 400);

  const fields = [];
  if (typeof b.name === 'string')   fields.push(sql`name=${b.name.trim() || null}`);
  if (typeof b.alias === 'string')  fields.push(sql`alias=${b.alias.trim() || null}`);
  if (typeof b.photo_base64 === 'string') fields.push(sql`photo_base64=${b.photo_base64 || null}`);

  if (fields.length === 0) return json(req, { error: 'nothing-to-update' }, 400);

  await sql`UPDATE players SET ${sql(fields)} WHERE id=${id}`;
  return json(req, { ok: true });
}
