// netlify/functions/list-players.js
import { sql } from './_common/db.js';
import { json, preflight } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  try {
    const rows = await sql`
      SELECT id, name, alias, photo_base64
      FROM players
      ORDER BY name ASC
    `;
    return json(req, rows);
  } catch (e) {
    return json(req, { error: 'list-failed', details: String(e.message || e) }, 500);
  }
};
