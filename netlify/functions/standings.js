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

const matchPoints = (sa, sb) => {
  if (sa > sb) {
    return [sb === 0 ? 3 : 2, sb === 0 ? 0 : 1];
  }
  if (sb > sa) {
    return [sa === 0 ? 0 : 1, sa === 0 ? 3 : 2];
  }
  return [0, 0];
};

const EXCLUDED_MATCH_TIMESTAMPS = new Set([
  Date.parse('2026-03-04T13:30:00Z')
]);

// Partidos a partir de esta fecha usan la fórmula GEPTomic v2
const GEPTOMIC_V2_DATE = Date.parse('2026-05-05T00:00:00Z');

// Factor K adaptativo: amplifica sorpresas, amortigua resultados esperados.
// Multiplica el delta ELO base según margen de juegos y diferencia de GEP.
// K=1 cuando no hay datos de juegos (degradación a fórmula original).
const kFactor = (ratingA, ratingB, ga, gb, sa, sb, aWins) => {
  const MAX_JUEGOS    = 12; // diferencia máxima real en padel (6-0, 6-0)
  const MAX_DELTA_GEP = 2;  // diferencia máxima razonable entre promedios de pareja
  const ALPHA = 0.5;        // amplificador para sorpresas
  const BETA  = 0.4;        // amortiguador para resultados esperados

  const loserSets = aWins ? sb : sa;
  const F_sets    = loserSets === 0 ? 1.0 : 0.8; // 2-0 más decisivo que 2-1

  const diff_juegos = Math.abs(ga - gb);
  const margin      = Math.min(diff_juegos / MAX_JUEGOS, 1.0) * F_sets;

  const gepWinner     = aWins ? ratingA : ratingB;
  const gepLoser      = aWins ? ratingB : ratingA;
  const was_upset     = gepWinner < gepLoser;
  const delta_gep_norm = Math.min(Math.abs(gepWinner - gepLoser) / MAX_DELTA_GEP, 1.0);

  return was_upset
    ? 1 + ALPHA * margin * delta_gep_norm
    : 1 - BETA  * margin * delta_gep_norm;
};

const shouldCountMatch = (match) => {
  if (!match?.date_iso) return true;
  const matchTime = new Date(match.date_iso).getTime();
  if (Number.isNaN(matchTime)) return true;
  return !EXCLUDED_MATCH_TIMESTAMPS.has(matchTime);
};

