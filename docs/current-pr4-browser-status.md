# PR4 browser acceptance: 11c9e163

Observed 2026-10-05 23:46 UTC. [CI run 37387550716](https://github.com/usks213/threejs-game/actions/runs/37387550716), attempt 1, checked exact head `11c9e163f29e41860dfb1097ebf995d1620897f0` (tree `10c61064efd4712a4b63cdc23ab27acc26f71cb3`). The run completed with **failure** at 23:45:47 UTC.

**47 jobs: 29 passed, 17 failed, 1 intentionally skipped.** No jobs remain running or queued. These are job counts, not requirement counts or browser-test counts. They do not establish completion of the 171 requirements. Later local changes need their own exact-head CI; this report does not certify them.

Typecheck, all **1,190 tests across 141 files**, production build and preview deployment passed. Both streamed-world routes and the actual two-browser cooperative case passed. Both first-chapter routes and all four fresh bow/staff routes failed. A successful deployment is not full browser acceptance.

## Exact job results

PC means desktop Chromium; Android means Playwright's Android Chromium emulation, not a physical handset. “Selected group passed” is limited to that job's authored checks. Job links contain the logs and any uploaded screenshots/traces.

| Job | Result | Job/logs | Evidence or exact failure |
|---|---|---|---|
| verify | PASS | [112024518408](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112024518408) | Typecheck; 1,190/1,190 tests in 141 files (451.90s); build. |
| streamed-world-browser (Android) | PASS | [112027223601](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223601) | Selected group passed. |
| first-chapter-browser (PC) | FAIL | [112027223670](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223670) | HP reached 0 on crypt/artisan route; “Keyboard aiming must not continue after combat death” (`campaign-controls.ts:82`). |
| combat-build-browser (PC, staff) | FAIL | [112027223727](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223727) | Cast left mana at 40 instead of 20 for 60s (`ranged-campaign-controls.ts:73`). |
| first-chapter-browser (Android) | FAIL | [112027223743](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223743) | HP reached 0 on crypt/artisan route; “Player must survive the gathering route” (`campaign-progression.spec.ts:27`). |
| combat-build-browser (Android, bow) | FAIL | [112027223841](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223841) | Entrance-guard pitch error 0.05442504177055166, expected <0.035 (`campaign-controls.ts:57`). |
| deploy-preview | PASS | [112027223851](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223851) | Preview deployment job passed for this SHA. |
| combat-build-browser (PC, bow) | FAIL | [112027223863](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223863) | Gathering/hearth waypoint error 1.2306343017820682, expected <0.18 (`campaign-combat-builds.spec.ts:35`). |
| streamed-world-browser (PC) | PASS | [112027223867](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223867) | Selected group passed. |
| combat-build-browser (Android, staff) | FAIL | [112027223896](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223896) | Entrance-guard pitch error 0.05131305623808784, expected <0.035 (`campaign-controls.ts:57`). |
| browser (PC, desktop-motion) | PASS | [112027224666](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224666) | Selected group passed. |
| browser (PC, desktop-sdf) | FAIL | [112027224704](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224704) | Carve remeshed, but target stayed `door` instead of empty for 60s (`prototype.spec.ts:85`). |
| browser (Android, Android) | PASS | [112027224722](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224722) | Selected group passed. |
| browser (PC, desktop-campaign-ui) | FAIL | [112027224737](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224737) | Building-snap click on `#build` intercepted by canvas until 120s timeout (`campaign-building-snap.spec.ts:5`); 9 tests passed. |
| browser (PC, desktop-skill-gems) | PASS | [112027224740](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224740) | Selected group passed. |
| browser (Android, android-elements) | FAIL | [112027224757](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224757) | Enemy water cast left `wet=0`, expected >0 for 60s (`elements.spec.ts:54:552`); 3 other tests passed. |
| browser (PC, desktop-elements) | PASS | [112027224766](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224766) | Selected group passed. |
| browser (PC, desktop-player-rest) | FAIL | [112027224774](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224774) | Same undefined `playerRest.active` failure (`campaign-player-rest.spec.ts:26`); gated-menu test passed. |
| browser (PC, desktop-collectible-display) | PASS | [112027224786](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224786) | Selected group passed. |
| browser (PC, desktop-input) | PASS | [112027224799](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224799) | Selected group passed. |
| browser (PC, desktop-echo-vault) | PASS | [112027224803](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224803) | Selected group passed. |
| browser (PC, desktop-duel) | PASS | [112027224805](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224805) | Selected group passed. |
| browser (PC, desktop-inventory-stacks) | FAIL | [112027224820](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224820) | Both tests failed: initial inventory region absent; route waypoint error 0.6989678988218632, expected <0.18 (`campaign-inventory-stacks.spec.ts:9,17`). |
| browser (PC, desktop-campaign) | PASS | [112027224822](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224822) | 3/3: gather→hearth→save/continue, menus/exact continuation and protected new-world reset. |
| browser (PC, desktop-soil-life) | FAIL | [112027224834](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224834) | Rake-fill waypoint error 0.44942824005356213, expected <0.18 (`campaign-soil-fill.spec.ts:15`); 3 tests passed. |
| browser (PC, desktop-watermill) | FAIL | [112027224837](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224837) | Waypoint error 0.21238090531242798, expected <0.18 (`watermill.spec.ts:21`); menu test passed. |
| browser (PC, desktop-campaign-save) | PASS | [112027224894](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224894) | 3/3: validated file transfer, confirmed history cleanup and history restore. |
| browser (Android, android-echo-vault) | PASS | [112027224906](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224906) | Selected group passed. |
| browser (Android, android-campaign-migration) | PASS | [112027224940](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224940) | 2/2: confirmed western expansion and unjoined-invitation solo-save/privacy protection. |
| browser (PC, desktop-discovery-controls) | PASS | [112027224958](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224958) | Selected group passed. |
| browser (PC, desktop-campaign-migration) | PASS | [112027224962](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224962) | 2/2: confirmed western expansion and unjoined-invitation solo-save/privacy protection. |
| browser (PC, desktop-mist) | PASS | [112027224967](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224967) | Selected group passed. |
| browser (Android, android-campaign-ui) | PASS | [112027224975](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224975) | Selected group passed. |
| browser (Android, android-watermill) | FAIL | [112027224979](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224979) | HP reached 0 during touch look (`watermill.spec.ts:26`); menu test passed. |
| browser (Android, android-campaign) | PASS | [112027224981](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224981) | 3/3: gather→hearth→save/continue, menus/exact continuation and protected new-world reset. |
| browser (PC, desktop-equipment-tools) | PASS | [112027224984](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224984) | Selected group passed. |
| browser (Android, android-discovery-controls) | PASS | [112027224987](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224987) | Selected group passed. |
| browser (Android, android-mist) | PASS | [112027225028](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225028) | Selected group passed. |
| browser (Android, android-soil-life) | PASS | [112027225032](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225032) | Selected group passed. |
| browser (Android, android-inventory-stacks) | FAIL | [112027225037](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225037) | Both tests failed: initial inventory region absent; berry-meal craft button remained disabled for 60s (`campaign-inventory-stacks.spec.ts:9,18`). |
| browser (Android, android-collectible-display) | FAIL | [112027225067](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225067) | `#interact` absent for 60s (`campaign-collectible-display.spec.ts:19`); menu test passed. |
| browser (Android, android-skill-gems) | PASS | [112027225069](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225069) | Selected group passed. |
| browser (Android, android-equipment-tools) | PASS | [112027225103](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225103) | Selected group passed. |
| browser (Android, android-player-rest) | FAIL | [112027225130](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225130) | `playerRest` undefined when reading `.active` after dusk command (`campaign-player-rest.spec.ts:26`); gated-menu test passed. |
| browser (Android, android-campaign-save) | PASS | [112027225171](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225171) | 3/3: validated file transfer, confirmed history cleanup and history restore. |
| verify-production | SKIP | [112027225446](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027225446) | Intentionally skipped: production verification does not run for this PR event. |
| cooperative-browser | PASS | [112027333994](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027333994) | Two-browser join, personal/shared journal UI separation, chat, movement, permissions, solo-save isolation and reconnect. |

## Interpretation and remaining acceptance

- The four reported waypoint errors share the normal-input driver's strict <0.18 arrival assertion. The two Android ranged routes failed strict pitch checks; the staff desktop route did not observe the expected mana spend. These are failures, not waived tolerances or completed combat acceptance.
- Save/restore/file-transfer/history cleanup and confirmed expansion/invitation privacy passed on both browser profiles. That does not verify every save combination, every quota/device failure or the failed new inventory/rest routes.
- The cooperative case checks the deployed commit and protocol-5 relay health before two-browser play. It covers personal/shared journal presentation and solo-save isolation, not every private-journal persistence or multiplayer combat scenario; mute is not exercised by this case.
- Physical Android/iPhone/controller testing, listening to audio, full seven-region browser completion, sustained browser/GPU soak and matched visual comparison remain unverified here.
- The [implementation ledger](implementation-checklist.md) retains implementation limits separately from this run's evidence. Historical passes on older SHAs do not override failures on this SHA.

