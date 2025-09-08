import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

function validScore(a,b){
  return (a===3&&b===0)||(a===0&&b===3)||(a===2&&b===1)||(a===1&&b===2);
}

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const { id, setsA, setsB, comment } = await req.json().catch(()=>({}));
  if (!id) return json(req, { error: 'id-required' }, 400);
  if (typeof setsA !== 'number' || typeof setsB !== 'number' || !validScore(setsA, setsB))
    return json(req, { error: 'invalid-score' }, 400);

  await sql`UPDATE matches SET sets_a=${setsA}, sets_b=${setsB}, finalizado=true, comment=${comment || null} WHERE id=${id}`;
  return json(req, { ok: true });
}
