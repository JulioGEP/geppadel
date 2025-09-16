// netlify/functions/delete-match.js
import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';
import { sendMail } from './_common/email.js';
import { formatDateParts, formatHumanList } from './_common/format.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const { id } = await req.json().catch(()=>({}));
  if (!id) return json(req, { error: 'id-required' }, 400);

  const matches = await sql`
    SELECT id, date_iso, a1, a2, b1, b2, court_name, court_email, calendar_sent, finalizado
    FROM matches WHERE id=${id}
  `;
  if (matches.length === 0) return json(req, { error: 'not-found' }, 404);
  const match = matches[0];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const matchDate = match.date_iso ? new Date(match.date_iso) : null;
  const isPastMatch = !!(matchDate && matchDate < today);

  const shouldNotifyCancel = !match.finalizado && match.calendar_sent && !isPastMatch;
  let cancelError = null;
  if (shouldNotifyCancel) {
    const playerIds = [match.a1, match.a2, match.b1, match.b2].filter(Boolean);
    const players = playerIds.length
      ? await sql`SELECT id, name, email FROM players WHERE id = ANY(${playerIds})`
      : [];
    const participantEmails = players.filter(p=>p.email).map(p=>p.email);
    const participantNames = players.map(p=>p.name).filter(Boolean);
    const namesText = participantNames.length ? formatHumanList(participantNames) : 'los participantes';
    const { date, time } = formatDateParts(match.date_iso);
    const body = `Se cancela el partido para el día ${date} a la hora ${time} que jugabas con ${namesText} en la pista ${match.court_name || 'pendiente'}.`;

    const recipients = participantEmails.slice();
    const hasCourt = !!match.court_email;
    let to = '';
    let cc = [];
    if (hasCourt) {
      to = match.court_email;
      cc = recipients;
    } else if (recipients.length) {
      to = recipients[0];
      cc = recipients.slice(1);
    }

    if (to) {
      try {
        await sendMail({
          to,
          cc,
          subject: `Cancelación partido ${date}`,
          text: body,
        });
      } catch (err) {
        cancelError = err;
      }
    }
  }

  if (cancelError) return json(req, { error: 'cancel-mail-failed', details: String(cancelError.message || cancelError) }, 502);

  await sql`DELETE FROM matches WHERE id=${id}`;
  return json(req, { ok: true });
};
