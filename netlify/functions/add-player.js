import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const name = (body.name || '').trim();
  const alias = (body.alias || '').trim();
  const photo = (body.photo_base64 || null);
  const email = (body.email || '').trim();
  if (!name) return json(req, { error: 'name-required' }, 400);

  const aliasVal = alias || null;
  const emailVal = email || null;
  const photoVal = photo || null;
  const rows = await sql`
    INSERT INTO players (name, alias, photo_base64, email)
    VALUES (${name}, ${aliasVal}, ${photoVal}, ${emailVal})
    RETURNING id, name, alias, photo_base64, email
  `;
  const created = rows[0] || { id: null, name, alias: aliasVal, photo_base64: photoVal, email: emailVal };
  return json(req, created);
}
