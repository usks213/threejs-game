# PR4 campaign co-op relay (protocol 1)

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

Callbacks: `onSnapshot(text,sequence)`, `onCommand(command,id,'guest')`, `onPlayers`, `onRole`, `onStatus`; optional `onAck`, `onChat`, `onPermission`, `onSnapshotRequested`.

Methods: `connect`, `disconnect`, `hostPublish`, `hostAck`, `guestRequest`, `sendPose`, `setGuestBuildAllowed`, `sendChat`, `setMuted`, `resync`.

Use `randomRoomCode()` only in response to an explicit create-room action. Generate a separate `resumeKey` for each browser, and keep it private in session storage. Room invites use `inviteFragment(room)`; they must never contain resume keys. Merely opening a shared URL should show a join button, not automatically publish or join a world. Do not log or display resume keys. Room members can see shared game/chat data, but no user account identity is transmitted.

The host must publish after `onSnapshotRequested`, including after reconnect. `sendPose` is presence/input only; its values are not authoritative guest movement until the host adapter validates them. Default guest building, mining, building removal and shared storage actions are rejected by the relay until the host grants them. Other permissions/gameplay eligibility remain host-adapter responsibilities. Chat callbacks pass plain strings; render with `textContent`, never HTML. No microphone access or voice chat is implemented.

## Optional Cloudflare adapter

`src/index.ts` exports `CampaignRoom` and a route handler using the `CAMPAIGN_ROOMS` Durable Object binding. `PUBLIC_ORIGIN` optionally permits the exact existing preview origin. Origin checks fail closed. No credentials, service binding, route, migrations, or deployment have been configured by this module. Parent integration must use a separate PR4 binding/service and must not connect to PR5.

Only metadata is persisted, before acknowledging/forwarding consequential commands. Storage failures fail closed. The relay keeps at most one completed and one in-progress snapshot in memory. An idle instance can restart safely: its new epoch prevents old packets from being accepted and its stored identities prevent room ownership takeover.

## Scope remaining for release

The module's pure/mock-socket tests are not proof of actual multi-browser operation. Validate two real sockets and then two browser contexts with the integrated game, including join, reconnect, epoch replacement, host disconnect, guest editing rejection, shared rewards, and simultaneous interactions before marking M02–M04 complete. No public world directory, asset hosting, account system, voice, dedicated physics server, or public world-sharing permissions UI is supplied.
