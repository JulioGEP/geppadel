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

export const getKey = (req) => {
  const url = new URL(req.url);
  return req.headers.get('x-api-key') || url.searchParams.get('key') || '';
};

export const requireAuth = (req) => {
  const expected = (process.env.API_SHARED_KEY || '').trim();
  if (!expected) return false;
  const provided = (getKey(req) || '').trim();
  return provided && provided === expected;
};
