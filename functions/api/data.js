// D1 绑定名 DB：在 Cloudflare Pages → Settings → Bindings 中配置（不必依赖仓库根 wrangler.toml）。
export async function onRequest({ request, env }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 binding missing: set variable name DB in Pages' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare('SELECT value FROM inventory WHERE key = ?').bind('main').first();
      const raw = row?.value != null ? String(row.value) : '{}';
      return new Response(raw, { status: 200, headers: jsonHeaders });
    } catch {
      return new Response('{}', { status: 200, headers: jsonHeaders });
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.text();
      JSON.parse(body);
      await env.DB.prepare('INSERT OR REPLACE INTO inventory (key, value) VALUES (?, ?)').bind('main', body).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: jsonHeaders });
    }
  }

  return new Response(JSON.stringify({ error: 'method not allowed' }), {
    status: 405,
    headers: { ...cors, Allow: 'GET, POST, OPTIONS', 'Content-Type': 'application/json' },
  });
}
