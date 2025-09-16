import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const b = await req.json().catch(()=>({}));
  const { dateISO, a1, a2, b1, b2, comment, court_name, court_email } = b;
  if (!a1 || !a2 || !b1 || !b2) return json(req, { error: 'need-4-players' }, 400);

  const courtName = (court_name || '').trim();
  const courtEmail = (court_email || '').trim();
  if (!courtName || !courtEmail) return json(req, { error: 'court-required' }, 400);

  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  const rawDate = (() => {
    if (!dateISO) return null;
    const parsed = new Date(dateISO);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  })();
  const [match] = await sql`INSERT INTO matches (id, date_iso, a1, a2, b1, b2, comment, finalizado, court_name, court_email, reservation_sent, calendar_sent)
                            VALUES (${id}, ${rawDate}, ${a1}, ${a2}, ${b1}, ${b2}, ${comment || null}, false, ${courtName}, ${courtEmail}, false, false)
                            RETURNING id`;
  return json(req, match);
}
