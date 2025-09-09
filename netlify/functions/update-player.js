// netlify/functions/update-player.js
import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  try {
    const b = await req.json().catch(() => ({}));
    const { id } = b;
    if (!id) return json(req, { error: 'id-required' }, 400);

    const fields = [];

    if (typeof b.name === 'string') {
      const v = b.name.trim();
      if (v) fields.push(sql`name = ${v}`);
    }
    if (typeof b.alias === 'string') {
      const v = b.alias.trim();
      fields.push(sql`alias = ${v || null}`);
    }
    if (typeof b.photo_base64 === 'string') {
      fields.push(sql`photo_base64 = ${b.photo_base64 || null}`);
    }

    if (fields.length === 0) {
      return json(req, { error: 'nothing-to-update' }, 400);
    }

    // ¡OJO! hay que unir con comas:
    await sql`UPDATE players SET ${sql.join(fields, sql`, `)} WHERE id = ${id}`;

    return json(req, { ok: true });
  } catch (e) {
    // Para que Netlify no devuelva respuesta vacía
    return json(req, { error: 'update-failed', details: String(e.message || e) }, 500);
  }
};
