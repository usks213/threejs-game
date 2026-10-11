# B18 / B20: finite skill and gem progression

This completes a deliberately bounded progression model for the original Seven Lights campaign. It does not claim the source game's complete skill tree or gem catalogue.

## Skills

All three existing skills have ranks 1–3. Every rank costs one point; ranks 1/2/3 require character levels 2/4/7. Character levels remain capped at 10, giving exactly nine earned points. A rank must follow the previous rank. Mist adaptation additionally requires the same or higher rank of Traveler's Breath.

| Skill | Effect per rank | Rank-three total |
| --- | --- | --- |
| 丈夫な身体 / vigor | Maximum HP +20 | +60 HP |
| 旅人の呼吸 / endurance | Maximum stamina +20, movement +8% | +60 stamina, +24% movement |
| 霞への適応 / attunement | Maximum shroud time +30 seconds | +90 seconds |

Increasing maximum HP does not heal the player. Respec returns the exact sum of purchased ranks, including upgrades, and immediately clamps campaign shroud time to its reduced cap. A repeated empty respec returns nothing. Existing actor ticks clamp HP, stamina and companion shroud time after changed limits.

The equipment page's skill rows show current rank/effect, next cost/required level, prerequisites and final cap. Commands specify the intended target rank, so repeating an old request cannot purchase the next rank. The legacy unqualified learn command remains a rank-one request.

Saves retain `skills[]` as the unique list of learned skill IDs and add an optional `skillRanks` map. Old saves without the map normalize each listed skill to rank one, preserving spent and unspent points. Invalid ranks, unknown/missing map keys, inconsistent prerequisites, impossible level gates and a total different from `level - 1` are rejected atomically. Disk and party snapshots use the same validation. Maximum valid shroud time is now 270 seconds, including the companion DTO.

## Gems

Each step uses the existing lit-hearth forge within 3 metres and the rescued smith. There are three gem items with independent 20-unit inventory limits.

| Tier | Forge input | Additional gate | Weapon/tool power | Armor/shield reduction |
| --- | --- | --- | --- | --- |
| 灯火の石 / ember-gem | Stone 4, metal 3 | None | +12% | +5 percentage points |
| 灯火の石 II / ember-gem-2 | Tier I stone ×1, stone 6, metal 4 | Flame tier 2 | +18% | +7.5 percentage points |
| 灯火の石 III / ember-gem-3 | Tier II stone ×1, stone 9, metal 6 | Ridge camp reached | +24% | +10 percentage points |

Crafting consumes the previous gem rather than upgrading every item with that ID. Socketed gems must first be removed for forging. The three forge recipes expose their materials, previous stone, quantity and gate; tier III is the cap. Each gear item has one socket. Supported weapon, armor, shield and gathering-tool slots share the same effects and durability rules; the build hammer, movement gear and accessories refuse sockets. Broken gear halves its full modified contribution, and total armor reduction retains its 65% cap.

Replacement returns the exact previous-tier gem and consumes the selected new-tier gem. Removal and salvage return the socketed tier unchanged. If the returned gem's inventory is full, no item, gear state or material is changed. Salvage also refuses a full returned-material stack. Repeated attach/remove/salvage requests do not duplicate gems. Socket changes wait until both shared actors' equipment-changing actions are idle.

`validGearState(id, value)` validates the same gear payload for inventory and display escrow; ownership is checked by the containing system. Upgraded gems use ordinary discovery, item storage and save rules.

## Evidence and acceptance limits

- `tests/unit/skill-gem-progression.test.ts`: finite authored rewards earn all nine points; acquisition/upgrades/caps/prerequisites/refunds; legacy and malformed saves; precise gem inputs, locks, full outputs/returns, replacement/removal/salvage; real SDF sword damage and enemy melee mitigation; menu command behavior; disk and shared snapshots, including a 270-second companion timer.
- `tests/unit/skill-gem-normal-play.test.ts`: begins with zero materials and uses production movement, harvesting, combat, quests and menu transactions through the first chapter; buys ranks, creates a tier-three stone from gathered inputs, sockets it, refunds skills and restores the checkpoint.
- `tests/e2e/campaign-skill-gems.spec.ts`: four desktop/Android-equivalent cases cover skill explanations, prerequisite/cost text, disabled early actions, three gem recipes and repeated menu dismissal/tab changes. They are included in the existing equipment browser CI groups. Definitions and discovery are not browser acceptance results.
- Local Chromium is known to fail before page launch with socket `EPERM`; it was not retried or bypassed. Exact-commit CI execution, screenshots and public-preview acceptance remain required. Physical Android/iPhone readability and all-rank browser play remain unverified.
- No terrain, world manifest or save-store key changes are required. Integration owns the relay protocol advance, remote push and existing preview publication.

Local verification, 2026-10-05:

- New progression suite: 14 tests passed after assigning the eight-world combat case a 30-second liveness budget. All contact/damage/mitigation assertions remain unchanged.
- Fresh normal-play route: passed, including finite extra gathering, first-chapter completion, skill purchases, tier-three forge/socket and checkpoint restore.
- Existing campaign, equipment/tools and bulk-crafting suites: 83 tests passed.
- Typecheck and production build: passed; the existing large-chunk warning remains.
- Desktop/Android browser discovery: four cases found. No browser execution or screenshots are claimed.
- The first aggregate run reached a timeout in the new eight-world case at 15.6 seconds under the default 15-second limit; its other results are still pending at this commit. Integration must run the full suite on the combined final code. Focused checks above are not an aggregate pass.
