export async function onRequest({ request, env }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare("SELECT value FROM inventory WHERE key='main'").first();
      return new Response(row?.value || '{}', { headers });
    } catch (e) { return new Response('{}', { headers }); }
  }
  if (request.method === 'POST') {
    try {
      const body = await request.text();
      JSON.parse(body);
      await env.DB.prepare("INSERT OR REPLACE INTO inventory(key,value)VALUES('main',?)").bind(body).run();
      return new Response('{"ok":true}', { headers });
    } catch (e) {
      return new Response(`{"error":"${e.message}"}`, { status: 400, headers });
    }
  }
  return new Response('{}', { headers });
}
