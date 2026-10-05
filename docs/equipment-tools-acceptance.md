# Crafted tools, melee archetypes and equipment slots

2026-10-05, PR4. This is an original small-game implementation of I04, I06, I08 and B08, not a complete Enshrouded item catalog.

## Playable content

- Craft the axe (wood 3 / stone 2), pick (wood 3 / stone 3), rake (wood 4 / stone 2), or building hammer (wood 4 / stone 2) by hand. Select them in Inventory. The selected tool has its own equipment slot and is shown in the HUD and hand rig. `2` selects that tool; `1` returns to the equipped weapon. Unequipping the tool leaves the original chisel available so initial resource collection cannot deadlock.
- Axe and pick damage follows the displayed continuous shaft sweep. Axe favors wood/processed wood/leaves; pick favors stone/monument stone/metal. Favorable light/heavy power is 75/135, unfavorable power 10/18, evaluated independently for every occupied sample in the bounded contact area. Existing sample depletion still owns drops, protection, remeshing and collision.
- The rake defaults to the same contact sweep and cuts only soil/leaves above the contacted quarter-meter height plane. Stone/metal/building wood are unaffected. Its bounded cutting radius is 0.48m. F / touch mode button / the controller’s mapped element-switch action toggles finite soil fill: nine owned soil units create one supported 0.75m square flat tile. Full controls, bounded geometry, refunds and test evidence: [soil fill acceptance](soil-fill-acceptance.md).
- Equipping the hammer opens the existing paid build preview. Attack places; heavy dismantles; V changes part, F rotates, X undoes, G closes the preview. All pre-existing support/body/line-of-sight/cost/return checks still apply. Successful placement/dismantling wears the hammer; failed placements do not. A broken hammer requires repair before these operations. The original explicit build commands remain available.
- Tool repair costs stone equal to ceil(missing durability / 25), available by hand. Other gear retains its forge and metal repair costs. No failed repair/craft/salvage operation spends resources. Hammer upgrades/gems are explicitly unsupported because those stats would have no gameplay effect.

## Melee differences

| Weapon | Blade length | Light windup / strike / recovery | Light damage / stamina | Heavy damage / stamina | Stagger, light / heavy |
|---|---:|---|---|---|---|
| Existing sword | 1.05m | .38 / .29 / .48s | 32 / 20 | 55 / 32 | 0 / .95s |
| Greatsword | 1.50m | .56 / .38 / .70s | 48 / 30 | 78 / 44 | .45 / 1.20s |
| Dagger | .58m | .16 / .14 / .20s | 20 / 10 | 34 / 18 | 0 / .30s |

Sword return-combo values remain unchanged. Damage above is before upgrades, skills, wear and head contact. Greatsword uses a wider authored sweep, a supporting left hand and longer recovery. Dagger uses independently authored high/low thrusts and a committed heavy lunge. Both retain continuous position/velocity across phase joins and use those same poses for display and contact. Hand-to-eye obstruction also prevents a thrust beginning behind a wall. No aim-cone damage was added. Regional tactics honor the melee stagger and cancel their interrupted pending attack/lunge.

The greatsword stows an equipped shield without deleting it and blocks shield re-equipping until a one-handed weapon is selected. Existing bow/staff behavior and the starter sword/wood shield remain. All living party actors must finish their action before changing the shared loadout, preventing a companion from changing another player's blade length mid-swing.

## Armor and persistence

- The existing `armor` save key remains the torso slot. `head`, `legs`, `shield`, and `tool` are added; `charm` is the shared amulet/ring slot. Cloth and copper head/leg items have different mitigation, mass/cold modifiers and material reactions. Copper shields reduce guard stamina costs, and their upgrades/gems contribute real armor mitigation. The traveler ring trades the charm's HP option for 15 maximum stamina.
- Cloth/metal presentation is selected independently by body slot; weapons/tools/shield/accessory use corresponding visible meshes. The party avatar reads the same already-shared loadout, without a network protocol change.
- Metal in any worn part or shield produces metal environmental exposure; cloth is used when no metal is equipped. This is intentionally a bounded whole-character exposure approximation, not a fully localized clothing heat model.
- Saves accept the exact original five-slot shape or the complete nine-slot shape. Missing new slots on an old save normalize to null on atomic restore. Unknown slots, partial slot additions, wrong item slots, unowned items, illegal two-hand/shield combinations and invalid durability/upgrades are rejected. Existing item ledger identity is preserved.
- No frozen world geometry, manifest or terrain migration changed. Integration advances the relay protocol to 3 because older peers cannot validate the new nine-slot shared equipment snapshot; both clients must reload. Old single-player saves remain supported.

## Evidence and remaining acceptance

- `tests/unit/equipment-tools.test.ts`: finite recipes and failure atomicity; slot constraints; gear wear/repair/salvage; legacy saves; continuous weapon poses; actual reach/contact/wall tests; armor material shock; per-slot rig and tool visibility; production menu rows; useful shield upgrades and rejected hammer upgrades; shared-loadout action guard.
- `tests/unit/equipment-normal-play.test.ts`: starts with no supplied materials and uses only production look/movement/action/menu transactions. Gathers, crafts and uses the axe/pick, collects the drops by approaching, levels ground with the rake, lights the hearth, builds a paid workbench with the hammer, then captures/restores the actual world and equipment.
- Existing first-chapter sword, bow and staff normal-play tests are retained as regression evidence.
- `tests/e2e/campaign-equipment-tools.spec.ts`: four discovered desktop/Android cases covering recipe/slot explanations and real-input pick crafting/use/save/reload. These definitions are **not browser acceptance results**. Local Chromium is known to fail before page launch with socket EPERM; no launch workaround was repeated. Exact-commit CI/public-preview play and screenshots remain required.
- Greatsword/dagger contact and resources are exercised at Core level. A new-player browser duel through the full campaign for each new archetype, visual readability on physical phones, and measured performance remain unverified. The existing build reports the pre-existing >500kB bundle warning.

Final local verification of the fixed code, 2026-10-05:

- `npm run typecheck`: passed.
- `npm run test`: 98 files, 826 tests passed; 258.23 seconds. This includes the 18 added equipment/tool checks and all retained normal-play/save/terrain/network regression tests.
- `npm run build`: passed; existing large-chunk warning only.
- `npm run e2e -- --list tests/e2e/campaign-equipment-tools.spec.ts`: four cases discovered. Execution, screenshots and public-preview acceptance remain pending as described above.
- `git diff --check`: passed.
