// netlify/functions/update-player.js
import { sql, requireKey, json } from './_common/db.js';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
      return json({ error: 'method-not-allowed' }, 405);
    }
    requireKey(event);

    const { id, name = null, alias = null, photo_base64 = null } =
      JSON.parse(event.body || '{}');

    if (!id) return json({ error: 'missing-id' }, 400);

    // Asegura columnas y actualiza solo lo recibido (COALESCE deja el valor actual si llega null)
    const rows = await sql`
      UPDATE players
      SET
        name         = COALESCE(${name}, name),
        alias        = COALESCE(${alias}, alias),
        photo_base64 = COALESCE(${photo_base64}, photo_base64)
      WHERE id = ${id}
      RETURNING id, name, alias, photo_base64
    `;

    if (rows.length === 0) return json({ error: 'not-found' }, 404);
    return json({ ok: true, player: rows[0] });
  } catch (err) {
    const status = err.statusCode || 500;
    return json({ error: 'update-failed', details: String(err.message || err) }, status);
  }
}
