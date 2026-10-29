const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': origin,
    'vary': 'Origin',
  },
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || 'https://lamurlissa-ui.github.io';
    if (origin !== allowed) return json({ error: 'origin_not_allowed' }, 403, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': allowed, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', 'vary': 'Origin' } });
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/turn-credentials') return json({ error: 'not_found' }, 404, allowed);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'not_configured' }, 503, allowed);

    const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!upstream.ok) return json({ error: 'turn_upstream_failed' }, 502, allowed);
    const data = await upstream.json();
    return json({ iceServers: data.iceServers }, 200, allowed);
  },
};
