// netlify/functions/_common/db.js
import { neon, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket para entorno Node (Netlify Functions)
neonConfig.webSocketConstructor = ws;

const CONN = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
export const sql = neon(CONN);

// Valida clave de edición
export function requireKey(event) {
  const want = process.env.API_SHARED_KEY || '';
  if (!want) return; // sin clave configurada => libre (para pruebas)
  const got =
    event.headers?.['x-api-key'] ||
    event.headers?.['X-Api-Key'] ||
    event.queryStringParameters?.key ||
    event.queryStringParameters?.apiKey ||
    event.queryStringParameters?.api_key;
  if (got !== want) {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }
}

export function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
