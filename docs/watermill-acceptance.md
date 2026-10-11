# H14/H15: bounded waterwheel loom

## Implemented scope

One paid, host-operated fixed workstation sits inside the crypt beside the existing water valve, at approximately (3.5, 0.65, -1.4). The hearth must be lit. Assemble it from wood 8, stone 4 and metal 2; damaged frames cost wood 4 and stone 2 to repair. Each batch escrows grass 6 and yields cloth 2 after 8 powered seconds at rated flow. Existing manual homestead recipes remain unchanged. No artisan unlock, new resource catalogue or free starter grant is introduced.

The rotor consumes measured **gravity transfer**, in cubic metres, through two actual faces of the existing 48×12×48, 0.125 m local water solver. At every solver step, Core reads only those latest face transfers, once. Static depth, the valve boolean, rendering time and regional static lakes cannot advance a batch. Flow scales the work rate up to the rating of 5 L/s. Closing the existing valve leaves a brief, physically simulated falling-water tail, then the rotor and work stop. The system does not delete that remaining water to force an immediate stop.

No new sluice or outlet is included: existing water volume and the existing injected-volume ledger are preserved. The finite basin can fill; a full or obstructed basin stops production. This is not global fluid simulation or an infinite mill race. Place the frame only on the existing clear supported site. The rotor must have clear space; a solid, actor or animal in the sweep stops work. The paid frame has SDF collision, can be damaged, and produces no mined-resource refund. Repair checks support, other solids and bodies before changing either geometry or inventory. No dismantle refund or cancellation refund exists.

The menu exposes location, build/repair/input cost, measured flow, remaining powered seconds and the blocking reason. Fixed GPU geometry follows the hydraulic angle and is disposed with the view; rotating the wheel never remeshes the terrain. The optional `watermill` save module owns exactly one job. Restore validates it and its bounded geometry before committing other state; absent legacy state stays unbuilt. Damaged geometry stays damaged. Guest requests cannot build, repair, start or claim, even with ordinary building permission. The host owns simulation, and reconnect does not create a second job.

## Verification

Local checkpoint checks passed on 2026-10-05: TypeScript, all 116 unit/Core test files (950 tests), production build, and diff whitespace checks. The focused watermill set is 11 tests across four files. Build retains the existing large-chunk warning. Both exact CI grep selections list two cases each; this is definition coverage, not execution.

- Rule tests: actual flow versus static/full/stopped water, repeated-step consumption, rotor/intake obstruction, actor blockage, finite payment/escrow/output and repeated claim, repair, failed-operation atomicity, SDF collision and no salvage, injected/displaced mass accounting, unknown/nonfinite/corrupted state, orphan/out-of-bounds geometry, old saves, restore atomicity and guest/reconnect boundaries.
- A zero-grant Core route uses only production movement, aimed chisel strikes, nearby collection, menu transactions, guarded combat and the actual water-valve interaction. It gathers, lights the hearth, clears the crypt, builds, starts, stops/resumes, claims once and restores both in-progress and completed checkpoints without duplicate output.
- Renderer unit test checks flow-owned angle, no field revision/remesh change, fixed geometry and exactly-once disposal.
- `tests/e2e/watermill.spec.ts` defines menu/reopening and full normal-play lifecycle cases for desktop Chromium and Android-equivalent Chromium, four definitions total. Observation is read-only; no state grants, teleports, clock forcing, direct private calls or storage seeding.
- Browser execution is **pending**. The parent established local Chromium socket EPERM before this work; no prohibited launch retry was made. Listing definitions is not a browser pass. Actual PC/Android gameplay, appearance, mobile performance and screenshot acceptance must run on the published candidate or supported CI. Android emulation does not replace physical-device testing.

## Release handling

The combined release uses relay protocol 4 and requires both clients to reload. Frozen terrain providers/manifests remain unchanged; public browser acceptance is recorded separately. Existing hand-written production timers, initial water layout and existing valve injection remain intact.
