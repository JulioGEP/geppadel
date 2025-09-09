import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  // Tablas base
  await sql`CREATE TABLE IF NOT EXISTS players (
    id text primary key,
    name text not null,
    alias text,
    photo_base64 text
  )`;

  await sql`CREATE TABLE IF NOT EXISTS matches (
    id text primary key,
    date_iso text,
    a1 text, a2 text, b1 text, b2 text,
    -- compat legado:
    sets_a int, sets_b int,
    -- NUEVO: juegos por set (0 si no jugado)
    s1a int default 0, s1b int default 0,
    s2a int default 0, s2b int default 0,
    s3a int default 0, s3b int default 0,
    comment text,
    photo_base64 text,
    finalizado boolean default false
  )`;

  // Por si la tabla existía antes, asegura columnas nuevas
  await sql`ALTER TABLE players  ADD COLUMN IF NOT EXISTS photo_base64 text`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s1a int default 0`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s1b int default 0`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s2a int default 0`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s2b int default 0`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s3a int default 0`;
  await sql`ALTER TABLE matches  ADD COLUMN IF NOT EXISTS s3b int default 0`;

  return json(req, { ok: true });
}
