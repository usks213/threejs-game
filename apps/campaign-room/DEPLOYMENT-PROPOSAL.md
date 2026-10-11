# PR4 relay deployment proposal — local preparation only

Prepared 2026-10-04. No remote deployment, namespace, credential, permission, or billing change was made.

## Existing path inspected

- Root `wrangler.jsonc` identifies Worker `threejs-game`, `dist` static assets, compatibility date 2026-10-02, and an empty `previews` block.
- `scripts/deploy-preview.mjs` already pins Wrangler 4.147.0 and runs `wrangler preview --name pr-${PR_NUMBER} --json`. It checks the built commit manifest and confirms the returned Preview serves that commit.
- CI passes the existing repository deployment secret only to that job. Its account guard, commit guard, output parsing, URL allowlist, and deployed-commit verification must stay intact.

## Proposed integration

1. Keep Worker name `threejs-game` and Preview name `pr-4`. Do not create a differently named Worker or change the existing play URL.
2. Only PR4 selects `apps/campaign-room/wrangler.preview.jsonc`. The eventual deployment script change is to append `--config apps/campaign-room/wrangler.preview.jsonc` when `PR_NUMBER === '4'`; other PRs retain their current root configuration. The script now selects this config only when PR_NUMBER is 4, PR4_CAMPAIGN_RELAY_ENABLED is true, and the verified artifact manifest declares campaignCoop true; its default path remains unchanged.
3. `src/preview-worker.ts` exports the `CampaignRoom` class, routes `/campaign-room/*` to the relay, and delegates ordinary requests to the same built static assets. Static asset routing keeps the game/deployment manifest at their existing paths.
4. Use the same-Worker `CAMPAIGN_ROOMS` class binding, without `script_name` or a service binding. A `new_sqlite_classes` migration provisions the Preview-scoped class. Never bind PR4 to PR5 or to a production room namespace.
5. The proposal ships with `previews.vars.CAMPAIGN_RELAY_ENABLED = "false"`. Enable it only after the existing account's allowed free-tier/no-new-spend status is verified and the integration tests pass. A disabled relay responds 503 without creating a room. The current account plan and token permissions have not been inspected here.
6. No new secret is needed. If existing credentials cannot perform the Preview class migration, stop with that concrete blocker. Do not create broader credentials, grant access, change plans, or substitute a paid service.

## Preview behavior checked against current official documentation

Worker Previews, available in Wrangler 4.135+, support Preview-scoped Durable Object namespaces. For classes in the same Worker, namespaces are isolated per Preview and survive updates to that Preview. Deleting the Preview deletes its state. The class/migration remain top-level; an `env` binding must also appear in `previews.durable_objects.bindings`. [Resources and isolation](https://developers.cloudflare.com/workers/previews/resources/)

Assets and compatibility settings remain top-level. Bindings and Preview variables are explicitly configured in `previews`; production bindings are not implicitly inherited. [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)

Do not replace the command with `wrangler versions upload` or old `preview_urls` behavior. The older Version URL mechanism lists Durable Object support limitations that do not describe current Worker Previews. Also avoid service bindings, which can route a Preview to a production deployment rather than a matching Preview. [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/), [Preview resource limitations](https://developers.cloudflare.com/workers/previews/resources/#limitations)

## Cost and resource boundary

SQLite Durable Objects are available on the Workers Free plan. Free-tier quota excess fails requests; this does not authorize a plan upgrade. Paid accounts can incur usage charges, so the fact that code fits free-tier features is not proof that an existing account cannot bill. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

The relay is deliberately small: two admitted identities, four temporary handshake connections, 40 KiB packets, 16 MiB snapshots, one completed plus one incoming snapshot, 256 command receipts, bounded payload depth/keys/strings, 240 incoming packets per connection per second, and 12-second connection leases. Only identity/receipt metadata is persisted, not voxel snapshots. Closed rooms stop scheduling lease alarms. These bounds reduce abuse and memory risk but are not an account-wide spending cap.

This first adapter uses standard accepted WebSockets, not Durable Object WebSocket hibernation. Connected rooms may remain active while idle. There is no unverified claim of zero runtime cost, global room cap, or hibernating production efficiency. Keep public relay disabled if the account/budget condition is unresolved.

## Local verification and remaining release gates

Already executed:
- 14 focused protocol/client/relay tests, including two actual localhost WebSocket clients on separate TCP connections.
- Actual socket test covers initial chunked state, ephemeral input/frame delivery, guest-edit denial, permission grant, command dedupe/ack, host disconnect pause, and host reconnect with a fresh snapshot.
- Main TypeScript check and separate `apps/campaign-room/tsconfig.json` check.

Not yet executed:
- Wrangler configuration dry-run or local workerd execution.
- Cloudflare Preview deployment or remote WebSocket handshake.
- Two real browser game contexts running the final host/guest adapter.

For local workerd testing after the pinned tool is available, use `wrangler dev --local --config apps/campaign-room/wrangler.local.jsonc`, after building `dist`. Never use the local-only configuration for deployment. A dry run must not be reported as a successful release.

Before enabling the public relay: validate both runtime contexts, guest actions against host simulation, world/quest persistence, no second local authoritative guest tick, lost-host pause, reconnect/epoch replacement, room origin checks, existing Preview URL and exact commit manifest. Preserve the deployed commit check and add a two-socket room smoke test after publication; HTTP 200 on the game alone is insufficient.
