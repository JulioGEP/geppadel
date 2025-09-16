import { sql } from './_common/db.js';
import { json, preflight } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  const rows = await sql`
    SELECT id, date_iso, a1, a2, b1, b2, sets_a, sets_b,
           s1a, s1b, s2a, s2b, s3a, s3b,
           finalizado, comment, photo_base64,
           court_name, court_email, reservation_sent, calendar_sent
    FROM matches
    ORDER BY COALESCE(date_iso,'') DESC, id DESC`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enriched = rows.map(row => {
    const matchDate = row.date_iso ? new Date(row.date_iso) : null;
    const isPast = !!(matchDate && matchDate < today);
    if (isPast && !row.court_name) {
      return { ...row, court_name: 'Padel 1 Sabadell' };
    }
    return row;
  });
  return json(req, enriched);
}
