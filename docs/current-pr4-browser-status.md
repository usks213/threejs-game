# PR4 browser acceptance: ed52ca6

[CI run 37401433433](https://github.com/usks213/threejs-game/actions/runs/37401433433) completed with failure at 2026-10-06T02:26:21Z on exact head `ed52ca63987df33d39b2ea863bca3e422f073693`.

**50 jobs: 25 succeeded, 23 failed, 1 cancelled, 1 intentionally skipped.** Job counts do not complete requirement rows. All 1,250 unit tests /149 files, typecheck, build and exact-commit preview deployment passed. Actual two-browser cooperation passed. Full browser acceptance did not pass.

The next local correction adds safe pointer-lock failure recovery, paced native motion, real multitouch flask/tool activation, guarded combat recovery and a separate WebKit engine suite. It has no exact-commit browser result yet.

## Later verification-only attempt

[e9e43f3 / CI 37405003488](https://github.com/usks213/threejs-game/actions/runs/37405003488) finished on 2026-10-06 at 02:50:38 UTC with 1,265 unit tests passed and one failure. The workflow-routing test still required a literal 20-minute job limit, while the workflow gave only the bed-rest jobs 25 minutes to cover setup around the unchanged 20-minute test. The assertion is corrected to enforce that narrow distinction. Build, deployment and browser jobs were skipped; no new preview or browser acceptance resulted.

## Recorded results

| Job | Result | Verified log | Artifact IDs / first reported error |
|---|---|---|---|
| verify | success | [112069269202](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112069269202) | 11385269217 |
| native-pointer-browser | failure | [112072264245](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264245) | 11385702368 · Error: expect(received).toBe(expected) // Object.is equality |
| deploy-preview | success | [112072264246](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264246) | 11385647171 |
| first-chapter-browser (android-chromium) | failure | [112072264272](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264272) | 11385668141 · Error: Combat must preserve a living player |
| combat-build-browser (desktop-chromium, staff) | failure | [112072264295](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264295) | 11386135934 · Error: A new trusted locked relative move must reach the game |
| regional-campaign-browser | failure | [112072264308](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264308) | 11385612629 · Error: A new trusted locked relative move must reach the game |
| regional-campaign-android-browser | failure | [112072264315](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264315) | 11385833074 · Error: Guard input must not continue after death |
| streamed-world-browser (android-chromium) | success | [112072264320](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264320) | 11386191130 |
| combat-build-browser (android-chromium, bow) | failure | [112072264338](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264338) | 11386500866 · Error: Guard input must not continue after death |
| first-chapter-browser (desktop-chromium) | failure | [112072264352](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264352) | 11385632516 · Error: A new trusted locked relative move must reach the game |
| combat-build-browser (android-chromium, staff) | failure | [112072264387](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264387) | 11386600505 · Error: expect(received).toBe(expected) // Object.is equality |
| combat-build-browser (desktop-chromium, bow) | failure | [112072264475](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264475) | 11385607487 · Error: A new trusted locked relative move must reach the game |
| streamed-world-browser (desktop-chromium) | failure | [112072264504](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264504) | 11386525174 · Error: A new trusted locked relative move must reach the game |
| browser (desktop-chromium, desktop-motion) | failure | [112072264767](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264767) | 11385522408 · Error: expect(received).toEqual(expected) // deep equality |
| browser (android-chromium, android-chromium) | success | [112072264768](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264768) | 11386285494 |
| browser (desktop-chromium, desktop-input) | failure | [112072264823](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264823) | 11385369585 · Error: expect(received).toEqual(expected) // deep equality |
| browser (desktop-chromium, desktop-sdf) | failure | [112072264830](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264830) | 11385304384 · Error: expect(received).toEqual(expected) // deep equality |
| browser (desktop-chromium, desktop-duel) | failure | [112072264848](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264848) | 11386345265 · Error: expect(received).toEqual(expected) // deep equality |
| browser (android-chromium, android-elements) | success | [112072264860](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264860) | 11386306239 |
| browser (desktop-chromium, desktop-soil-life) | failure | [112072264884](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264884) | 11385823013 · Error: A new trusted locked relative move must reach the game |
| browser (desktop-chromium, desktop-player-rest) | failure | [112072264885](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264885) | 11386001141 · Error: A new trusted locked relative move must reach the game |
| browser (desktop-chromium, desktop-watermill) | failure | [112072264887](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264887) | 11386081532 · Error: A new trusted locked relative move must reach the game |
| browser (desktop-chromium, desktop-campaign-ui) | success | [112072264901](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264901) | 11385428375 |
| browser (desktop-chromium, desktop-elements) | success | [112072264903](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264903) | 11386301202 |
| browser (android-chromium, android-collectible-display) | success | [112072264907](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264907) | 11385752541 |
| browser (desktop-chromium, desktop-campaign-save) | success | [112072264958](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264958) | 11385916335 |
| browser (desktop-chromium, desktop-mist) | success | [112072264962](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264962) | 11386380388 |
| browser (android-chromium, android-campaign-migration) | success | [112072264968](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264968) | 11385389545 |
| browser (desktop-chromium, desktop-skill-gems) | success | [112072264970](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264970) | 11385777345 |
| browser (android-chromium, android-player-rest) | cancelled | [112072264973](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264973) | 11385604525 |
| browser (android-chromium, android-soil-life) | success | [112072264976](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264976) | 11386406388 |
| browser (desktop-chromium, desktop-collectible-display) | failure | [112072264983](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264983) | 11386041626 · Error: A new trusted locked relative move must reach the game |
| browser (android-chromium, android-campaign) | success | [112072264986](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264986) | 11386360738 |
| browser (desktop-chromium, desktop-inventory-stacks) | failure | [112072264989](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264989) | 11385488393 · Error: A new trusted locked relative move must reach the game |
| browser (android-chromium, android-campaign-ui) | success | [112072264994](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072264994) | 11386271461 |
| browser (desktop-chromium, desktop-campaign-migration) | success | [112072265000](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265000) | 11386500284 |
| browser (android-chromium, android-inventory-stacks) | success | [112072265005](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265005) | 11385902226 |
| browser (android-chromium, android-discovery-controls) | success | [112072265018](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265018) | 11386320888 |
| browser (desktop-chromium, desktop-campaign) | failure | [112072265028](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265028) | 11386341618 · Error: A new trusted locked relative move must reach the game |
| browser (desktop-chromium, desktop-equipment-tools) | failure | [112072265039](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265039) | 11386106978 · Error: A new trusted locked relative move must reach the game |
| browser (android-chromium, android-campaign-save) | success | [112072265042](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265042) | 11385722966 |
| browser (android-chromium, android-echo-vault) | success | [112072265049](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265049) | 11386490506 |
| browser (android-chromium, android-equipment-tools) | success | [112072265064](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265064) | 11385787737 |
| browser (android-chromium, android-mist) | success | [112072265069](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265069) | 11385803001 |
| browser (android-chromium, android-skill-gems) | success | [112072265106](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265106) | 11385936960 |
| browser (desktop-chromium, desktop-discovery-controls) | success | [112072265109](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265109) | 11386386168 |
| browser (android-chromium, android-watermill) | failure | [112072265140](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265140) | 11386307879 · Error: Guard input must not continue after death |
| browser (desktop-chromium, desktop-echo-vault) | failure | [112072265162](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265162) | 11386052059 · Error: A new trusted locked relative move must reach the game |
| verify-production | skipped | [112072265752](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072265752) |  |
| cooperative-browser | success | [112072387647](https://github.com/usks213/threejs-game/actions/runs/37401433433/job/112072387647) | 11386600239 |

## Diagnosed scope and next validation

- Desktop duel, motion and SDF cases completed their gameplay assertions but failed their final console-error checks on the real missing /favicon.ico. The next build contains an explicit original SVG icon; errors are not suppressed.
- Native Pointer Lock passed locked yaw/pitch, attack, held shield, movement, menu input release, and real motion over the unlocked menu. The early resume click left the game running without reacquiring lock. Rejection now returns safely to the menu with retry guidance; actual relock remains required.
- Large campaign native mouse requests produced zero/cross-axis motion while lock remained active. The next helper conserves requested motion into small frame-paced genuine OS steps; strict angle/distance/time bounds remain.
- Android independent touch preflight passed. Its full regional route ran and failed in warden combat. First-chapter and ranged traces exposed either stamina exhausted after a successful block/counter or an unguarded delay after attack recovery. The next driver checks the post-block budget and holds real guard input through recovery, leaving production attack commitment unchanged.
- Android staff flask input did not consume the flask or heal. The enabled footer button relied on compatibility click while another shield contact was held. Flask/tool controls now use the shared pointer-action binding with duplicate/disabled/paused protection; browser proof is pending.
- Android bed-rest job was cancelled around20minutes, before a full test result. Its test keeps its20-minute limit; only setup/artifact job margin is added. This flow remains unverified.
- Separate Linux mobile-WebKit rendering, trusted touch/menu, rotation and save-roundtrip cases are implemented and discovered locally; no engine pass is claimed. Physical iPhone/Android, controller hardware, audible listening, fixed-scene comparisons and full-route performance remain unverified.

## Local validation limits

New affected input/combat checks, typecheck and build passed. The WebKit-only worker passed its full1,250-test aggregate. A concurrent native-helper aggregate passed1,255/1,257 tests; unchanged soak/regional fixtures exceeded their existing120/150-second wall budgets. Both exact failed cases then passed one isolated retry with a single worker in240.28seconds; no limits were relaxed. The original aggregate failure remains recorded. Exact-head CI remains the publication verification gate. The [171-item ledger](implementation-checklist.md) preserves all original rows.
