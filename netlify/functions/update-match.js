import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return json(req, { error: 'method-not-allowed' }, 405);
  }
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const { id, dateISO } = body;
  if (!id) return json(req, { error: 'id-required' }, 400);

  const rawDate = (dateISO || '').trim();
  if (!rawDate) return json(req, { error: 'date-required' }, 400);
  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) return json(req, { error: 'invalid-date' }, 400);

  const existing = await sql`SELECT id, finalizado FROM matches WHERE id=${id}`;
  if (!existing.length) return json(req, { error: 'not-found' }, 404);
  if (existing[0].finalizado) return json(req, { error: 'already-finalized' }, 409);

  const [updated] = await sql`UPDATE matches SET date_iso=${rawDate} WHERE id=${id} RETURNING id, date_iso`;
  return json(req, { ok: true, match: updated });
};
