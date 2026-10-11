# Player bed and actual dawn/dusk waiting — E09 / H08

Implemented 2026-10-05. The earlier furniture `bed` is Nagi's bed; the new `player-bed` is a separate owned furniture purchase costing wood 10 and cloth 3. Its frame, mattress, posts and canopy are destructible SDF samples at the hearth's east side. Existing terrain providers and manifests are unchanged. Construction checks support, solids, actors and inventory before payment. Repair costs wood 6 and cloth 2, does not refund material, and requires a clear site.

Waiting requires solo authority, a loaded campaign, a living idle grounded player, no movement/traversal/fishing/building, a lit hearth, owned intact bed geometry, distance at most 2 m, ray-tested shelter for the player and bed, bed visibility and no nearby enemy/projectile/telegraph or dangerous body exposure. Even a disconnected saved companion blocks waiting. The app separately rejects any host/guest room, including an empty host room.

The old campaign lighting shortcut now opens the homestead page. Trial lighting still switches without touching world time. The user chooses the next 06:00 or 18:00. At the selected hour the action rejects an accidental extra whole day. Each chunk calls ordinary `CoreSimulation.tick` in steps of at most 0.1 s, with a maximum of 40 steps and a 6 ms caller budget before yielding. World time, crops, processing, NPC schedules, weather, enemies, elemental hazards, water, stamina and finite food/rest effects advance through the same rules. The app uses its existing timer loop during waiting and limits scene refresh to twice a second; this is responsiveness work, not a measured device-FPS claim.

Every step revalidates safety before and after advancing. Cancellation, another menu transaction, Close/Resume, hidden/portrait pages and pagehide stop waiting. Only completed ticks are retained; no target, queued time or offline catch-up is serialized. Successful completion grants the existing +40% stamina-regeneration effect for 180 + comfort × 30 seconds, capped at 420. Ordinary sheltered hearth rest preserves a longer earned duration rather than resetting it down to 180. Save validation accepts the bounded extended duration and verifies owned player-bed samples without restoring removed geometry.

## Validation

- `tests/unit/player-rest.test.ts`: paid distinct bed, construction overlap, repair cost/no duplicate payment, death/phase/movement/distance/shelter/base/threat/multiplayer gates, actual crop/job/buff/NPC progression, bounded chunks, midnight, interrupted save, no resume queue, malformed target and ownership; fully removed bed stays absent across reload with no failed-wait refund or rebuild.
- `tests/unit/player-rest-normal-play.test.ts`: fresh zero-resource game, actual mining and collection, lit hearth, walking to the forest chest for cloth, paid bed, physical approach, real ticking to dusk, finite comfort effect and reload. No resource, clock or progression grants.
- Player-rest rules: 9 passing tests. Separate no-grant route: 1 passing test. Existing homestead regression: 16 passing tests. Campaign rules regression: 31 passing tests. Typecheck/build passed. Browser discovery: four PC/Android cases.
- `tests/e2e/campaign-player-rest.spec.ts`: PC production keys and Android touch controls, gated campaign shortcut, 48 px controls, same earned-bed route, dusk completion, cancellation and saved reload. Definitions only at this handoff. Browser launch is blocked in this executor; no local desktop/Android browser pass is claimed. Parent release validation must run these against the exact integrated commit.
- iPhone Safari, physical controllers and real-device performance have not been verified here.

This is one fixed canopy bed, not free-positioned furniture or a character lying-down animation. Other furniture remains the existing bounded homestead implementation. It is not full original-game furniture breadth or overnight offline production.

## Stable live Cancel target (2026-10-06)

The Android acceptance trace exposed a live-view defect: each countdown snapshot
rebuilt the homestead controls before a touch tap could finish. The homestead
panel now reconciles rows by identity and updates only the countdown text for
an active rest. Unchanged controls remain attached even when other life rows
change. Unit regressions cover 100 live updates, action delivery, completion,
eligibility changes and row removal. The existing ordinary PC/Android bed route
also checks that the original cancel element stays connected through a real
countdown update before tapping it. No assertion timeout is relaxed.

Typecheck and production build passed locally. Exact-commit browser acceptance
remains pending; the local environment cannot launch the required Chromium
socket/WebGL path, so those previously established restrictions are not retried.
