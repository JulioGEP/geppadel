import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';
import { sendMail } from './_common/email.js';
import { formatDateParts } from './_common/format.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const matchId = body.matchId;
  const message = (body.message || '').trim();
  if (!matchId) return json(req, { error: 'match-required' }, 400);
  if (!message) return json(req, { error: 'message-required' }, 400);

  const rows = await sql`
    SELECT id, date_iso, a1, a2, b1, b2, court_name, court_email
    FROM matches WHERE id=${matchId}
  `;
  if (!rows.length) return json(req, { error: 'not-found' }, 404);
  const match = rows[0];
  if (!match.court_email) return json(req, { error: 'court-email-missing' }, 400);

  const playerIds = [match.a1, match.a2, match.b1, match.b2].filter(Boolean);
  const players = playerIds.length
    ? await sql`SELECT id, name, email FROM players WHERE id = ANY(${playerIds})`
    : [];
  const participantEmails = players.filter(p=>p.email).map(p=>p.email);
  const { date, time } = formatDateParts(match.date_iso);
  const subject = `Reserva pista ${match.court_name || ''} - ${date} ${time}`.trim();

  await sendMail({
    to: match.court_email,
    cc: participantEmails,
    subject,
    text: message,
  });

  await sql`UPDATE matches SET reservation_sent=true WHERE id=${matchId}`;
  return json(req, { ok: true, reservation_sent: true });
};
