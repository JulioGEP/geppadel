import { sql } from './_common/db.js';
import { json, preflight } from './_common/http.js';

function points(a,b){
  const ok = (a===3&&b===0)||(a===0&&b===3)||(a===2&&b===1)||(a===1&&b===2);
  if(!ok) return null;
  if((a===3&&b===0)||(a===0&&b===3)) return {A:a>b?3:0,B:b>a?3:0};
  return {A:a>b?2:1,B:b>a?2:1};
}

export default async (req) => {
  const p = preflight(req); if (p) return p;
  const players = await sql`SELECT id, name, alias FROM players`;
  const matches = await sql`SELECT a1,a2,b1,b2,sets_a,sets_b,finalizado FROM matches WHERE finalizado=true`;

  const table = new Map();
  for(const pl of players) table.set(pl.id, {id:pl.id,name:pl.name,alias:pl.alias||'',puntos:0,pj:0,pg:0,pp:0});

  for(const m of matches){
    const s = points(m.sets_a, m.sets_b);
    if(!s) continue;
    const add=(id,k,v=1)=>{ if(id && table.has(id)) table.get(id)[k]+=v; };
    const addP=(id,v)=>{ if(id && table.has(id)) table.get(id).puntos+=v; };

    [m.a1,m.a2,m.b1,m.b2].forEach(id=>add(id,'pj',1));
    const aWins = m.sets_a > m.sets_b;

    if(aWins){
      [m.a1,m.a2].forEach(id=>{ add(id,'pg'); addP(id,s.A); });
      [m.b1,m.b2].forEach(id=>{ add(id,'pp'); addP(id,s.B); });
    }else{
      [m.b1,m.b2].forEach(id=>{ add(id,'pg'); addP(id,s.B); });
      [m.a1,m.a2].forEach(id=>{ add(id,'pp'); addP(id,s.A); });
    }
  }

  const rows = Array.from(table.values()).sort((a,b)=> b.puntos-a.puntos || b.pg-a.pg || a.pp-b.pp);
  return json(req, rows);
}
