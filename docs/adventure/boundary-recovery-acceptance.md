# Held-input and boss reward boundary recovery

2026-10-05. This supplements the milestone 13 evidence. It does not replace a phone run or a production-load test.

## Demonstrated failures and fixes

- Android-emulated browser on public source `19af8321238718bf646bc9e51094d7b1a963ee8e`: held charge reached 82% in the rendered HUD, then disappeared because of the six-second authority expiry. Charge now remains capped at 100% until release. Pointer cancellation, lost capture, blur, resize, visibility, menu opening, damage, equipment change, death, travel and leaving still cancel. Private held input is never restored from a save or reconnect.
- Synthetic resource-capacity fixture: a lethal final-boss hit previously threw while placing rewards and left the dead boss without a victory record. Victory now records independently of available drop capacity. Both reward kinds are planned together; neither is placed until the whole payout fits. A saved pending receipt on the dead boss retries once per simulation second after space is made, including after authority restart. The HUD explains protected pending loot. Existing ground items are never discarded to make room.

## Evidence

- `charged-attack.test.ts`, `charge-input.test.ts`, `adventure-sites.test.ts`: 18 tests passed.
- `adventure-boss-rewards.test.ts`: 5 tests passed: normal exact-once payout, one-free-slot atomic failure/restart/participant export/retry, site-boss full capacity recovery, allocator failure recovery, malformed save rejection.
- Typecheck and production build passed. CI684a276b: 823/824 passed; an existing 105-tick light/thaw/water test exceeded its default five-second runner budget. Its gameplay steps/assertions are unchanged; an explicit 15-second wall budget passes all11 site tests locally. Dedicated deployment and browser verification remain pending the corrected CI.
- The capacity tests deliberately construct full worlds and are boundary tests, not claims of a human-played route or practical 100,000-object performance.
