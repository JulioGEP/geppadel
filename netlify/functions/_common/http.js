export const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,x-api-key',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS'
    }
  });

export const preflight = (req) =>
  req.method === 'OPTIONS'
    ? new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type,x-api-key',
          'access-control-allow-methods': 'GET,POST,PUT,OPTIONS'
        }
      })
    : null;

const normalizeKey = (value = '') =>
  String(value)
    .trim()
    .replace(/^['"]+/, '')
    .replace(/['"]+$/, '');

const parseKeys = (raw = '') =>
  String(raw)
    .split(/[,;\n\r]/)
    .map(normalizeKey)
    .filter(Boolean);

export const getKey = (req) => {
  const url = new URL(req.url);
  return normalizeKey(req.headers.get('x-api-key') || url.searchParams.get('key') || '');
};

export const requireAuth = (req) => {
  const expectedKeys = parseKeys(process.env.API_SHARED_KEY || '');
  if (expectedKeys.length === 0) return true;
  const provided = getKey(req);
  return provided ? expectedKeys.includes(provided) : false;
};
