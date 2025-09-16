import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

const isLocalDateTime = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.trim());

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { id } = body;
  let { dateISO } = body;

  if (!id) return json(req, { error: 'id-required' }, 400);

  let normalized = null;
  if (dateISO === null || dateISO === undefined || dateISO === '') {
    normalized = null;
  } else if (typeof dateISO === 'string') {
    const trimmed = dateISO.trim();
    if (!trimmed) {
      normalized = null;
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return json(req, { error: 'invalid-date' }, 400);
      }
      normalized = isLocalDateTime(trimmed) ? trimmed : parsed.toISOString();
    }
  } else {
    return json(req, { error: 'invalid-date' }, 400);
  }

  const existing = await sql`SELECT id FROM matches WHERE id=${id} LIMIT 1`;
  if (existing.length === 0) return json(req, { error: 'not-found' }, 404);

  await sql`
    UPDATE matches
      SET date_iso=${normalized},
          reservation_sent=false,
          calendar_sent=false
      WHERE id=${id}
  `;

  return json(req, { ok: true, date_iso: normalized });
};
