# PR4 campaign co-op relay (protocol 4)

Protocol 4 separates finite soil, watermill escrow and dynamic western resident snapshots/frames from older peers (including protocol 3). Reload both clients after this update; saved single-player worlds remain backward compatible.

Independent from PR5. Route: `/campaign-room/<64 lowercase hex characters>`.

## Authority and storage

- Maximum two players: one browser host and one guest.
- **The browser host owns physics, combat, inventories, progression and the durable game save. This is not server-authoritative physics.** The relay validates transport, roles, epochs, rates, one-time command receipts, and default-denied guest world editing. The host must validate gameplay rules and guest distance/line of sight before accepting every request.
- Guests stop their own authoritative world simulation while connected, disconnected, or synchronizing. Rendering/interpolation is permitted. Host disconnect pauses the guest, with no host election or disconnected command queue.
- Host identity/guest identity and command sequences survive Durable Object restarts. The world does not: the host must republish its own saved/current world after reconnect. No guest may promote itself to host using the invite.
- Snapshot transfer is bounded to 16 MiB, 2048 chunks, 40 KiB packets. The FNV checksum detects accidental transfer corruption, not malicious changes. TLS, invite secrecy, and host identity provide the transport boundary.
- Host-issued snapshots must include all shared state plus the guest actor state that the adapter needs. `hostPublish` sends opaque text; `onSnapshot` must validate and atomically hydrate it. Serialize only bounded canonical state, not Three.js objects or the entire rebuilt arena if the resulting checkpoint exceeds the cap.
- Commands have monotonic per-guest sequences and unique IDs. Receipts are retained for 256 commands; old commands remain rejected by their sequence after eviction. Unacknowledged operations become “unknown outcome” on disconnect, never automatically replayed. The host should save/apply state, publish it, then acknowledge.

## Browser adapter API

`new CampaignCoopClient({room,resumeKey,mode:'create'|'join',endpoint}, callbacks)`.

Callbacks: `onSnapshot(text,sequence)`, `onCommand(command,id,'guest')`, `onPlayers`, `onRole`, `onStatus`; optional `onInput`, `onFrame`, `onAck`, `onChat`, `onPermission`, `onSnapshotRequested`.

Methods: `connect`, `disconnect`, `hostPublish`, `hostAck`, `guestRequest`, `sendInput`, `hostFrame`, `sendPose`, `setGuestBuildAllowed`, `sendChat`, `setMuted`, `resync`.

Use `randomRoomCode()` only in response to an explicit create-room action. Generate a separate `resumeKey` for each browser, and keep it private in session storage. Room invites use `inviteFragment(room)`; they must never contain resume keys. Merely opening a shared URL should show a join button, not automatically publish or join a world. Do not log or display resume keys. Room members can see shared game/chat data, but no user account identity is transmitted.

Movement uses ephemeral `sendInput({x,z,yaw,pitch,block,sprint})` at up to 30 Hz. Only the guest can send it; the host receives `onInput(input,'guest')` and must apply its own collision/combat rules. `freshGuestInput` neutralizes movement/block/sprint after 350 ms without input. Jump/dodge/heal are discrete commands. The host can issue `hostFrame(payload)` at 10 Hz for bounded actor/enemy render data (24 KiB, checked plain JSON); guests receive `onFrame`. Input and frames have independent monotonic sequences and do not generate durable receipts or per-frame storage writes. The game adapter must validate frame schemas; positions from guest presence are never authority.

`onSnapshot` is synchronous in the current contract. Asynchronous hydration must keep guest controls/ticking gated until the adapter finishes; do not treat callback invocation as completion.

The host must publish after `onSnapshotRequested`, including after reconnect. `sendPose` is presence/input only; its values are not authoritative guest movement until the host adapter validates them. Default guest building, mining, building removal and shared storage actions are rejected by the relay until the host grants them. Other permissions/gameplay eligibility remain host-adapter responsibilities. Chat callbacks pass plain strings; render with `textContent`, never HTML. No microphone access or voice chat is implemented.

## Optional Cloudflare adapter

`src/index.ts` exports `CampaignRoom` and a route handler using the `CAMPAIGN_ROOMS` Durable Object binding. `PUBLIC_ORIGIN` optionally permits the exact existing preview origin. Origin checks fail closed. No credentials, remote binding, or deployment have been configured. Local-only and opt-in Preview configuration files are prepared; see DEPLOYMENT-PROPOSAL.md. The Preview relay remains disabled by default. `/campaign-room/health` reports the configured status without allocating a room. Parent integration must use a separate PR4 binding/service and must not connect to PR5.

Only metadata is persisted, before acknowledging/forwarding consequential commands. Storage failures fail closed. The relay keeps at most one completed and one in-progress snapshot in memory. An idle instance can restart safely: its new epoch prevents old packets from being accepted and its stored identities prevent room ownership takeover.

## Scope remaining for release

The module's pure/mock-socket tests are not proof of actual multi-browser operation. Validate two real sockets and then two browser contexts with the integrated game, including join, reconnect, epoch replacement, host disconnect, guest editing rejection, shared rewards, and simultaneous interactions before marking M02–M04 complete. No public world directory, asset hosting, account system, voice, dedicated physics server, or public world-sharing permissions UI is supplied.

## Preview isolation assumption and verification

The proposed Preview config preserves Worker `threejs-game` and Preview `pr-4`, with an exported same-Worker `CampaignRoom` SQLite class, no `script_name`, and a matching `previews.durable_objects` binding. Current official [Preview isolation documentation](https://developers.cloudflare.com/workers/previews/resources/) says this creates a distinct namespace per Preview. Assets stay top-level under the [Preview configuration rules](https://developers.cloudflare.com/workers/previews/configuration/). No production service binding is used. This documented isolation must still be checked on the first deployed release; a generated URL alone is insufficient.

Local evidence includes 14 transport tests, with real two-socket transfer/input/frame/permission/disconnect/reconnect checks, plus separate HTTP health/origin tests. This does not yet establish two-browser integrated gameplay or a deployed Durable Object. Do not enable the public relay until those remaining adapter/deployment gates and the existing no-new-spend condition are satisfied.

Protocol2 includes independently validated per-player environmental exposure. Both peers must reload older open pages; incompatible transport versions are rejected before role assignment. Existing room identity/receipt checkpoints remain version1 and are retained across this codec upgrade. The deployment manifest and health response use the same protocol constant.
