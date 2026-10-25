# Authoritative multiplayer / PR7 isolation

## Run and play locally

```sh
npm ci
npm run build
npm run server:beyblade
# Open http://127.0.0.1:8787/beyblade/ in two separate tabs/devices.
```

The Node service serves the existing `dist` route unchanged and the new `/beyblade/` route. WebSocket endpoint: `/api/beyblade`. During Vite development use `ws://127.0.0.1:8787/api/beyblade`; the server accepts local Vite/preview origins. `HOST=0.0.0.0` is opt-in for LAN access; no public tunnel is created. Internet hosting requires TLS and an explicitly approved deployment destination. No secret is required for local anonymous play.

## Authority and lifecycle

* One cryptographically random bearer session per browser client. FIFO queue pairs two distinct sessions; no fake online opponent. The server validates the catalog build before entry and locks that build for the match.
* Both players submit a bounded launch (`power 0.2–1`, angle ±π, tilt 0–0.65 rad). No position, physics profile, winner or points can be submitted by a client.
* Two-second ready countdown; the server runs the shared model at 240 Hz and broadcasts authoritative snapshots at up to 30 Hz. Clients render snapshots, not independent scored simulations. Elapsed-time catch-up is bounded at 100 ms per server tick to avoid overload; an overloaded server slows rather than trusting client time or skipping physics contact steps.
* Default official Japanese two-player, one-bey format: first to at least 4 points. Spin 1, Over/Burst 2, Xtreme 3; simultaneous result draws. Both clients explicitly acknowledge the next round, then choose a new launch. The selected build does not change within a match. Other official tournament formats are not silently emulated by this endpoint.
* A transport interruption pauses the room. The same in-memory bearer token resumes the same player and state within 15 seconds. Countdown restarts after reconnection. After the grace period the connected opponent wins by disconnect forfeit, **not** invented finish points. Leaving explicitly also forfeits. Both disconnected means no winner.
* Cancel removes queue entries; finished rooms release after 60 seconds. Disconnected unassigned sessions expire after five minutes. Sessions require five-second client heartbeat; 30 seconds without accepted messages disconnects a transport. Clients retry four times with bounded backoff. Disposal stops timers, retries and sockets.
* Session count is capped at 128, message size at 4 KiB, and accepted inbound traffic at 20 messages/second/session. Strict monotonically increasing sequence numbers reject replay. Node transport bounds buffered outgoing data and rejects binary frames and foreign browser origins. Tokens are never logged. A deployment should still add edge abuse controls before broad promotion.

## Deployment boundary

**Current publication status (2026-10-25):** the inherited Git-linked preview serves CPU practice, customization and the catalog only. Its online tab probes the same-origin health endpoint and disables matchmaking unless the expected authoritative service responds; missing, denied or static responses explicitly direct players to CPU practice. The optional development endpoint is kept inside a collapsed section. Dedicated online publication is held by an explicit false CI job condition after run `40173718018` received HTTP 403 from the read-only account subscriptions endpoint, before deployment. Do not re-enable or retry that denied read without materially new evidence/authorization resolving the free-plan check. All strict deployment preflight checks remain in place; this hold does not stop tests or the existing static Git-linked preview.

`wrangler.jsonc` (production Worker `threejs-game`) is intentionally untouched. `wrangler.beyblade.jsonc` targets **only** `threejs-game-beyblade-pr7` with its own `BeybladeArena` SQLite Durable Object namespace. The object owns matchmaking and room state in one authority; clients cannot split a queue across worker instances. Assets and WebSocket endpoint share origin. No production route, namespace, environment variable or credential is reused or modified by this configuration.

Deploy only after the owner verifies the exact account is on the Workers Free plan and authorizes this isolated preview. SQLite-backed Durable Objects are available on Workers Free, but free quotas can stop service; **do not enable Paid, overages, new billing, or new credentials**. No deployment command is included in npm scripts. Source: [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), checked 2026-10-25.

This first preview keeps matches in memory, not permanent SQLite storage. Worker deployment/restart/eviction ends in-flight matches; it does not fabricate a recovered result. Reconnect recovers a transient connection, not a process restart. The single queue has a deliberately bounded small-preview capacity, not regional matchmaking or production-scale persistence. Active timers/connections consume the free DO duration allowance. Hosting must be reported separately from local tests, and a public endpoint must be tested with two real clients before claiming online availability.

## Checks

`tests/unit/beyblade/multiplayer.test.ts` starts an actual ephemeral TCP/WebSocket server and connects independent clients. It covers queue ownership, server-only simulation/scoring, replay and forged input rejection, cancel, reconnect, disconnect forfeit, origin validation, and session cleanup. The simulation clock can advance deterministically in tests; production uses wall time exclusively on the server. No paid infrastructure is used for testing.

### Verified locally / 2026-10-25

* Six multiplayer tests passed, including a full first-to-four match with two actual TCP/WebSocket clients and identical final authoritative snapshots.
* Wrangler 4.152.0 `deploy --dry-run --config wrangler.beyblade.jsonc` compiled successfully; it did not upload or deploy anything.
* `wrangler dev --local` could not start in this sandbox: `uv_interface_addresses returned Unknown system error 1`. This is **not** a passed workerd runtime test. No restriction bypass or account/resource change was attempted.
* A local or approved preview runtime can be checked with `BEYBLADE_SMOKE_URL=http://127.0.0.1:8790 npm run smoke:beyblade`. This creates two anonymous transient match sessions, plays through an actual server-scored match, compares both clients' final snapshots, and leaves cleanly. Never point this script at production or an unauthorized destination. The preview publish workflow should run it against the exact deployed commit before reporting online availability.

`npm run test:worker` is the CI-runner adapter gate. It builds the assets, starts local workerd on an isolated port with a temporary SQLite-DO directory, executes the two-client full-match/reconnect/forfeit smoke, stops and restarts workerd, and verifies former in-flight sessions become fresh idle sessions (the documented in-memory restart policy). The temporary bearer-token checkpoint is mode 0600, never printed, and removed with its temporary directory. It requires a runner capable of local network-interface enumeration; it was prepared for CI rather than retrying the blocked sandbox launch.
