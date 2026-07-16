# Cloudflare Realtime TURN for Butterfly Field

A tiny Worker that mints **short-lived** Cloudflare TURN credentials so cross-device
multiplayer works behind symmetric NATs. The TURN API token stays server-side in the
Worker; the browser only ever receives temporary `iceServers`.

```
browser ──GET──▶ this Worker ──(API token, server-side)──▶ Cloudflare TURN
        ◀─── { iceServers:[…] } (short-lived) ───
```

## One-time setup

### 1. Create a Cloudflare TURN key

Cloudflare dashboard → **Realtime** → **TURN** → **Create TURN key**. Copy the
**Turn Token ID** and the **API Token** it shows you. (Data is tiny position sync,
so relayed bandwidth is ~pennies; Cloudflare TURN is ~$0.05/GB with a free allotment.)

### 2. Deploy the Worker

```sh
cd cloudflare/turn-worker
npx wrangler login                       # first time only
npx wrangler secret put TURN_KEY_ID        # paste the Turn Token ID
npx wrangler secret put TURN_KEY_API_TOKEN # paste the API Token
# (optional) edit wrangler.toml -> set ALLOW_ORIGIN to your site's origin
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g. `https://tct-turn.<you>.workers.dev`.

Sanity check it returns ICE servers:

```sh
curl https://tct-turn.<you>.workers.dev
# -> {"iceServers":[{"urls":["stun:…","turn:…","turns:…"],"username":"…","credential":"…"}]}
```

### 3. Point the site at it

In the site's `.env`:

```
PUBLIC_TURN_CREDENTIALS_URL=https://tct-turn.<you>.workers.dev
```

Then rebuild/redeploy the site (`PUBLIC_*` vars are baked in at build time). Done —
open Butterfly Field on two devices, open **Multiplayer**, share a room code.

## Notes

- If the Worker is unset or unreachable, the app silently falls back to STUN-only
  (same-device + same-network still work) — multiplayer never hard-fails on TURN.
- Lock `ALLOW_ORIGIN` to your site origin so only your page can pull credentials.
- Credentials live `TURN_TTL` seconds (default 24h) and are refetched on each join.
