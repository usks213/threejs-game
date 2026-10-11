# Worker idle-room lifecycle

2026-10-06. Local candidate validation only; deployment and public load acceptance are separate gates.

## Finding and scope

After the final WebSocket disconnected, the Worker stopped its clock and requested a checkpoint, but retained both `CoopRoom.room` and the fulfilled `CoopRoom.loading` promise. Both references kept the complete authority/world reachable until the provider evicted the Durable Object. Short-lived refusal or browser-test rooms could therefore leave multiple inactive worlds resident.

This establishes a retained-reference path, not its contribution to the public low tick rate. No Worker heap measurement, 128 MiB acceptance pass, garbage-collection timing or CPU/load causal attribution is claimed. The provider's isolate sharing and eventual collection remain outside this check. No forced GC, runtime security flags, new timer strategy, paid service or additional access is used.

## Lifecycle guarantees

- A WebSocket fetch acquires a pending-join lease before awaiting the room load, including an already fulfilled promise. Final-save completion cannot clear the current authority while a fetch is resuming. The returned room is also checked against the current generation and read-only state before attaching.
- Every requested checkpoint is counted until its own queue promise settles. `CheckpointQueue` resolves only the requests captured by one write, so a successful earlier batch cannot release a room with a later batch still pending.
- The final disconnect stops the clock immediately and requests the authoritative checkpoint after normal participant/lease release. Once all saves and joins settle, an empty room releases its room, load promise and timing references. A join during the save keeps the same active generation and restarts the existing clock path.
- Persistence failure marks the old authority read-only and stops simulation. Any old queued requests drain as failures rather than acknowledging skipped writes. Cold loading is allowed only after that generation's outstanding writes and joins settle; the durable outcome is read again without guessing whether a failed write committed.
- Close/error cleanup is idempotent. A send failure uses the same disconnect path even if no platform close event arrives. Captured old socket callbacks cannot clear or persist a replacement room.
- Native `scheduler.wait`, fixed dt, one-step Worker turns, bounded diagnostics, physics/water, protocol and the Node adapter are unchanged.

## Evidence

- Nine new Worker-adapter unit cases use the real `CheckpointQueue` with deferred storage completion: final commit and cold rejoin; a second queued batch; reconnect during save; fulfilled-load versus cleanup microtask ordering; concurrent initial fetches; write failure and drain; duplicate close/error; late failed-generation close; and send failure without a close event.
- Existing Worker timing, queue, room access/storage and real-socket authority tests pass alongside them (32 distinct tests including the new lifecycle cases). Three focused companion/skybound disconnect and lease-release cases also pass. Full TypeScript checks and production build pass. After integration, the full suite passed 944 tests across 201 files, alongside typecheck and build. Later browser-test and CSS refinements use focused validation rather than repeating the unchanged game suite.
- The local Miniflare/workerd receipt is `docs/benchmarks/worker-idle-room-local-2026-10-06.json`. A local-only read-only inspection endpoint confirms the same Durable Object instance remains alive while room/load references become null and pending joins/saves reach zero. The production Worker has no inspection endpoint.
- In that same instance, a cold rejoin gets a new authority epoch and retains the terrain edit, owner inventory, administrator identity, known player identity, lock, ban and administrative receipt. Unknown and banned identities remain rejected (4004/4003), unban permits the original participant, and replaying the old ban receipt does not ban again. Refused joins and the final two-client disconnect release references again.

This smoke is functional lifecycle/save evidence. It is not browser rendering, production throughput, mature-world peak-memory evidence or a proof that retained idle worlds caused the measured public slowdown.
