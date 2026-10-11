# 燐の底 / Emberfall

Original-content falling-sand magic roguelike, isolated from PR #4/#5 and based on verified main `fe54d7da0379cfd07b0a349c8d8f514dcf9a8e1a`.

## Current playable scope

Three seeded descending caves, 13 material IDs (including air), ten spell definitions, two starting wands, three ordinary enemy behaviors plus one final guardian, six selectable perks, gold mining and enemy loot, two safe refuges, shop/unlock and wand editing, water spray, status hazards, death/restart and final-gate victory. All names, text, map generation and pixel drawing are original. The app is Canvas 2D, not a texture pretending to be a cellular world. No Noita assets, audio, maps or wiki prose are copied.

This is a limited implementation, **not a complete Noita reproduction**. Catalog breadth, world breadth and many interactions remain missing. Ten spell definitions do not mean ten normally obtainable spells: `pebble` and the shuffled third wand are currently engine/test content, not available in the normal run. Shops unlock spell types with reusable slots rather than finite individual spell-card inventory. See [coverage.md](coverage.md).

## Play

- Desktop: A/D or arrows move; W/Space levitates; mouse aims and held primary pointer fires; 1/2 select wand; F sprays water; E enters a nearby gate; Tab opens equipment; Escape pauses/resumes.
- Touch: left pad moves; right circle aims and fires simultaneously; ↑ uses flight fuel; water button sprays. Multiple Pointer Events are captured independently. Pointer cancellation, rotation, blur and hidden-page events release input.
- The blue outlined gate is at the bottom right of each cave. Water extinguishes the player and fills the bottle; oil, poison, lava, enemies and the player's own explosions are dangerous. Touching dry ground restores flight fuel.
- A refuge restores health, ammo and bottle. Choose one free perk, spend collected gold, and arrange spells left-to-right before descending. The last gate is blocked while the guardian lives.
- Every eight seconds and on pause/transition, save the full mutable world and run. Death is saved as death. A validated backup can recover from a corrupt primary record. Storage failures are displayed; the live run stays available when 'save and title' fails.

## Architecture

- `materials.ts`: seeded cellular arrays, in-place swaps, density, reactions and 16×16 dirty render chunks; no DOM.
- `generation.ts`: seeded connected caves, material pockets, enemies and portal locations; no DOM.
- `wands.ts`: bounded deterministic deck evaluation, mana, cast delay, recharge, modifiers, multicast, nested impact payload and limited charges; no DOM.
- `simulation.ts`: fixed-dt actor collision, combat, material hazards, pickups, shop/perks and run transitions; no DOM.
- `save.ts`: bounded schema/checksum, RLE cell/lifetime arrays, last-valid backup and failure reporting; no DOM.
- `input.ts`, `render.ts`, `app.ts`: pointer/keyboard mapping, original pixel art Canvas 2D, lifecycle and responsive Japanese UI.

Fixed 60Hz actor steps and 30Hz material steps, maximum five catch-up steps. Full finite 256×384 cell map remains simulated (no offscreen deletion). Color computation updates dirty 16×16 chunks, followed by one dirty-union image upload. Rendering uses one backing pixel per world cell (160 pixels wide in portrait, 240 in landscape), nearest-neighbor CSS scaling and a crisp DOM HUD; paused scenes are not redrawn continuously. Projectiles and visual particles have explicit caps (128 and 180); this is a finite scoped implementation, not an unbounded world. DPR ≤1.5. No network, accounts or new hosting resources are part of the game.

## Verification

Run `npm run typecheck`, `npm run test`, `npm run build`, `npm run e2e`. Browser tests produce title, cave, equipment and touch screenshots. Unit tests separately verify materials, wands, run gates/perks and saves; map-clearance checks are not proof of combat playability. Local browser execution is currently blocked by absent matching Playwright browser executable. CI browser results and images must be checked for the exact PR commit before calling the UI accepted. Android emulation is not a real phone/FPS measurement.

On this cloud CPU, the materials-only 256×384 test measured ~1.79 ms/tick for a cavern with 7,800 active particles and ~17.05 ms/tick for an entirely water-filled stress map. These are narrow CPU measurements, not phone FPS or whole-game frame time.

A deterministic input-only headless route (seed 3397) completed all three caves, both refuge decisions and the guardian in 70.22 simulated seconds: 22 kills, 270 gold, 63.225/125 HP. It never teleports or mutates health/world state. Five seeds reached the first refuge. This is rule-level automated play, not browser/phone acceptance. Reproduce with `EMBERFALL_ROUTE_TRACE=1 npm run test -- tests/unit/emberfall-route.test.ts --reporter=verbose --disableConsoleIntercept`.
