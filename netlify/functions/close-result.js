import { sql } from './_common/db.js';
import { json, preflight, requireAuth } from './_common/http.js';

const normInt = v => Number.isFinite(+v) ? Math.max(0, parseInt(v,10)) : 0;

export default async (req) => {
  const p = preflight(req); if (p) return p;
  if (!requireAuth(req)) return json(req, { error: 'unauthorized' }, 401);

  const b = await req.json().catch(()=>({}));
  const { id, comment } = b;
  let { sets } = b; // [{a,b},{a,b},{a,b}]
  if (!id) return json(req, { error: 'id-required' }, 400);

  // Compat (si alguien manda campos sueltos)
  if (!Array.isArray(sets)) {
    sets = [
      { a: normInt(b.s1a ?? b.sa1 ?? b.sa ?? 0), b: normInt(b.s1b ?? b.sb1 ?? b.sb ?? 0) },
      { a: normInt(b.s2a ?? 0), b: normInt(b.s2b ?? 0) },
      { a: normInt(b.s3a ?? 0), b: normInt(b.s3b ?? 0) },
    ];
  } else {
    sets = [0,1,2].map(i => {
      const s = sets[i] || {};
      return { a: normInt(s.a), b: normInt(s.b) };
    });
  }

  // Cuenta sets y juegos (0-0 en 3º se ignora)
  let winsA=0, winsB=0, gamesA=0, gamesB=0;
  sets.forEach((s, i) => {
    const a=s.a|0, b=s.b|0;
    if (i===2 && a===0 && b===0) return; // 3er set sin jugar permitido
    gamesA += a; gamesB += b;
    if (a>b) winsA++; else if (b>a) winsB++;
  });

  await sql`
    UPDATE matches SET
      s1a=${sets[0].a}, s1b=${sets[0].b},
      s2a=${sets[1].a}, s2b=${sets[1].b},
      s3a=${sets[2].a}, s3b=${sets[2].b},
      sets_a=${winsA}, sets_b=${winsB},
      finalizado=true,
      comment=${comment || null}
    WHERE id=${id}
  `;
  return json(req, { ok: true, sets, sets_a:winsA, sets_b:winsB });
}
