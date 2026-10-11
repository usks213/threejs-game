# Physical base-building follow-up candidate

The published baseline is `ea4bfb00a02cb8ca16793593444219ff93f13bfa`, verified by CI38145085958 and the served deployment manifest. That final run had seven first-attempt passes, one legacy PC inventory retry pass and two profile-specific skips; both new survival routes passed on the first attempt. The Cloudflare status precheck returned HTTP500 before upload on the first publication attempt; retrying the same publication job succeeded with the production deployment unchanged.

The next candidate adds ordinary PC/touch reservoir engineering acceptance, pickaxe equipment recovery and loss-of-support recovery. Removing support returns a finished item once; death assertions now conserve inventory plus placed equipment rather than assuming explosion-damaged supports survive. Recovered workbench ownership is checked across reload. The old inventory driver now observes movement every 50ms rather than allowing coarse polling to walk beyond the pickup. No interaction ranges, material costs, physics rules or assertions are bypassed.

Game code is accepted through `459ed014` / [CI38147393997](https://github.com/usks213/threejs-game/actions/runs/38147393997): strict types, 141 unit tests, build and the complete browser suite. Nine cases passed first attempt; PC reservoir passed on its one configured retry; two profile-specific cases were skipped. The previous candidate `4f49290d` passed both reservoir and both equipment recovery flows first attempt, but failed the legacy journey because its driver stood still at the final gate under enemy fire. The driver now uses ordinary positioning and fuel-limited levitation; game rules/HP/enemies/victory criteria are unchanged.

Independent review verified 100 alternating direct/support-loss recovery cycles per equipment type with save/reload, no duplication, monotonic IDs and untouched old save keys. Actual PC/touch screenshots show held water followed by downstream flow. Receipts on `4f49290d` recorded 27 stone cells, zero water on the dry side, then 21 PC / 17 Android-profile downstream water cells after mining the opening. Deaths remained zero. Equipment pickup and post-recovery saves passed in both profiles.

The remaining PC reservoir retry was an input-positioning issue: at x113.81 the avatar stood on the reservoir rim at y22.99, so the intended wall strike did not open it. The publication candidate only changes that driver to walk to x117 (the existing ±1.2 tolerance keeps the avatar clear of the rim) and observe landing before mining, plus docs and the existing publication guard. It must pass exact-candidate CI before version-only upload. No assertions or material/actor collision rules are relaxed.

---

# Survival crafting acceptance (2026-10-11)

Game candidate `7c38b622a4865d0fc78c208eccfd0e039a972fd0` passed [CI38144445126](https://github.com/usks213/threejs-game/actions/runs/38144445126): strict types, 129 unit tests across 11 files, production build, eight applicable browser cases and two explicit legacy-profile skips. No retry was needed for the accepted browser cases.

PC and Android-profile normal input both completed: actual wood/stone/sand mining → finite-resource camp/workbench/torch crafting → supported placement → lethal self-inflicted explosion → camp recovery → save/title/reload/continue. No inventory grants, position teleports, health edits or direct game-method calls are used by this browser route. All three structures, resource counts and camp survived death and reload; sampled mined terrain remained edited. The survival flow left the existing expedition save key unchanged. Legacy tests additionally retain the complete three-layer journey, finite-card exchanges/trigger impact and trusted three-finger cancellation/rotation checks.

Actual lit-base PC/portrait and camp-respawn screenshots were inspected. The warm light pools are visible around emitting structures, crisp materials and enemies remain readable, and portrait resource labels no longer cover the player's head. Renderer receipts remained within seven sources / 6144 rays; one-second gameplay tick progress checks passed. Snapshot render timings are not phone FPS measurements.

Independent review covered legacy save migration, finite ownership/ammunition, strict isolated survival saves, safe recovery, high-camp placement bounds, structure/render/light geometry and pure placement validation. Review-found mismatches were fixed before acceptance. A first browser attempt passed mining/workbench/camp but failed torch placement because the input driver overshot its walking target; short-interval input observation fixed this without changing range/cost/placement rules. A separate targeting correction lets 3×3 stone blocks sit flush on the actual floor instead of leaving a grid-snap water gap.

Publication still uses the existing Worker version-only script, exact build SHA and production-before/after checks described below. The publication commit changes only documentation, the enablement guard, and normal tap-duration acceptance (instead of holding a placement into a second attempt); game rules/art are unchanged from the accepted candidate. That final commit must pass the entire CI before upload.

Known limits: finite 256×384 world; small recipe and encounter catalog; anchored equipment lacks structural durability/collapse; emergency camp recovery may clear a tiny non-harvestable shelter; no audio, multiplayer or real-device FPS/long-session validation. Water/dam/fire behavior has rule-level tests; a full browser reservoir engineering scenario is not yet claimed. See [survival.md](survival.md) and [coverage.md](coverage.md).

---

# First playable release review

Game candidate: `6035598b078ebb639469ce66cb77337e8141488a`.

[Exact CI38140465815](https://github.com/usks213/threejs-game/actions/runs/38140465815) passed on 2026-10-11. The following publication commit changes only CI/release scripts and documentation, not gameplay source.

## Verified

- TypeScript strict checking, all 72 unit tests across seven files, production build.
- PC basic controls: movement, levitation, shooting, wand selection, equipment editing restrictions, Escape resume, resize, save/title/reload/continue.
- Android profile basic controls plus trusted CDP three-finger movement/aim-fire/levitation, cancellation, rotation and 48px control bounds. This is emulation, not an Android handset.
- Full desktop route using keyboard/mouse and normal shop/perk/select controls only: seed3397, all three caves, both refuges, force+lance wand editing, final guardian and victory. 22 enemies defeated, 265 gold, 73 displayed game seconds. No teleport, health changes, save injection or direct simulation method invocation in this browser route.
- Four browser cases passed; desktop-only touch case and Android full-journey case were explicitly skipped by profile. The headless rule route additionally passes five seeds to the first refuge.
- Actual title, cave portrait/landscape, equipment, both refuge and victory screenshots reviewed. Avatar is visible below HUD, mobile controls are separated, PC aim is no longer intercepted by touch-only controls.
- Independent source review covered finite spell traversal/mana, material conservation/reactions, collision/hazards, save validation and continued deterministic state, input lifecycle and publication isolation.

## Failures found and corrected during acceptance

- Resume HUD briefly displayed the preview world's initial position: refresh immediately on resume.
- Portrait character behind the HUD: reserve a top-of-world camera margin.
- Slow startup after title capture in software-rendered CI: bounded 160/240-cell-wide pixel canvas, one dirty-union upload and no continuous redraw while paused; CI raster contexts run serially. Earlier failed checks are not reported as passes.
- The faster full journey's route driver stopped against a local ledge: use ordinary fuel-consuming levitation to recover, and prevent desktop mouse shots from landing on mobile movement pads. HP, enemies, collision and victory requirements were preserved.
- Focused buttons blocked gameplay keys; Escape could not resume; failed save still left the run; final-layer refuge data could descend outside valid biomes: each corrected before release.
- Continuous trace screenshot capture created an unnecessarily large artifact. Explicit requested-stage PNGs are retained separately; functional assertions and DOM/action traces remain.

## Publication boundary

`scripts/publish-emberfall.mjs` accepts only PR6, the fixed existing account and Worker `threejs-game`. It verifies the build manifest SHA, confirms a nonempty existing production deployment, runs only `wrangler versions upload` with alias `pr-6-emberfall`, checks production deployment equality before/after, reads the actual CLI-returned URL, and verifies that URL serves the expected SHA and game HTML. It never runs production deploy, creates another Worker, grants access or alters other PR aliases. Failure at any boundary remains a failed publication, not a guessed URL.

## Not established

Full Noita parity, broad procedural world variety, complete spell/perk/item/enemy catalogs and combinations, audio/music, real Android/iPhone FPS, controller/remapping/accessibility breadth, full-run Android and human enjoyment/difficulty balance. See the complete [coverage ledger](coverage.md).
