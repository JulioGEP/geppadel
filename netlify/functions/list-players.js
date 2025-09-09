import { sql } from './_common/db.js';
import { json, preflight } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  const rows = await sql`SELECT id, name, alias, photo_base64 FROM players ORDER BY name ASC`;
  return json(req, rows);
}
