# ADR 0016: Representative three-layer exploration sites

Status: implemented locally; browser/device validation and public deployment pending.

Three original sites add three communicating rooms each: 裂帆の中継庫 on the surface, 残響の揚水院 below ground and 薄明の記録庭 on a separate sky island. This is a representative content set, not completion of a large dungeon catalogue. The surface candidate at (-22,16) was rejected after measuring it inside the existing river at -3.63 m; the implemented centre is (24,-32), above the river. Existing seven trials, four beacons, the inclined causeway and thermal locations remain intact.

## Geometry and migration

The sites stamp 138 ordinary BuildingState pieces. They use existing carved voxel rendering, contacts, support and water obstacles rather than changing the generator or adding initialization terrain edits. Each site has an open main entrance and side entrance, connected room bays, an exterior roof stair and a flat roof tile for an independently validated vertical-passage exit. Other walls can be mined. Architectural sequence is not a quest condition.

`siteWorld.version=1`, `layout=1` records installation, measured bases, skipped pieces, completion, evidence, reset epochs and the rescue pose. Layout here versions the authored stamp, not the density generator. An installation runs once. Pieces overlapping existing edit brushes, private/ordinary buildings, actors, SkyParts or trees are skipped rather than displacing existing content. Destroyed pieces are not restored on restart. Every authored piece has an empty salvage map, which repair and voxel peeling preserve. Thus dismantling and resetting cannot farm construction costs.

New worlds use `storyMode=full`; older worlds without the field migrate to `side`. Old progress is never locked again. The main four-beacon objective is retained, with regional completion required before the final observatory only in new full-story worlds. The sites add their own guides and three original regional boss definitions/attack profiles, not copies of another game's content.

## Authority and recovery

Transport checks an actual loan cargo's released, slow, stable pose in the destination room. Rescue walks a persistent NPC body through current terrain, carved buildings and parts; it stops at obstacles, handles capsule support at floor edges, and drops its caller on disconnect so another player can continue. Restoration latches actual lamp power plus thaw-then-water evidence. Conditions survive the visual timing window and are reported later. Initial boss awakening is an accepted state-changing operation; unmet conditions and rejected resets do not mutate the transaction.

Completion is recorded once before its ground reward. Shared growth is derived from world completion, including for late joiners, without giving each joiner new material. Boss defeat is recorded once and cannot generate repeated loot. Personal accepted/discovered-room records remain separate from the world state. Transient escort claims are dropped during load. Skybound loan tags prevent salvage while allowing cargo towing. Reset replaces only loan objects or the rescue NPC, never custom terrain or player creations. If support has been removed, small tagged fixed loan pads provide a local recovery surface. Player-operated/towed loan objects cannot be reset underneath the operator.

## Physics and budget evidence

All 138 initial pieces survive support recomputation; both entrances of all three sites pass sampled capsule clearance. Tests exercise an actual motor entering a room, climbing the authored stair onto the roof, vertical passage through its flat exit, mined access, live stable cargo, live powered/thermal/water device evidence, collision-aware rescue, shared report races, save/restart, old-world migration and exactly-once rewards.

A Node-only 150-tick profile with 138 pieces measured dry tick p95 3.52 ms and wet tick p95 10.93 ms after obstacle coalescing; support median was about 0.5 ms. Exact voxel runs are coalesced into 3D boxes, preserving carved cells. This reduced dry water-obstacle work median from 3.04 to 0.72 ms and dry save median from 3.44 to 1.13 ms (wet save 3.97 to 1.46 ms). Wet p95 did not improve relative to the earlier 10.14 ms run, and GC/initialization spikes remain. These are synthetic server timings, not GPU or phone FPS claims.

Coalescing also exposed omitted fluid edges entering a solid from just outside a lower bounding face. Enumeration now includes that neighbouring cell. Carved/rotated occupied fractions and edge barriers match between row-slab and merged representations; a direct lower-face regression covers the correction. The historical half-cell mask fingerprint was updated for this explicit boundary fix.

Current limitations: escort pursuit has local sliding rather than global pathfinding; players must lead around obstacles or dig a route. Site-reset may ask players to clear an obstructed loan/rescue area. Regional bosses reuse the existing authority movement/combat framework with distinct attacks and conditional vulnerabilities; this does not establish full articulated destructible boss bodies or comprehensive encounter balance.
