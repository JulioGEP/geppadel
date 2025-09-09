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

    const sets = [];
    const params = [];

    if (typeof b.name === 'string' && b.name.trim()) {
      sets.push(`name = $${params.length + 1}`);
      params.push(b.name.trim());
    }
    if (typeof b.alias === 'string') {
      sets.push(`alias = $${params.length + 1}`);
      params.push(b.alias.trim() || null);
    }
    if (typeof b.photo_base64 === 'string') {
      sets.push(`photo_base64 = $${params.length + 1}`);
      params.push(b.photo_base64 || null);
    }

    if (sets.length === 0) {
      return json(req, { error: 'nothing-to-update' }, 400);
    }

    params.push(id); // para el WHERE
    const q = `UPDATE players SET ${sets.join(', ')} WHERE id = $${params.length}`;

    // Ejecuta el UPDATE con parámetros de forma segura
    await sql.unsafe(q, params);

    return json(req, { ok: true });
  } catch (e) {
    return json(req, { error: 'update-failed', details: String(e.message || e) }, 500);
  }
};
