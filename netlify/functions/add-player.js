import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const name = (body.name || '').trim();
  const alias = (body.alias || '').trim();
  if (!name) return json(req, { error: 'name-required' }, 400);

  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  await sql`INSERT INTO players (id, name, alias) VALUES (${id}, ${name}, ${alias || null})`;
  return json(req, { id, name, alias });
}
