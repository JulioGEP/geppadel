// netlify/functions/update-player.js
import { sql, requireKey, json } from './_common/db.js';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
      return json({ error: 'method-not-allowed' }, 405);
    }
    requireKey(event);

    const { id, name = null, alias = null, photo_base64 = null, email } =
      JSON.parse(event.body || '{}');

    if (!id) return json({ error: 'missing-id' }, 400);

    const emailProvided = email !== undefined;
    let emailValue = null;
    if (emailProvided) {
      const trimmed = typeof email === 'string' ? email.trim() : '';
      emailValue = trimmed ? trimmed : null;
    }

    // Asegura columnas y actualiza solo lo recibido (COALESCE deja el valor actual si llega null)
    const rows = await sql`
      UPDATE players
      SET
        name         = COALESCE(${name}, name),
        alias        = COALESCE(${alias}, alias),
        photo_base64 = COALESCE(${photo_base64}, photo_base64),
        email        = CASE WHEN ${emailProvided} THEN ${emailValue} ELSE email END
      WHERE id = ${id}
      RETURNING id, name, alias, photo_base64, email
    `;

    if (rows.length === 0) return json({ error: 'not-found' }, 404);
    return json({ ok: true, player: rows[0] });
  } catch (err) {
    const status = err.statusCode || 500;
    return json({ error: 'update-failed', details: String(err.message || err) }, status);
  }
}
