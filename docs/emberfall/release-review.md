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
