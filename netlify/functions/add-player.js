import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const name = (body.name || '').trim();
  const alias = (body.alias || '').trim();
  const photo = (body.photo_base64 || null);
  if (!name) return json(req, { error: 'name-required' }, 400);

  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  await sql`INSERT INTO players (id, name, alias, photo_base64) VALUES (${id}, ${name}, ${alias || null}, ${photo})`;
  return json(req, { id, name, alias, photo_base64: photo });
}
