# Overloaded-authority ingress clock recovery

2026-10-05. This is a local regression and long-run investigation, not a published fix or a phone/Workers performance certification.

## Preserved failure

The new four-real-WebSocket soak on game source equivalent to `c834acbb` failed after827,630.805ms (13m47.631s), before its required900,000ms. Source snapshot hash was `08349187c37ded0046da4d5d3ba33ed53926c5bb5defbcdfe7a076a314f7d32c`.

Before failure,210 exact full-snapshot comparisons,210 water comparisons,28 saves,7 command replays and the planned disconnect/server restart/missing-delta resync passed. One client was then closed with code1008 and the server's exact reason `Rate limit`. The run is FAILED and remains preserved separately; these partial successes do not make it a15-minute pass.

## Cause and bounded fix

The per-connection90-packet window used simulation elapsed seconds. When the world stepped slower than wall time, ordinary real-time movement and receive receipts accumulated inside an artificially long window and could disconnect a legitimate player.

`AuthorityRoom` now uses a monotonic real-time ingress clock, with an explicit internal clock injection for deterministic rate/receipt tests. The90-packet limit,8KiB packet limit, authentication, gameplay time, action cooldowns, deduplication and persistence are unchanged. No client can supply this clock. Tests that deliberately accelerate a mocked receipt-only simulation now supply their matching virtual transport clock explicitly.

## Evidence

- Before the fix, two of three dedicated ingress-clock tests failed, reproducing rate rejection while the game clock was stalled.
- After the fix, all12 focused clock/sequence/handshake/delivery tests passed.
- A real WebSocket using the normal local authority stays connected while sending25 input messages and5 heartbeats per wall second for4 seconds with authority stepping paused. A true91st packet in one transport second is still rejected.
- Typecheck, production build and all835 local tests in178 files passed.
- Corrected immutable-source4-WebSocket soak PASSED for902,219.711ms:214 complete state comparisons,214 water comparisons,31 saves,7 receipt replays, planned disconnect/restart/gap recovery, zero failures/notices. Snapshot source hash: `148c10149245a2d77e3bab64cb9db56a59b2216a4c104369235d68b6072eea0f`; runtime src/package hash: `486a72a852ffb5a5bdba28da374f8d6d57068d407dd06eacb45d80628658b943`.
- The server averaged16.9 simulation ticks/sec with instrumentation; raw simulation p95 was40.1ms/49.5ms across its two generations. Action ACK p95 was755.1ms; received JSON payload was1,028,756,960bytes. Periodic RSS peak534,556,672bytes; including shutdown541,503,488bytes. Heap peak333,520,560bytes. This establishes functional endurance, not30Hz quality, Workers128MiB fit, or phone performance.
- CI/publication remain unavailable due the verified runner-start gate. The existing dedicated preview is still `d5a2250f`, which does not contain this fix.

Private local evidence is kept under `/workspace/shared/pr5-milestone19-four-player-soak`; generated saves and resume capabilities are not public artifacts. Reproduction uses `SOAK_PLAYERS=4 node --import tsx scripts/soak-coop.ts UNUSED_OUTPUT`, and the two new ingress test files.

Corrected receipt: `/workspace/shared/pr5-milestone20-four-player-soak/summary.json`, SHA-256 `b2b9e5e9bf98935de26b3874ba135323e98b01aea052bf8ffa30e2661288d9cd`. The failed earlier receipt is retained; the two results are never combined into a single pass.
