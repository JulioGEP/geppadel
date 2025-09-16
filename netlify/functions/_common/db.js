// netlify/functions/_common/db.js
import { neon, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// WebSocket para entorno Node (Netlify Functions)
neonConfig.webSocketConstructor = ws;

const CONN = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
export const sql = neon(CONN);

function normalizeKey(value) {
  return (value || '')
    .trim()
    .replace(/^['"]+/, '')
    .replace(/['"]+$/, '');
}

function findCaseInsensitive(obj, ...names) {
  if (!obj || typeof obj !== 'object') return '';
  const lowerNames = names.map((n) => n.toLowerCase());
  for (const [key, value] of Object.entries(obj)) {
    if (lowerNames.includes(String(key || '').toLowerCase())) {
      if (Array.isArray(value)) return value[0] || '';
      return value;
    }
  }
  return '';
}

// Valida clave de edición
export function requireKey(event) {
  const raw = process.env.API_SHARED_KEY || '';
  const candidates = raw
    .split(/[,;\n\r]/)
    .map(normalizeKey)
    .filter(Boolean);

  if (!candidates.length) return; // sin clave configurada => libre (para pruebas)

  let provided = '';

  provided = normalizeKey(findCaseInsensitive(event?.headers, 'x-api-key'));

  if (!provided && event?.queryStringParameters) {
    provided = normalizeKey(
      findCaseInsensitive(event.queryStringParameters, 'key', 'api_key', 'apiKey')
    );
  }

  if (!provided && event?.multiValueQueryStringParameters) {
    provided = normalizeKey(
      findCaseInsensitive(event.multiValueQueryStringParameters, 'key', 'api_key', 'apiKey')
    );
  }

  if (!provided && typeof event?.body === 'string' && event.body.trim()) {
    try {
      const parsed = JSON.parse(event.body);
      provided = normalizeKey(findCaseInsensitive(parsed, 'key', 'api_key', 'apiKey'));
    } catch (err) {
      // cuerpo no JSON, ignorar
    }
  }

  if (!provided && typeof event?.rawQuery === 'string') {
    const rawParams = new URLSearchParams(event.rawQuery);
    provided = normalizeKey(rawParams.get('key') || rawParams.get('api_key') || rawParams.get('apiKey'));
  }

  if (!candidates.includes(provided)) {
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
