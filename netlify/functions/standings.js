import { sql } from './_common/db.js';
import { json, preflight } from './_common/http.js';

const sumSetsGames = (m) => {
  // Si vienen de legado (solo sets_a/sets_b), no hay juegos
  const sets = [
    { a: m.s1a ?? 0, b: m.s1b ?? 0 },
    { a: m.s2a ?? 0, b: m.s2b ?? 0 },
    { a: m.s3a ?? 0, b: m.s3b ?? 0 },
  ];
  let sa=0, sb=0, ga=0, gb=0;
  sets.forEach((s,i)=>{
    if (i===2 && s.a===0 && s.b===0) return;
    ga+=s.a; gb+=s.b; if (s.a>s.b) sa++; else if (s.b>s.a) sb++;
  });
  // Fallback a sets_a/sets_b si no hay juegos
  if (ga+gb===0 && (m.sets_a!=null || m.sets_b!=null)) { sa = m.sets_a|0; sb = m.sets_b|0; }
  return { sa, sb, ga, gb };
};

export default async (req) => {
  const p = preflight(req); if (p) return p;

  const players = await sql`SELECT id, name, alias, photo_base64 FROM players`;
  const pMap = new Map(players.map(p=>[p.id,p]));

  const matches = await sql`SELECT a1,a2,b1,b2,sets_a,sets_b,s1a,s1b,s2a,s2b,s3a,s3b,finalizado FROM matches WHERE finalizado=true`;

  // Individual
  const ind = new Map();
  players.forEach(pl => ind.set(pl.id, {
    id:pl.id,
    name:pl.name,
    alias:pl.alias||'',
    photo:pl.photo_base64||'',
    puntos:0,
    jg:0,
    jp:0,
    pj:0,
    pg:0,
    pp:0,
    geptomic:4
  }));

  // Parejas
  const pairKey = (x,y)=>[x,y].sort().join('|');
  const pairs = new Map();

  for (const m of matches) {
    const { sa, sb, ga, gb } = sumSetsGames(m);
    const aWins = sa>sb, bWins = sb>sa;
    const A = [m.a1,m.a2].filter(Boolean);
    const B = [m.b1,m.b2].filter(Boolean);

    // ensure pair objects exist
    let pairA=null, pairB=null;
    if (A.length===2) {
      const k = pairKey(A[0],A[1]);
      if (!pairs.has(k)) {
        const p1=pMap.get(A[0])||{}, p2=pMap.get(A[1])||{};
        pairs.set(k, { key:k,
          a:A[0], b:A[1],
          name:`${p1.name||'?'} + ${p2.name||'?'}`,
          photos:[p1.photo_base64||'', p2.photo_base64||''],
          puntos:0, jg:0, jp:0, pj:0, pg:0, pp:0,
          geptomic:4
        });
      }
      pairA = pairs.get(k);
    }
    if (B.length===2) {
      const k = pairKey(B[0],B[1]);
      if (!pairs.has(k)) {
        const p1=pMap.get(B[0])||{}, p2=pMap.get(B[1])||{};
        pairs.set(k, { key:k,
          a:B[0], b:B[1],
          name:`${p1.name||'?'} + ${p2.name||'?'}`,
          photos:[p1.photo_base64||'', p2.photo_base64||''],
          puntos:0, jg:0, jp:0, pj:0, pg:0, pp:0,
          geptomic:4
        });
      }
      pairB = pairs.get(k);
    }

    // Elo rating update for individuals
    if (A.length && B.length) {
      const ratingA = A.reduce((s,id)=>s+ind.get(id).geptomic,0)/A.length;
      const ratingB = B.reduce((s,id)=>s+ind.get(id).geptomic,0)/B.length;
      const expA = 1/(1+10**((ratingB-ratingA)/5));
      const expB = 1 - expA;
      const scoreA = aWins ? 1 : 0;
      const scoreB = 1 - scoreA;
      A.forEach(id=>{ ind.get(id).geptomic += (scoreA - expA); });
      B.forEach(id=>{ ind.get(id).geptomic += (scoreB - expB); });
    }

    // Elo rating update for pairs
    if (pairA && pairB) {
      const ratingA = pairA.geptomic;
      const ratingB = pairB.geptomic;
      const expA = 1/(1+10**((ratingB-ratingA)/5));
      const expB = 1 - expA;
      const scoreA = aWins ? 1 : 0;
      const scoreB = 1 - scoreA;
      pairA.geptomic += (scoreA - expA);
      pairB.geptomic += (scoreB - expB);
    }

    // PJ
    A.forEach(id=>{ if(ind.has(id)) ind.get(id).pj++; });
    B.forEach(id=>{ if(ind.has(id)) ind.get(id).pj++; });
    // PG/PP
    if (aWins) { A.forEach(id=>ind.get(id).pg++); B.forEach(id=>ind.get(id).pp++); }
    else if (bWins) { B.forEach(id=>ind.get(id).pg++); A.forEach(id=>ind.get(id).pp++); }
    // Puntos (sets) + juegos ganados/perdidos
    A.forEach(id=>{
      const r = ind.get(id);
      r.puntos += sa;
      r.jg += ga;
      r.jp += gb;
    });
    B.forEach(id=>{
      const r = ind.get(id);
      r.puntos += sb;
      r.jg += gb;
      r.jp += ga;
    });

    // Parejas stats
    if (pairA) {
      pairA.pj++;
      pairA.puntos+=sa;
      pairA.jg+=ga;
      pairA.jp+=gb;
      if (aWins) pairA.pg++;
      else if (bWins) pairA.pp++;
    }
    if (pairB) {
      pairB.pj++;
      pairB.puntos+=sb;
      pairB.jg+=gb;
      pairB.jp+=ga;
      if (bWins) pairB.pg++;
      else if (aWins) pairB.pp++;
    }
  }

  const individual = Array.from(ind.values())
    .sort((a,b)=>
      b.puntos - a.puntos ||
      (b.jg - b.jp) - (a.jg - a.jp) ||
      b.jg - a.jg ||
      b.pg - a.pg ||
      a.pp - b.pp ||
      a.name.localeCompare(b.name)
    )
    .map(r=>({ ...r, dif:r.jg - r.jp, geptomic:+r.geptomic.toFixed(2) }));
  const parejas = Array.from(pairs.values())
    .sort((a,b)=>
      b.puntos - a.puntos ||
      (b.jg - b.jp) - (a.jg - a.jp) ||
      b.jg - a.jg ||
      b.pg - a.pg ||
      a.pp - b.pp ||
      a.name.localeCompare(b.name)
    )
    .map(r=>({ ...r, dif:r.jg - r.jp, geptomic:+r.geptomic.toFixed(2) }));

  return json(req, { individual, parejas });
}
