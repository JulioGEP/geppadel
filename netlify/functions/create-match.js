import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const b = await req.json().catch(()=>({}));
  const { dateISO, a1, a2, b1, b2, comment, photo_base64 } = b;
  if (!a1 || !a2 || !b1 || !b2) return json(req, { error: 'need-4-players' }, 400);

  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  await sql`INSERT INTO matches (id, date_iso, a1, a2, b1, b2, comment, photo_base64, finalizado)
            VALUES (${id}, ${dateISO || null}, ${a1}, ${a2}, ${b1}, ${b2}, ${comment || null}, ${photo_base64 || null}, false)`;
  return json(req, { id });
}
