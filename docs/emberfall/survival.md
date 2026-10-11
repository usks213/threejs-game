# 燐の底: persistent cellular survival crafting

The main URL is now a survival-crafting world, following the updated direction of 2026-10-11. The earlier expedition remains isolated at `?mode=expedition` for existing saves and compatibility testing. It is not the main progression loop.

## Ordinary play loop

1. Use the pick to cut actual wood, rock, sand and ore cells. Removed cells produce counted resources; empty cells never do. The tool acts on the first reachable surface, with limited range and cooldown.
2. Open the **メニュー** and its **工作** tab and spend resources on torches, a workbench and a campfire. Workbench proximity enables finite spell-card editing, pick improvement and limited-ammunition crafting.
3. Select the crafted item in the tool selector and aim toward a clear supported floor. A camp establishes the respawn location. Wood and stone blocks consume nine matching resources and become actual material cells; sand falls under gravity.
4. Build from dry edges around the shallow reservoir. Mining its walls releases its finite water. Wood walls can burn; stone stays nonflammable and blocks flowing cells. Lighting is useful when exploring the connected deeper cave.
5. Death returns the player near camp or the entrance. The edited world, resources, finite card ownership, surviving structures and enemies remain. Equipment whose support was destroyed is returned to inventory by the same rule used during ordinary play. Save/title/reload continues this same world rather than generating a new run.

Desktop: A/D, Space, mouse use, F water, 1/2 wands, Tab/Escape workshop/pause. Touch: left movement pad, right aim-only pad or screen aim, a separate use button, flight and water buttons. Sliding the movement pad upward also levitates. Select a tool before using it. UI pauses do not advance hazards. All controls release on cancellation, resize or blur.

## Physics and persistence boundaries

- Reuses the cellular powder/liquid/gas, density, oil/fire/wood, water/toxic/lava reactions and terrain carving. This is not a static tile backdrop.
- Mining and placed-cell resources are conserved. Crafting checks full cost before mutation. Placement rejects occupied actor/structure cells and does not silently delete liquids; build a dam from a dry edge.
- Camp recovery searches a bounded nearby safe floor. A completely buried/flooded camp needs a tiny emergency air shelter with unmineable flooring. Cleared recovery cells grant no resources. This exception is disclosed rather than claiming literal preservation of every death-site cell.
- Equipment needs the same center-cell support required at placement. Mining that support, an explosion, falling sand or burning wood returns one finished item exactly once; pointing the pick at equipment uses the same recovery transaction. Recovery of the active camp selects the newest remaining supported camp, or the entrance. There is no recipe-material refund. At the exceptional 100,000-item inventory cap, manual recovery is refused and automatic overflow is lost with a notice. Equipment does not simulate rigid-body falling, durability or extinguishing.
- Existing survival saves migrate in memory to the expanded world; the original bytes are archived on the first successful v2 save. Removed equipment leaves monotonic ID gaps; the reader accepts bounded gaps and reconciles formerly floating equipment in memory without rewriting the original save merely by loading it.
- Survival saves use separate `emberfall-survival-save-v1` and backup keys. The legacy expedition keys are not read, migrated or overwritten by this mode. Save envelopes validate bounded resources, structures, ids, camp/spawn, tool, full inherited world/RNG/cards/ammo/enemies and checksums. Backup recovery and storage failures are handled visibly.

## Lighting and visual architecture

Original pixel art at a bounded logical resolution, stratified terrain and distant cave layers. The light grid is coarse enough for mobile budgets, with capped source count, line-of-sight ray work and refresh rate. Solid terrain occludes local lights; water does not become an opaque wall. Player light, fire/lava clusters and placed torches/campfires emit light. Bloom is accumulated from emitting sources, not a blur over the entire scene. The world and control HUD remain readable outside the brightest pools.

## Scope and acceptance

The current candidate expands survival to one finite seeded 1536×768-cell world with six connected regions, a surface and underground galleries. Up to 49 nearby 32-cell chunks simulate; distant matter/actors pause. See [open-world.md](open-world.md) for exact boundaries and migration. It does not provide Terraria's world size, item/recipe/boss progression or Noita's full material/spell/physics catalogue. Deeper regional progression, structural collapse/durability, mixed flasks, electricity/freezing, audio, multiplayer, controller/remapping and real-device performance remain missing or unverified. Existing coverage-ledger gaps still apply where relevant.

Required candidate acceptance: strict types, all unit suites, PC/Android-profile actual input from mining through crafting/placing camp and torch, lethal self-damage with persistent recovery, save/reload with old-save protection, inspected lit-world images and bounded renderer work/frame progress. Source/unit tests alone do not establish visual quality, phone FPS or a satisfying long-term game.

## Previously accepted survival candidate

`7c38b622` passed CI38144445126 with 129 unit tests and eight applicable browser cases. Both PC and Android-profile ordinary-input survival flows reached crafting/placement, actual explosion death, persistent camp recovery and reload. Lit-world and respawn images were inspected; old save isolation and edited-terrain samples passed. The accepted loop is a small initial survival slice, not long-term balance or device-FPS proof. See [release-review.md](release-review.md).

## Physical base-building follow-up

The equipment-recovery game candidate `459ed014` passed CI38147393997 with 141 unit tests and all ten applicable browser cases (one PC reservoir retry; two profile-specific skips). PC and touch normal input can collect 27 stone cells, build a retaining wall, mine the finite reservoir, observe the dry side stay dry, open the wall, and see water flow downstream before save/reload. The earlier `4f49290d` ran both reservoir routes on their first attempt. Direct workbench recovery and continued ownership after reload also passed in both profiles. Equipment support reconciliation has independent repeated recovery/save tests. Exact publication-candidate verification remains required; see release-review.md for retries and boundaries.
