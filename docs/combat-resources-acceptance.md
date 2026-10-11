# PR4 combat resource acceptance

2026-10-05. Covers B02, B07, B09 and the resource portion of U01. This is a bounded original combat implementation, not the original game's full spell/class system.

## Rules

- Heavy: real key, touch or controller press begins a visible charge, ready at 0.45 seconds and bounded at 1.5 seconds. Release commits the ordinary overhead attack. Short release, pause, blur and lost/cancelled touch discard the charge. Charge and release share the overhead curve with no pose jump. Direct Core heavy and focused-button Enter/Space are retained for accessibility.
- Magic: each actor owns 100 finite mana. A spell reserves 20 mana and 18 stamina at start; effect occurs after 0.45 seconds with a 0.7-second total action interval. Current aim, range 7m, SDF cover, protected actors and guest edit permission are checked at resolution. A miss or interruption does not refund the resource. Physical hits, dodging, death, pause and disconnect cancel. Burning alone permits a water spell for self-extinguishing.
- Recovery: handcraft one mana-draught from 2 grass and 1 stone, carry at most 20, use from inventory to restore up to 60 mana. Full mana and active actions reject consumption; full inventory rejects crafting without material loss. No regeneration, death refill or debug grant.
- Focus: real confirmed contacts accumulate separately for host and guest. Vigor rank 1, earned from the existing point budget, unlocks the attack with an equipped sword, greatsword or dagger. Unsupported weapons and locked skills preserve the meter. The existing area strike still checks solid cover and consumes 100 only on activation.
- Persistence: optional combat records are validated strictly; legacy data defaults to 100 mana, no pending input and zero focus. Spent mana persists. Loading a save never resumes a held input or delayed spell. Authoritative guest frames carry the guest's own resources; world snapshots preserve local actor resources until the actor frame arrives.

## Evidence

`tests/unit/combat-resources.test.ts` covers charge/release and pose continuity, no early hit or resource spend, delayed effects, cancellation, newly inserted SDF cover, actual projectile interruption, finite crafting/consumption, full inventory, unlock/weapon gates, guest permission loss, independent actors, save migration and corrupt frame rejection. `gamepad-input.test.ts` exercises keyboard, touch and controller adapters, pause/blur/cancel and accessible button activation.

The normal fresh-start bow/staff route uses actual harvesting, crafting, cast costs and real enemy material contacts through the first core boss. Regional and western drivers acquire their unlock and craft finite recovery before using the changed mechanics. No route sets player health, enemy health or damage to pass.

`campaign-combat-resources.spec.ts` defines two cases each for desktop Chromium and Android Chromium: held-charge release/cancel, and finite-mana magic with its recovery recipe. Existing harvest and overhead browser drivers now hold the actual input until the HUD indicates readiness. Playwright lists all four new cases.

Browser execution is not claimed locally: the shared environment's Chromium launch has a verified EPERM restriction. Parent release validation must run the relevant desktop/Android cases against the integrated commit. Emulation is not Android-device or Safari-device acceptance.

## Q03 real browser build routes

`tests/e2e/campaign-combat-builds.spec.ts` adds four independently isolated fresh-game cases: bow and staff on Desktop Chromium and Android Chromium. Existing `campaign-progression.spec.ts` remains the melee first-chapter route. The new routes use the same PlayerControls harvesting, walking, inventory, equipment and interaction helpers. They do not inject saves, items, health, coordinates, enemy state, action calls, or game time.

Both new routes gather at least wood 24, stone 24 and grass 48, spending wood 8/stone 6 at the real hearth. The bow is hand-crafted and starts with 32 crafted arrows. The staff is hand-crafted and starts with 12 crafted mana-draughts. The finite spawn plants are supplemented by actual tree-leaf harvesting along the existing open perimeter. Every recipe checks its material debit and output count; no spare supply appears during combat. Two cooked meals and two crafted bandages use that same budget. The bandages and hide coat are crafted after physically rescuing the artisan. The route proves the forge recipe changed from locked to available, learns vigor rank 1 with an earned point and asserts the point debit.

The entrance lure must finish within the existing 0.18m waypoint tolerance of z=1.6 and leave the warden unaware until the entrance guard dies. The real desktop trace previously overshot a 1.6m move to z=0.421. Shared walking now uses guarded/limited-analog motion below 2.25m and starts braking long legs 1.2m early, retaining the original five correction attempts, strict final tolerance and movement timeouts.

Counters use held shield input and newly observed enemy recovery; touch look gestures retain the shield finger. Bow attacks spend exactly one actual arrow. Staff inputs spend exactly 20 mana, switch water/lightning through the actual element button/key, and consume a previously crafted dose from the inventory only when mana is insufficient. A read-only listener retains evidence of the real transient cast phase. Final assertions require both enemies dead, the warden core actually awarded, zero deaths, the chosen weapon still equipped, and exact total arrow/mana/dose accounting. Checkpoints and a final screenshot are attached to each test result.

Verification here: TypeScript and Playwright definition listing only. The existing first-chapter 1800000ms budget and existing input tolerances/timeouts are retained. These definitions are not successful browser runs. Chromium remains blocked locally by the already verified EPERM; the parent must execute the exact integrated SHA on desktop and Android CI before Q03/B21 can be marked as browser accepted.

Each new build case captures stable named images at naturally reached scenes: `01-fresh-start`, `02-forest-gathering`, `03-equipped-hearth`, `04-guarded-crypt-combat`, `05-warden-combat` and `06-core-boss-defeated`, prefixed with `bow-` or `staff-`. The combat image is taken with the real shield held, before observing a fresh counter opening. These are captures for the pending CI run, not already-created local evidence or a claimed historical before/after comparison.
