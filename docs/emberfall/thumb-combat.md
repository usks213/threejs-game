# One-thumb weapon switching and combat

## Why the October 12 result was insufficient

The user reported that weapon changes and attacks did not fit one-hand use. The previous single-pointer route primarily proved crafting and traversal. It reached weapons through the equipment workshop, rather than exercising a fight. The public baseline b74c971e also toggled from the displayed wand 1 to wand 2 when returning from a pickaxe, placed that button far above the thumb, and failed to mirror it fully for left-handed play. Those were concrete usability failures despite passing earlier tests.

## Revised interaction

- Two explicit, mirrored weapon slots and a pickaxe slot sit directly above the thumb pad. A tap selects that slot, without firing or entering a workshop. The duplicated distant pickaxe/weapon buttons are hidden only in one-hand mode.
- Drag from either weapon slot to aim manually. Crossing the 28% dead zone starts a monotonic 120 ms grace. Ordinary weapons repeat while held. Releasing returns directly to the movement pad; no separate travel-mode tap is needed.
- A deck containing excavation, fire, explosives or finite-use cards is manual only, with one successful **cast** per displaced gesture. This preserves modifier/multicast/trigger evaluation as a whole, rather than reducing it to one card. Cooldown or mana rejection does not consume the gesture. Recenter or lift and drag again for another cast. The status shows the next card, or a reshuffle instead of guessing the next shuffled card.
- Ordinary-shot movement assistance defaults **off**. The nearby assistance button explicitly enables/disables it; the settings checkbox is another route. When enabled and a normal-shot wand is selected, a displaced movement/flight drag can aim and shoot at the nearest living, active enemy within 72 world cells, on screen and in line of sight. There is no prediction, bullet steering, damage increase or enemy weakening.
- A target ring previews the assisted target before firing. Manual weapon contact overrides and hides assistance. No target, a wall, offscreen enemies or unsafe deck means no assisted fire. On portrait screens, assistance excludes the bottom control-covered portion of the viewport.
- Selection tap, canceled unarmed contact and lifecycle clears cannot fire. Slot selection preserves the current pointer capture across synchronous app updates, avoiding a delayed lost-capture event canceling its replacement contact. Already active input is cleared before a new slot gesture is built.
- A canceled, unarmed slot press preserves the previous tool/mode. A deliberately armed drag selects that weapon, but cancel still stops use. Left/right positions, small portrait layouts and safe areas are mirrored.

Mining/placement keeps its existing 220 ms dwell. Keyboard/mouse and optional two-hand direct holds retain their behavior. The two-hand toolbar now first equips its displayed wand when returning from another tool; a subsequent tap switches it.

## Compatibility and bounds

World/save schemas, cellular rules, projectile physics, card ownership/charges and enemy rules are unchanged. `castSequence` is a transient successful-cast receipt, explicitly absent from serialized state; it does not affect RNG or game decisions. Assistance preference is an optional validated boolean in the existing UI settings record; absent or invalid values default off.

Target selection is read-only and uses the existing finite enemy catalog, active-region checks and solid-cell line of sight. All three rendering quality levels and automatic fallback remain. No new assets, service, resource, permission or production route is introduced.

## Verification scope

New ordinary-input acceptance uses a single real CDP touch point, actual quickslot drags, natural floor mining and the seed's real first moth. It verifies actual enemy HP loss from both starter wands, movement/floating to evade, safe limited ammunition, and no intervening workshop or upper-screen controls during the combat sequence. Both 393-right and 320-left routes are required; the additional reach/cancel matrix covers both hands at both widths. Video and receipts are retained. The explicit setter-free canvas.combatSnapshot getter makes detached copies only when read, avoiding periodic diagnostic DOM updates. Its read-only combat receipt contains at most 16 active enemies within 100 cells and 24 player projectiles; absence from this local sample is not a kill. Hit assertions require explicit HP loss or an increased kill count.

Unit/independent checks cover pending cooldown/mana, one-cast completion, rearming, tap/cancel safety, manual precedence, no assisted fire for hazardous decks, LOS/range/screen restrictions and unchanged save/physics state. Existing PC, two-hand, crafting, water-flow, distant traversal and old expedition routes remain gates.

A scripted one-pointer success is not a claim of comfortable human ergonomics. Real-hand use, Safari and device-specific FPS/thermal behavior remain unverified. The exact final CI, visual/independent review and served manifest must pass before this candidate replaces the stable preview.
