# Resync deadline repair (2026-10-06)

## Failure evidence

[Run 37461465777](https://github.com/usks213/threejs-game/actions/runs/37461465777), exact `65bb5e0a3370b20da1306796851ab1fd0b651cb6`, passed the eight selected Android cases, including the compact carry-strip gesture. Its public co-op run failed during the earlier lost-delta recovery, before any held-part actions.

Both real sockets received full resync welcomes with the existing authority epoch. They then closed cleanly (1005, empty reason), respectively 55ms and 61.6ms after native welcome arrival. The transport impairment's minimum incoming delay was 75ms, so neither welcome reached the client before close cleanup discarded its two pending incoming packets. Later welcomes had a new authority epoch, beginning at ticks 0 and 21. Reinitializing for that new epoch was correct; the continuation assertion must not be relaxed.

The source applied its initial socket-open timestamp to every later resync. `resync()` set `online=false`; a following heartbeat interpreted a long-lived socket as an overdue initial handshake. An actual-client timer reproduction confirmed: socket age 18 seconds, last valid world only 50ms old, resync only 10ms old, then the heartbeat closed the connection.

The timing strongly supports simultaneous premature client closures causing the ordinary empty-room reconstruction path. Provider instance identity and heap behavior were not observed, and no Cloudflare dashboard or new access was used.

## Repair and verification

The welcome deadline now starts when an online client enters a new resync attempt. Repeated requests while already syncing cannot extend it indefinitely. The 12-second receive/world checks, 15-second sync deadline, identity validation, input sequence continuity, exact-ID pending-command replay and authority-epoch continuation checks remain.

Two new timer regressions failed on the previous code. With the repair, all 27 related client/recovery/transport tests pass. The regressions cover a healthy 39-second-old socket receiving a delayed same-epoch welcome across a heartbeat boundary, and a genuinely stalled resync still expiring despite repeated requests and fresh pongs.

Full final unit/build and exact-commit public browser checks are recorded in CI. This document does not count the failed public run as a pass or claim a same-SHA retry repaired it.
