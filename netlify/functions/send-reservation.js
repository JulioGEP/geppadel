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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const matchDate = match.date_iso ? new Date(match.date_iso) : null;
  const isPastMatch = !!(matchDate && matchDate < today);
  if (isPastMatch) return json(req, { error: 'No se pueden enviar correos para partidos anteriores a hoy.' }, 400);

  const playerIds = [match.a1, match.a2, match.b1, match.b2].filter(Boolean);
  const players = playerIds.length
    ? await sql`SELECT id, name, email FROM players WHERE id = ANY(${playerIds})`
    : [];
  const participantEmails = players.filter(p=>p.email).map(p=>p.email);
  const { date, time } = formatDateParts(match.date_iso);
  const subjectCourt = match.court_name || 'Pista por confirmar';
  const subject = `Reserva pista ${subjectCourt} - ${date} ${time}`;

  try {
    await sendMail({
      to: match.court_email,
      cc: participantEmails,
      subject,
      text: message,
    });
  } catch (err) {
    console.error('send-reservation mail error', err);
    const errorMessage = err && err.message ? `No se pudo enviar el correo: ${err.message}` : 'No se pudo enviar el correo.';
    return json(req, { error: errorMessage }, 500);
  }

  try {
    await sql`UPDATE matches SET reservation_sent=true WHERE id=${matchId}`;
  } catch (err) {
    console.error('send-reservation db error', err);
    return json(req, { error: 'El correo se envió pero no se pudo actualizar el estado de la reserva.' }, 500);
  }

  return json(req, { ok: true, reservation_sent: true });
};
