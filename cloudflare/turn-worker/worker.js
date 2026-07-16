/**
 * Cloudflare Worker: mints SHORT-LIVED Cloudflare Realtime TURN credentials for
 * the Butterfly Field walkabout. The TURN key API token stays here (server-side)
 * and is never shipped to the browser.
 *
 * The SPA GETs this Worker; it returns { iceServers: [...] } that the client
 * feeds straight into PeerJS (see src/lib/walk/net.ts -> resolveIceServers()).
 *
 * Secrets (set with `wrangler secret put ...`):
 *   TURN_KEY_ID          your Cloudflare TURN key id
 *   TURN_KEY_API_TOKEN   your Cloudflare TURN key API token
 * Vars (wrangler.toml):
 *   ALLOW_ORIGIN         site origin allowed to fetch (default "*")
 *   TURN_TTL             credential lifetime in seconds (default 86400 = 24h)
 */
export default {
	async fetch(request, env) {
		const cors = {
			'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'content-type',
			'Access-Control-Max-Age': '86400'
		};
		if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
		if (request.method !== 'GET') {
			return json({ error: 'method_not_allowed' }, 405, cors);
		}
		if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
			return json({ error: 'worker_not_configured' }, 500, cors);
		}

		const ttl = Number(env.TURN_TTL) || 86400;
		const upstream = `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`;

		let resp;
		try {
			resp = await fetch(upstream, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ ttl })
			});
		} catch (e) {
			return json({ error: 'turn_unreachable', detail: String(e) }, 502, cors);
		}
		if (!resp.ok) {
			return json({ error: 'turn_generate_failed', status: resp.status }, 502, cors);
		}

		const data = await resp.json();
		// Cloudflare returns a single iceServers object; PeerJS wants an array.
		const one = data.iceServers;
		const iceServers = Array.isArray(one) ? one : one ? [one] : [];
		return json({ iceServers }, 200, {
			...cors,
			// let the browser cache within the credential lifetime
			'Cache-Control': `public, max-age=${Math.max(60, ttl - 300)}`
		});
	}
};

function json(body, status, headers) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}
