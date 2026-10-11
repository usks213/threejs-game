# Finite soil fill and leveling

2026-10-05, PR4 H04 / I04. A bounded extension of the crafted rake, rather than a new building catalog or a change to the frozen world providers.

## Play controls

1. Gather wood 4 and stone 2; craft and select the rake through Inventory. The initial mode still cuts only the high soil/grass samples under the real shaft sweep.
2. Light a hearth. Gather actual soil from original ground and approach the dropped chunks to collect them.
3. With the rake selected, F / the visible touch mode button / the controller’s mapped “属性/熊手モード切替” action switches between cutting and soil fill. Default standard-pad mapping is Y / triangle. The mode remains independent for each cooperative actor.
4. In fill mode, aim at visible supported ground within 3m. A green/red box and the HUD show the exact tile bounds, plane height, cost and rejection reason. Attack or Build adds one tile, only after validation succeeds. The cost is nine owned soil units; a successful operation wears the rake once. Failed operations spend neither soil nor durability. A broken rake must be repaired.
5. The tile is 0.75m square and 0.5m deep, with a quarter-meter-aligned top one step above the aimed surface. Its lower portion may overlap original soil. This makes a walkable quarter-meter step on level ground, or restores a shallow excavated patch to the neighboring plane. Every quarter-meter column needs ground support. This is not an arbitrary brush, free terrain creation, or deep-void bridge.
6. Strong attack / Dismantle removes the aimed owned tile. X / the mapped special action undoes the most recent unchanged tile. G / the cast action leaves fill mode. Touch attack/strong-attack labels change to “盛土” / “盛土撤去”. Controller mode and removal bindings are named in Settings and remain remappable.

## Resource and geometry rules

- Each tile is a separate `build:soil:` SDF layer. Rendering, ray contact and collision read the same sampled field. Removing the tile reveals the existing terrain; it never replaces the original samples, buildings, storage ledger or world manifest.
- Mining filled soil yields zero material. Only a fully intact owned layer refunds its original nine soil units on removal, once. Even partial durability damage makes that tile nonrefundable. Signatures do not accidentally count concealed original terrain: pristine checks read the entire owned layer, including overlapped samples.
- Digging original terrain under a paid tile still depletes those original samples once. Exposing previously hidden paid samples cannot create drops. Saving/reloading does not renew a refund or an undo operation.
- Placement rejects player/companion bodies (including a retained disconnected companion), living enemies, visible NPCs and the full physical animal length. It also rejects protected quest/dungeon layers, including those hidden beneath composed terrain, other building layers, non-soil solids, lack of support, blocked sight, out-of-range/bounds/claim areas and insufficient material. Existing construction permissions and the active hearth radius apply. A tile supporting another solid or occupied by a body cannot be dismantled.
- The current shared world/inventory remains host authoritative. Guests send existing actions; the host rechecks permissions and resources. The new per-actor mode travels in validated companion state. The combined release uses relay protocol 4; both clients must reload.
- Successful gameplay edits immediately refresh solid-water exclusion through the existing revision path; the finite-volume solver displaces enclosed water on its next step without generating or deleting it.
- At most 64 simultaneous tiles. The optional soil save state includes bounded IDs, quarter-meter coordinates and the fixed paid cost. Before any campaign restore commits, each new layer must correspond to exactly one ledger tile and contain only canonical samples or monotonically depleted/removal samples. Untracked, expanded, deepened, wrong-material and malformed soil geometry is rejected atomically. Legacy saves without soil state remain valid. No v2/v3/v4 authoring or manifest was changed.

## Evidence

- `tests/unit/soil-fill.test.ts`: 17 focused cases covering finite spend/refund, duplicate removal, pristine versus partial damage, original-overlap/reload resource accounting, shallow-pit leveling, body/support/build/protected-layer rejection, occluded ground, partial-write rollback, water displacement, matching rendered preview, malformed geometry/state, legacy save acceptance, failed-restore atomicity and per-actor permission/mode isolation.
- `tests/unit/soil-normal-play.test.ts`: one zero-grant, production Core route. Starts with no materials; gathers wood/stone/soil, lights the hearth, crafts/selects the rake, fills, validates saved collision, walks up the actual step, removes it and reloads. No test helper grants materials, teleports, invokes private damage, or writes world geometry in this route.
- `tests/unit/gamepad-input.test.ts`: three additional keyboard, touch-pointer and standard-gamepad adapter cases feed the same Core action transaction. They cover mode switching, a single paid fill, held-edge non-repetition and controller disconnect; the existing input/rebinding tests remain.
- `tests/e2e/campaign-soil-fill.spec.ts`: four discovered desktop/Android cases: zero-grant keyboard/touch fill/walk/remove/reload, and recipe/controller-label visibility. These are definitions, not browser acceptance results. No local Chromium retry was made because this environment's socket EPERM blocker is already established. Exact-commit CI and public-preview browser play/screenshots remain required. Physical controllers, phones and Safari are not claimed as tested.

## Local verification

- Focused soil/normal-play tests and the three added actual-input adapter cases passed.
- TypeScript and production build passed during implementation. Build retains the existing large-chunk warning.
- `npm run e2e -- --list tests/e2e/campaign-soil-fill.spec.ts`: four cases discovered.
- Final frozen-source `npm run test`: **114 files, 960 tests passed**, 360.96 seconds.
- Final `npm run typecheck`: passed. Final `npm run build`: passed, existing large-chunk warning only.
- `git diff --check`: passed. Exact-commit deployment, desktop/Android browser execution and screenshots are still pending integration.
