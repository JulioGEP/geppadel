// netlify/functions/_common/db.js
import { neon, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Necesario en Node (Netlify Functions)
neonConfig.webSocketConstructor = ws;

const conn =
  process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

export const sql = neon(conn);
