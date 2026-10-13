# Finite wand/card inventory candidate

This increment builds on the accepted/public `25382059` release. Its CI publication job is disabled while candidate input acceptance and independent review run; the public version is preserved until the candidate passes.

## Ownership and exchange

- Loose cards and cards equipped in two wands are separate, finite inventories. Two identical cards are two owned copies. Editing atomically returns the previous layout to the loose pool, then consumes the requested layout. An overdraw, invalid card or over-capacity layout leaves both unchanged.
- To move a card to another wand: remove it from the first wand, apply, then equip it in the other. Empty layouts are allowed. The UI displays each available count and explains a rejected overdraw.
- Each cave has one visible entrance wand cache. The modest shuffled cache contains the previously unavailable pebble plus a trigger, multicast, modifier and basic shot. Exchange either carried wand; the old wand remains in that exact cache. Exchanging back preserves the actual wand/deck state, rather than generating another copy.
- Refuge shops sell individual cards, with two copies of each spell per refuge and explicit prices. Purchases debit gold and stock atomically. All ten defined spells are now normally obtainable.
- Limited bomb ammunition is conservatively shared across both wands and all copies, maximum six until refuge. It is not a per-card ammunition model. Editing, moving a bomb card, switching or exchanging wands cannot replenish it. This explicit scoped rule prevents a free-refill loophole in the prior per-wand model.

## Save compatibility

The existing storage keys remain. New writes use a version-two envelope and include loose cards, pickup state, finite shop stock and shared ammunition. Strict validation bounds inventories, pickup counts, spell catalogs, positions, ids, stock and ammunition consistency before accepting or writing state.

Version-one data is validated against its original schema before migration. Already equipped cards are preserved; each formerly unlocked spell not present in an equipped wand receives one loose copy. Legacy unlimited unlocks cannot be converted into unlimited finite cards. Shared limited ammunition starts at the lowest remaining charge of the two carried wands. Migration does not silently heal, reset a deck, or resurrect terminal runs. Primary/backup validation and storage-failure handling remain.

## Required acceptance before publication

- Unit checks: ownership conservation across repeated edits/exchanges, rejected overdraw with zero mutation, finite purchase stock, limits/ids/ammunition corruption, valid legacy migration, backup recovery and deterministic save continuation.
- Normal browser controls: walk to a cache, inspect, exchange either slot, exchange back without duplication, save/title/reload/resume, and use the acquired trigger wand. Read-only impact observations must show actual child projectiles starting at remote impact rather than the muzzle.
- Desktop refuge UI: reject three shard cards when only two are owned, remove/re-equip without loss, buy finite cards and retain the existing complete journey.
- Android-profile portrait: trusted touch walk/fire, reachable 48px pickup/exchange controls, save recovery and inspect actual images. This remains emulation, not real-device performance.

This is a small systemic depth increment. Broad source catalogs, world/quests, mixed flasks, electricity/freezing, physics breadth and other coverage-ledger gaps remain open.
