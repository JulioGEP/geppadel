// netlify/functions/update-match-photo.js
import { sql, requireKey, json } from './_common/db.js';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
      return json({ error: 'method-not-allowed' }, 405);
    }
    requireKey(event);

    const { id, photo_base64 } = JSON.parse(event.body || '{}');
    if (!id || !photo_base64) return json({ error: 'missing-fields' }, 400);

    // (Límite simple para evitar imágenes gigantes)
    if (photo_base64.length > 5_000_000) {
      return json({ error: 'image-too-large' }, 413);
    }

    const rows = await sql`
      UPDATE matches
      SET photo_base64 = ${photo_base64}
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return json({ error: 'not-found' }, 404);
    return json({ ok: true, id });
  } catch (err) {
    const status = err.statusCode || 500;
    return json({ error: 'update-photo-failed', details: String(err.message || err) }, status);
  }
}
