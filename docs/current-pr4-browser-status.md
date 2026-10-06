# PR4 browser acceptance: 2b9702b2

[CI run 37392317338](https://github.com/usks213/threejs-game/actions/runs/37392317338) completed with failure at 2026-10-06 00:47:56 UTC on exact head `2b9702b2ca972fae16fab8bea58aac8053e5a3b4`.

**48 jobs: 17 succeeded, 26 failed, 4 cancelled, 1 intentionally skipped.** These are job counts, not completed requirement counts. All 1,192 unit tests /142 files, typecheck, build and exact-commit preview deployment passed. Actual two-browser cooperation passed. Full browser acceptance did not pass, and the seven-region case stopped during initial harvesting.

## Recorded results

| Job | Result | Verified log | Artifact IDs / first reported error |
|---|---|---|---|
| verify | success | [112040038669](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112040038669) |  |
| first-chapter-browser (desktop-chromium) | failure | [112043467667](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467667) | 11382346738 · Error: Timeout 1ms exceeded while waiting on the predicate |
| streamed-world-browser (android-chromium) | failure | [112043467678](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467678) | 11382495281 · Error: expect(received).toBe(expected) // Object.is equality |
| regional-campaign-browser | failure | [112043467717](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467717) | 11382466057 · Error: expect(received).toBeGreaterThan(expected) |
| combat-build-browser (android-chromium, staff) | failure | [112043467753](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467753) | 11382212510 · Error: expect(received).toBe(expected) // Object.is equality |
| streamed-world-browser (desktop-chromium) | failure | [112043467756](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467756) | 11383120708 · Error: Actual keyboard look must reach requested yaw |
| first-chapter-browser (android-chromium) | failure | [112043467760](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467760) | 11382685099 · Error: expect(received).toBe(expected) // Object.is equality |
| combat-build-browser (desktop-chromium, bow) | failure | [112043467764](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467764) | 11382302346 · Error: expect(received).toBeGreaterThan(expected) |
| deploy-preview | success | [112043467781](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467781) |  |
| combat-build-browser (desktop-chromium, staff) | failure | [112043467790](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467790) | 11381534103 · Error: Actual keyboard look must reach requested yaw |
| combat-build-browser (android-chromium, bow) | failure | [112043467797](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043467797) | 11382018538 · Error: expect(received).toBe(expected) // Object.is equality |
| browser (desktop-chromium, desktop-motion) | success | [112043468250](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468250) |  |
| browser (android-chromium, android-elements) | failure | [112043468269](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468269) | 11381769061 · Error: expect(received).toBeGreaterThanOrEqual(expected) |
| browser (desktop-chromium, desktop-campaign) | success | [112043468276](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468276) |  |
| browser (android-chromium, android-chromium) | failure | [112043468281](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468281) | 11382137933 · Error: expect(locator).toBeVisible() failed |
| browser (desktop-chromium, desktop-echo-vault) | success | [112043468292](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468292) |  |
| browser (desktop-chromium, desktop-sdf) | failure | [112043468297](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468297) | 11381693976 · Error: expect(received).toBeGreaterThan(expected) |
| browser (desktop-chromium, desktop-input) | success | [112043468300](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468300) |  |
| browser (desktop-chromium, desktop-soil-life) | cancelled | [112043468318](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468318) | 11382946854 · ##[error]The operation was canceled. |
| browser (desktop-chromium, desktop-elements) | success | [112043468325](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468325) |  |
| browser (desktop-chromium, desktop-watermill) | failure | [112043468327](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468327) | 11382986085 · Error: expect(received).toBeGreaterThan(expected) |
| browser (desktop-chromium, desktop-campaign-ui) | success | [112043468328](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468328) |  |
| browser (desktop-chromium, desktop-duel) | success | [112043468339](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468339) |  |
| browser (desktop-chromium, desktop-mist) | success | [112043468366](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468366) |  |
| browser (desktop-chromium, desktop-collectible-display) | success | [112043468389](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468389) |  |
| browser (desktop-chromium, desktop-inventory-stacks) | failure | [112043468425](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468425) | 11382406545 · Error: expect(received).toEqual(expected) // deep equality |
| browser (android-chromium, android-soil-life) | failure | [112043468429](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468429) | 11381814837 · Error: expect(received).toBe(expected) // Object.is equality |
| browser (desktop-chromium, desktop-player-rest) | cancelled | [112043468433](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468433) | 11382498160 · ##[error]The operation was canceled. |
| browser (android-chromium, android-collectible-display) | failure | [112043468436](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468436) | 11382243273 · Error: locator.tap: Test timeout of 120000ms exceeded. |
| browser (desktop-chromium, desktop-discovery-controls) | success | [112043468437](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468437) |  |
| browser (desktop-chromium, desktop-skill-gems) | success | [112043468438](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468438) |  |
| browser (android-chromium, android-inventory-stacks) | failure | [112043468444](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468444) | 11382351771 · Error: locator.tap: Test timeout of 180000ms exceeded. |
| browser (desktop-chromium, desktop-equipment-tools) | success | [112043468445](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468445) |  |
| browser (android-chromium, android-skill-gems) | failure | [112043468449](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468449) | 11382516655 · Error: locator.tap: Test timeout of 120000ms exceeded. |
| browser (desktop-chromium, desktop-campaign-save) | success | [112043468456](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468456) |  |
| browser (android-chromium, android-equipment-tools) | failure | [112043468457](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468457) | 11382300947 · Error: locator.tap: Test timeout of 120000ms exceeded. |
| browser (android-chromium, android-campaign) | failure | [112043468467](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468467) | 11381884773 · Error: expect(received).toBe(expected) // Object.is equality |
| browser (android-chromium, android-campaign-save) | cancelled | [112043468476](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468476) | 11382318348 · ##[error]The operation was canceled. |
| browser (android-chromium, android-discovery-controls) | failure | [112043468479](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468479) | 11382801405 · Error: locator.tap: Test timeout of 180000ms exceeded. |
| browser (android-chromium, android-watermill) | failure | [112043468481](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468481) | 11382184548 · Error: locator.tap: Test timeout of 120000ms exceeded. |
| browser (android-chromium, android-campaign-migration) | failure | [112043468485](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468485) | 11383091754 · Error: locator.tap: Test timeout of 300000ms exceeded. |
| browser (android-chromium, android-campaign-ui) | cancelled | [112043468493](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468493) | 11382388161 · ##[error]The operation was canceled. |
| browser (android-chromium, android-player-rest) | failure | [112043468495](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468495) | 11382765445 · Error: expect(locator).toBeVisible() failed |
| browser (android-chromium, android-echo-vault) | failure | [112043468498](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468498) | 11381639287 · Error: expect(received).toBe(expected) // Object.is equality |
| browser (desktop-chromium, desktop-campaign-migration) | success | [112043468542](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468542) |  |
| browser (android-chromium, android-mist) | failure | [112043468558](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468558) | 11382104112 · Error: expect(received).toBe(expected) // Object.is equality |
| verify-production | skipped | [112043468633](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043468633) |  |
| cooperative-browser | success | [112043565860](https://github.com/usks213/threejs-game/actions/runs/37392317338/job/112043565860) |  |

## Diagnosed scope and next validation

- The synthetic-pointer override in this run bypassed Linux gesture recognition: direct pointer actions worked, while click-based Android menus/startup did not. The follow-up restores the normal TouchEmulator path with correct per-finger releases. See [protocol evidence](android-cdp-input.md).
- Desktop key acknowledgements extended held movement/look; one strafe carried the player off the ledge, so its later reflection assertion ran after death. The follow-up sends releases independently of acknowledgements and retains strict position/angle gates. See [trace corrections](browser-input-route-corrections.md).
- The inventory comparison ran before world loading/restoration finished. No restored inventory had yet been observed; the saved record contained the drop. The follow-up waits for actual restoration before comparing.
- Western resident targeting failed despite a running world. The captured position/angle resolves to the correct actor in a standalone Core check. The new input path and extra live-target evidence still need a browser rerun; this case is not waived.
- The player-bed case captured both the earned bed and completed dusk, then its job was cancelled before the full case finished. This is partial evidence only.
- Native XTEST mouse acceptance and the independent Android seven-region route are new definitions in the follow-up, not passes. Physical devices, audible listening, fixed-scene visual comparisons and full-route performance remain unverified.

The follow-up passed targeted input and requirement regressions. Its subsequent local aggregate lost its execution transport and has no terminal result; that run is not reported as passed. Exact-head GitHub verification must pass before preview deployment. The [171-item ledger](implementation-checklist.md) keeps implementation and acceptance limits separate.
