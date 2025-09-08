import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  await sql`CREATE TABLE IF NOT EXISTS players (id text primary key, name text not null, alias text)`;
  await sql`CREATE TABLE IF NOT EXISTS matches (
    id text primary key,
    date_iso text,
    a1 text, a2 text, b1 text, b2 text,
    sets_a int, sets_b int,
    comment text,
    photo_base64 text,
    finalizado boolean default false
  )`;

  return json(req, { ok: true });
}
