const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function withCors(headers = {}) {
  return { ...CORS, ...headers };
}

/**
 * Cloudflare Pages Function: GET/POST /api/data
 * D1 table inventory(key TEXT PRIMARY KEY, value TEXT)
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withCors() });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 binding missing' }), {
      status: 500,
      headers: withCors({ 'Content-Type': 'application/json' }),
    });
  }

  if (method === 'GET') {
    const row = await env.DB.prepare('SELECT value FROM inventory WHERE key = ?')
      .bind('main')
      .first();
    const raw = row && row.value != null ? String(row.value) : '{}';
    return new Response(raw, {
      status: 200,
      headers: withCors({ 'Content-Type': 'application/json' }),
    });
  }

  if (method === 'POST') {
    const text = await request.text();
    try {
      JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400,
        headers: withCors({ 'Content-Type': 'application/json' }),
      });
    }
    await env.DB.prepare(
      'INSERT OR REPLACE INTO inventory (key, value) VALUES (?, ?)'
    )
      .bind('main', text)
      .run();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: withCors({ 'Content-Type': 'application/json' }),
    });
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: withCors({ Allow: 'GET, POST, OPTIONS' }),
  });
}
