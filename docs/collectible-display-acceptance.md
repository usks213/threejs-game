# Paid collectible and equipment display

2026-10-05, PR4. H16/I15 now have a bounded original-game display loop. This is one fixed pedestal with real earned items, not a complete cosmetic catalog.

## Playable loop

- Gather wood and stone, light the starter hearth, then choose **拠点生活 → 記念展示台を設置** within 4m of the hearth. Wood 4 and stone 3 buy one stand at (−1, 2.5), northeast of the hearth. Construction checks ground support, existing solids, and people/animal occupancy before payment.
- The menu lists owned eligible items. Unequip a weapon, armor piece, shield or gathering/building tool before depositing it. Herb plants, regional specialty materials, lore records and the earned Echo Vault seal can also be displayed. No item or discovery is granted by opening the menu or building the stand.
- Deposit moves one actual item from carried inventory into the existing home storage ledger. That one storage unit is reserved for the display, so ordinary storage withdrawal cannot take it. The display is a protected, collidable SDF layer and is named in the aiming HUD. A blade/tool, armor form, herb planter, document or mineral/seal appears according to the selected item. These are original coarse SDF representations; they do not replace the equipment worn on the player.
- Equipment is unavailable for equip, repair, salvage or duplicate crafting while displayed. The existing wear, upgrade and socket remain in escrow. Displaying equipment grants no combat statistics. Retrieving it returns that exact state, once.
- The stand holds one item. Retrieve it before replacing it or dismantling the stand. Retrieval needs inventory room; failure leaves the display intact. Empty-stand removal refunds the original wood 4/stone 3 once. Protected display geometry yields no mining drops and cannot be damaged to mint extra refunds.
- Keys, progression cores and regional unlock seals are deliberately excluded. The Echo Vault completion seal remains counted in inventory plus storage by its existing unique-claim validator; displaying it cannot grant a second reward or block a future quest step.

## Persistence and cooperation

- Optional `display` state carries `{version, built, item, gear}`. Old saves without that state load as no stand. The frozen v2/v3/v4 terrain authors and manifests are unchanged.
- Save import/restore validates the full paid geometry, its selected item, reserved storage count and equipment escrow before committing any component. Missing/unowned geometry, extra or changed samples, missing reserved stock, duplicated equipment and invalid gear are rejected atomically. Reload never regenerates furniture or grants an item.
- Equipment still occupies its one ownership slot while stored. `CampaignSystem.externalItemCount` is bound to home storage for crafting; `HomesteadSystem.reservedItemCount` prevents general withdrawal of the displayed unit. Other item-storage UI should show that reserved unit separately from withdrawable stock.
- Production menu commands run on the host. Guests require the existing explicit edit permission, and the Core command checks that permission independently of the network/UI check. The optional state and SDF are included in the shared campaign snapshot. Integration must advance the relay protocol together with other new snapshot fields, since older code cannot safely preserve the reserved display unit.

## Evidence

- `tests/unit/collectible-display.test.ts`: payment/refund conservation, real SDF obstruction and mining protection, reserved storage, repeated deposit/withdraw, equipped refusal, escrowed wear/upgrade/gem, blocked duplicate craft/equip/salvage, capacity/location/death failures, denied/allowed guest commands, save/reload, legacy absence, malformed geometry and state, unique vault ownership, and menu status.
- `tests/unit/collectible-display-normal-play.test.ts`: starts with zero materials and uses only production look/movement/action/menu transactions. It mines wood/stone, lights the hearth, crafts a dagger, pays for the stand, deposits the dagger, aims at its SDF, saves, restores, retrieves and recovers the empty-stand cost.
- `tests/e2e/campaign-collectible-display.spec.ts`: four discovered desktop/Android cases. The real-input route follows the same earned-material loop, checks paid costs and display geometry, saves/reloads through the menu, retrieves once and refunds the stand. It requests screenshots before retrieval and after refund. Both existing equipment CI groups include the new file.
- Aggregate local `npm run test`: 126 files / 1,072 tests passed in 617.45 seconds. The final courtyard camera route and validation-order adjustment were additionally checked with the 11 display tests, followed by successful typecheck and production build. The 20 existing home/presenter checks also passed in the earlier focused run. Existing large-bundle warning remains.
- Browser definitions and discovery are not browser acceptance. Known local Chromium socket EPERM prevents local browser execution; no repeated launch attempt or workaround was made. Exact-commit CI execution and screenshot review remain pending. Android emulation does not certify physical Android/iPhone performance.

The category is implemented at this game's finite scope. Arbitrary-position decoration, new outfits, instruments and fossils are not part of this display loop and are not claimed as implemented.