export default async (req) => {
  const p = preflight(req); if (p) return p;

  const players = await sql`SELECT id, name, alias, photo_base64 FROM players`;
  const pMap = new Map(players.map(p=>[p.id,p]));

  const matches = await sql`SELECT id, date_iso, a1,a2,b1,b2,sets_a,sets_b,s1a,s1b,s2a,s2b,s3a,s3b,finalizado FROM matches WHERE finalizado=true`;

  const sortMatches = (list) => [...list].sort((a, b) => {
    const da = a.date_iso ? new Date(a.date_iso).getTime() : 0;
    const db = b.date_iso ? new Date(b.date_iso).getTime() : 0;
    if (da !== db) return da - db;
    return (a.id || 0) - (b.id || 0);
  });

  const computeStandings = (matchList) => {
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

    for (const m of matchList) {
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
        const useV2 = m.date_iso && Date.parse(m.date_iso) >= GEPTOMIC_V2_DATE;
        const K = useV2 ? kFactor(ratingA, ratingB, ga, gb, sa, sb, aWins) : 1;
        A.forEach(id=>{ ind.get(id).geptomic += K * (scoreA - expA); });
        B.forEach(id=>{ ind.get(id).geptomic += K * (scoreB - expB); });
      }

      // Elo rating update for pairs
      if (pairA && pairB) {
        const ratingA = pairA.geptomic;
        const ratingB = pairB.geptomic;
        const expA = 1/(1+10**((ratingB-ratingA)/5));
        const expB = 1 - expA;
        const scoreA = aWins ? 1 : 0;
        const scoreB = 1 - scoreA;
        const useV2 = m.date_iso && Date.parse(m.date_iso) >= GEPTOMIC_V2_DATE;
        const K = useV2 ? kFactor(ratingA, ratingB, ga, gb, sa, sb, aWins) : 1;
        pairA.geptomic += K * (scoreA - expA);
        pairB.geptomic += K * (scoreB - expB);
      }

      // PJ
      A.forEach(id=>{ if(ind.has(id)) ind.get(id).pj++; });
      B.forEach(id=>{ if(ind.has(id)) ind.get(id).pj++; });
      // PG/PP
      if (aWins) { A.forEach(id=>ind.get(id).pg++); B.forEach(id=>ind.get(id).pp++); }
      else if (bWins) { B.forEach(id=>ind.get(id).pg++); A.forEach(id=>ind.get(id).pp++); }
      const [pointsA, pointsB] = matchPoints(sa, sb);

      // Puntos + juegos ganados/perdidos
      A.forEach(id=>{
        const r = ind.get(id);
        r.puntos += pointsA;
        r.jg += ga;
        r.jp += gb;
      });
      B.forEach(id=>{
        const r = ind.get(id);
        r.puntos += pointsB;
        r.jg += gb;
        r.jp += ga;
      });

      // Parejas stats
      if (pairA) {
        pairA.pj++;
        pairA.puntos+=pointsA;
        pairA.jg+=ga;
        pairA.jp+=gb;
        if (aWins) pairA.pg++;
        else if (bWins) pairA.pp++;
      }
      if (pairB) {
        pairB.pj++;
        pairB.puntos+=pointsB;
        pairB.jg+=gb;
        pairB.jp+=ga;
        if (bWins) pairB.pg++;
        else if (aWins) pairB.pp++;
      }
    }

    const formatRating = (entry) => entry.pj ? +entry.geptomic.toFixed(2) : 0;

    const individual = Array.from(ind.values())
      .sort((a,b)=>
        b.puntos - a.puntos ||
        (b.jg - b.jp) - (a.jg - a.jp) ||
        b.jg - a.jg ||
        b.pg - a.pg ||
        a.pp - b.pp ||
        a.name.localeCompare(b.name)
      )
      .map(r=>({ ...r, dif:r.jg - r.jp, geptomic:formatRating(r) }));
    const parejas = Array.from(pairs.values())
      .sort((a,b)=>
        b.puntos - a.puntos ||
        (b.jg - b.jp) - (a.jg - a.jp) ||
        b.jg - a.jg ||
        b.pg - a.pg ||
        a.pp - b.pp ||
        a.name.localeCompare(b.name)
      )
      .map(r=>({ ...r, dif:r.jg - r.jp, geptomic:formatRating(r) }));

    return { individual, parejas };
  };

  const orderedMatches = sortMatches(matches.filter(shouldCountMatch));
  const previousMatches = orderedMatches.length > 0 ? orderedMatches.slice(0, -1) : [];

  const currentStandings = computeStandings(orderedMatches);
  const previousStandings = computeStandings(previousMatches);

  const prevIndPositions = new Map(previousStandings.individual.map((row, idx) => [row.id, idx + 1]));
  const prevPairPositions = new Map(previousStandings.parejas.map((row, idx) => [row.key, idx + 1]));
  const prevIndGeptomic = new Map(previousStandings.individual.map(row => [row.id, row.geptomic]));
  const prevPairGeptomic = new Map(previousStandings.parejas.map(row => [row.key, row.geptomic]));

  const individual = currentStandings.individual.map((row, idx) => ({
    ...row,
    prev_position: prevIndPositions.get(row.id) ?? idx + 1,
    prev_geptomic: prevIndGeptomic.get(row.id) ?? 0
  }));
  const parejas = currentStandings.parejas.map((row, idx) => ({
    ...row,
    prev_position: prevPairPositions.get(row.key) ?? idx + 1,
    prev_geptomic: prevPairGeptomic.get(row.key) ?? 0
  }));

  return json(req, { individual, parejas });
}
