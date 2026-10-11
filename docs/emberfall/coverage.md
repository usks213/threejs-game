# Source-inspired systems and explicit gaps

Reference requested: https://noita.wiki.gg/ja/ . The Japanese entry could not be read directly in this environment. English wiki pages were available in indexed search. These sources informed mechanics research; they are not copied game content. Status describes this implementation only, never fidelity to every source detail.

| System | Current status | Evidence and gap |
|---|---|---|
| Cellular material world | Implemented bounded subset | 13 IDs; powder/liquid/gas movement, density swap, fire/oil/wood, water/toxic/lava reactions, strength-based terrain carving. Material unit suite. Full-map CPU update, not active-chunk simulation. |
| Actor/material coupling | Implemented subset | Wet, burning, poison, oxygen, lava and bottle fill. Actor feet/head sampling, fire resistance. No coating proportions, ingestion or full stain model. |
| Wands/decks | Implemented subset | Ordered/shuffled engine, mana/regen, capacity/spread, delay vs recharge, modifiers, multicast, bounded nested impact payload, limited ammo. Wand tests. Normal run currently has only two nonshuffle wands. |
| Wand inventory and shops | Partial | Safe editing, spell-type unlock purchase and prices checked by rules. Reusable unlocked spell types differ from finite card inventory. No dropped-wand pickup, selling, shuffle-wand acquisition or full catalog. |
| Movement/input | Implemented; browser verification pending | Platform collision, step-up, fuel-limited flight, aiming, shooting, multitouch and input release. No kick/throw, controller/remap or equivalent accessibility options. |
| Cave generation | Partial | Three descending zones; seeded path/side pockets, increasing enemies and distinct water/toxic/lava hazards. Downhill character-clearance tests on 18 maps. Shared zigzag topology, no large branching surface world. |
| Combat/loot | Partial | Crawler/moth/sentry + guardian, LOS/contact/projectile/blast/hazards, gold pickups/mining. No faction AI, wand-using enemies, indirect kill bonus or large enemy catalog. |
| Refuge/perks/progression | Implemented bounded subset | Healing/ammo/bottle restoration, one-of-three perk selection, six effects, shop and next layer. Unit tests distinguish all effects. No perk stacking/rare combinations/anger/destruction escape simulation. |
| Boss/victory/death | Implemented rules; full-run real-input acceptance pending | Final gate blocked by living guardian; terminal death/victory preserved on save. Input-only headless seed 3397 wins all three layers with ordinary health/resources; five seeds reach first refuge. Browser and human acceptance remain pending. |
| Save/resume | Implemented subset | Full edited terrain/lifetimes/RNG, actors/projectiles, deck/ammo, perks/phase, checksum+schema limits, backup and error reporting. Local single browser only, no cloud sync. |
| Visuals/audio | Partial | Original procedural pixel sprites, terrain, particles, cheap light pools, Japanese UI. No sampled source assets; audio/music are not implemented. |
| Performance | Narrow unit/CPU evidence | Bounded finite grid + dirty render chunks + capped effects. No actual Android/iPhone FPS, long-session battery/memory or broad stress acceptance. |

## Remaining breadth required before any full-reproduction claim

- Complete source spell, modifier, perk, material and enemy catalogs and their combinatorial behavior.
- Advanced wand wrapping, copy spells, trigger inheritance corner cases, infinite builds, spell-card ownership and dropped wand interaction.
- Rigid body kick/throw/fracture, electricity and conduction, freezing/melting/transmutation, broad alchemy recipes.
- Mixed/ingestible/thrown flasks, all stains/statuses/resistances, bottles containing arbitrary materials.
- Additional biomes/topologies, surface, side regions, secret rooms, environmental puzzles, optional bosses/quests/orbs, parallel worlds, NG+, alternate endings.
- Factions, enemy wand use, many attack patterns, indirect/trick kill rewards and broader encounter balance.
- Controller, remapping, audio/music, localization/accessibility breadth, actual-device and long-session acceptance.
- A fully verified end-to-end ordinary-input journey through all layers, shops, boss and ending; current clear-path/rule tests do not substitute for it.

## Sources

- [Wand mechanics](https://noita.wiki.gg/wiki/Guide%3A_Wand_Mechanics): deck order/shuffle, cast delay and recharge.
- [Liquids](https://noita.wiki.gg/wiki/Liquids), [Water](https://noita.wiki.gg/wiki/Water), [Alchemy](https://noita.wiki.gg/wiki/Alchemy): particle families, density, wetness and reactions. This build simplifies cell-level fire/water reactions; do not infer universal source parity.
- [Controls](https://noita.wiki.gg/wiki/Controls), [Holy Mountain](https://noita.wiki.gg/wiki/Holy_Mountain), [Perks](https://noita.wiki.gg/wiki/Perks): exploration and between-layer decisions.
- [Biomes](https://noita.wiki.gg/wiki/Biomes), [Enemies](https://noita.wiki.gg/wiki/Category%3AEnemies), [Trick kill](https://noita.wiki.gg/wiki/Trick_kill): substantial remaining world/combat breadth.
- [Orbs](https://noita.wiki.gg/wiki/Orbs_of_True_Knowledge), [Parallel worlds](https://noita.wiki.gg/wiki/Parallel_Worlds), [Peaceful ending](https://noita.wiki.gg/wiki/Advanced_Guide%3A_Peaceful_Ending): omitted long-form progression and endings.
