// netlify/functions/migrate.js
import { sql, requireKey, json } from './_common/db.js';

export async function handler(event) {
  try {
    requireKey(event);

    await sql`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        alias TEXT,
        photo_base64 TEXT
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        date_iso TIMESTAMPTZ DEFAULT NOW(),
        a1 INT, a2 INT, b1 INT, b2 INT,
        s1a INT, s1b INT, s2a INT, s2b INT, s3a INT, s3b INT,
        comment TEXT,
        photo_base64 TEXT,
        finalizado BOOLEAN DEFAULT FALSE
      )
    `;

    // Añadir columnas por si venís de un esquema anterior
    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS alias TEXT`;
    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS photo_base64 TEXT`;
    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT`;

    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS photo_base64 TEXT`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS sets_a INT`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS sets_b INT`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS court_name TEXT`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS court_email TEXT`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS reservation_sent BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS calendar_sent BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE matches ALTER COLUMN reservation_sent SET DEFAULT FALSE`;
    await sql`ALTER TABLE matches ALTER COLUMN calendar_sent SET DEFAULT FALSE`;
    await sql`UPDATE matches SET reservation_sent=false WHERE reservation_sent IS NULL`;
    await sql`UPDATE matches SET calendar_sent=false WHERE calendar_sent IS NULL`;

    return json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    return json({ error: 'migrate-failed', details: String(err.message || err) }, status);
  }
}
