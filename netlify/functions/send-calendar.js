import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';
import { sendMail, formatICS } from './_common/email.js';
import { formatDateParts, formatHumanList } from './_common/format.js';

const ninetyMinutes = 90 * 60 * 1000;

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const body = await req.json().catch(()=>({}));
  const matchId = body.matchId;
  if (!matchId) return json(req, { error: 'match-required' }, 400);

  const rows = await sql`
    SELECT id, date_iso, a1, a2, b1, b2, court_name, calendar_sent, finalizado
    FROM matches WHERE id=${matchId}
  `;
  if (!rows.length) return json(req, { error: 'not-found' }, 404);
  const match = rows[0];
  if (match.finalizado) return json(req, { error: 'already-finalized' }, 400);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const matchDate = match.date_iso ? new Date(match.date_iso) : null;
  const isPastMatch = !!(matchDate && matchDate < today);
  if (isPastMatch) return json(req, { error: 'No se pueden enviar correos para partidos anteriores a hoy.' }, 400);

  const playerIds = [match.a1, match.a2, match.b1, match.b2].filter(Boolean);
  const players = playerIds.length
    ? await sql`SELECT id, name, email FROM players WHERE id = ANY(${playerIds})`
    : [];
  const attendees = players.filter(p=>p.email).map(p=>({ name: p.name, email: p.email }));
  if (!attendees.length) return json(req, { error: 'no-recipients' }, 400);

  const { date, time } = formatDateParts(match.date_iso);
  const namesText = formatHumanList(players.map(p=>p.name));
  const start = match.date_iso ? new Date(match.date_iso) : new Date();
  const end = new Date(start.getTime() + ninetyMinutes);
  const organizerEmail = process.env.SMTP_FROM || process.env.MAIL_FROM || 'julio@gepgroup.es';
  const summaryCourt = match.court_name || 'Pista por confirmar';
  const descriptionCourt = match.court_name || 'pista por confirmar';
  const summary = `GEP Padel + ${summaryCourt}`;
  const description = `Partido en ${descriptionCourt} el ${date} a las ${time}. Participantes: ${namesText}.`;
  const icsContent = formatICS({
    id: match.id,
    summary,
    description,
    location: match.court_name || '',
    start,
    end,
    organizer: { name: 'Julio de GEP', email: organizerEmail },
    attendees,
  });

  const text = `Hola!

Adjunto la invitación de calendario para el partido en ${match.court_name || 'pista por confirmar'} el ${date} a las ${time}.
Participantes: ${namesText}.
`;

  await sendMail({
    to: attendees[0].email,
    cc: attendees.slice(1).map(a=>a.email),
    subject: summary,
    text,
    attachments: [
      {
        filename: 'gep-padel.ics',
        content: icsContent,
        contentType: 'text/calendar; method=REQUEST; charset="utf-8"'
      }
    ]
  });

  await sql`UPDATE matches SET calendar_sent=true WHERE id=${matchId}`;
  return json(req, { ok: true, calendar_sent: true });
};
