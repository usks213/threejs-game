# 薄響の封庫: W10 bounded dungeon acceptance

## Implemented slice

An original optional one-room seal-vault southeast of the starter hub. Read the sign at `(6.5, 9)`, enter through the real open arch at `(8.5, 10.5)`, mine the stone covering the key at `(6.5, 11.5)`, and take the key behind it. Observe the three raised teeth on the grate: every six seconds they rise for 1.2 seconds before one 22-point pulse. The white east lane at `x=10` remains safe. Its first lever permanently disarms the trap; its second keyed switch consumes the key and lifts the physical gate. The inner chest grants one non-consumable 薄響の封章 and 40 XP. Walk back through the same entrance.

The room has solid walls, a roof, a bounded floor, actual targetable objects and a return path. Collision, targeting and world meshes continue to use the same SDF. The warning changes shape as well as color; the aim label explains the timing and safe lane. The journal gives the entry coordinates and live objective state. The optional slice needs no initial resources, profession, flame tier or equipment grant. The original starter chisel can expose the key. A player may avoid the trap without operating its brake.

This is not a new campaign boss, procedural dungeon, combat arena, large labyrinth, or a dedicated resting place. Those broader combinations remain outside this slice. The existing crypt and region combat are unchanged.

## Compatibility and authority

- Runtime `vault-*` object layers are installed **after** the legacy baseline is frozen. No v2/v3/v4 terrain author, provider manifest, baseline fingerprint or roster changes.
- Optional `CampaignSave.dungeon` stores one versioned dependency-checked ledger. The item ledger, world objects, terrain, homestead storage and dungeon are staged together before any live commit.
- Every protected layer sample is checked against the closed/open canonical room, including material and coordinates. Only the finite key-cover rock may deplete its own original samples. Missing/forged gate or shell samples fail validation. Claimed/open object flags must agree. Key and reward totals are checked across carried and stored items; keys are consumed only at the switch, and rewards have one claim.
- Old saves without this extension remain readable. A clean legacy footprint receives the additive room without altering other edits. Any edited sample/tombstone in its safety envelope, reserved-layer collision, or saved actor intersecting its new solid geometry prevents installation. Existing construction/actors remain unchanged; the journal explains the omitted addition. No old terrain is silently flattened or reseeded.
- v2→v3→v4 migration copies the runtime layers/ledger unchanged through the existing certified baseline and archive path.
- Disallowed/dead/distant/occluded actors cannot claim or operate controls. A guest needs the host's existing world-edit permission; granted interactions run on the host's single shared ledger. Reapplying a shared checkpoint never awards anything. An older host snapshot without the extension is mirrored without installing client-only geometry. Death retains the key/seal; reconnect does not reset claims.
- The trap uses the saved authoritative simulation clock. It deals one bounded pulse at each clock edge, never every render frame; 30 and 120 Hz agree. No damage through a covering solid floor or above the teeth. Host and connected companion have separate HP damage. Offline companions remain suspended.
- Two fixed instanced cue meshes own and dispose their geometries/materials. The room adds no enemies, network actor slots, unbounded particles or ongoing background timers.

## Acceptance evidence

- `echo-vault-normal-play.test.ts`: fresh zero inventory → ordinary production walk/look/chisel strikes → key → safe lane/brake → switch/physical gate → unique reward → original start → save/reload. No HP, resource, position, gear or clock grants in this acceptance route.
- `echo-vault.test.ts`: prerequisites, collision, finite claims, denied/dead/occluded/out-of-range interactions, storage behavior, phase timing, bounded pulses, solid cover, full-layer integrity, and legacy collision checks. These focused fixtures may set positions/state to exercise negative boundaries; they are not counted as normal-play proof.
- `echo-vault-runtime.test.ts`: legacy compatibility, actor/build conflict preservation, bounded geometry size, transaction rollback, death and guest permissions, shared snapshot replay, pulse/reload behavior, v2→v3→v4 migration and Three.js cue disposal.
- `tests/e2e/echo-vault.spec.ts`: real desktop keyboard-look/actions and Android CDP touch gestures for the same route, warning/reward screenshots, repeated reward interaction, exit, menu save and reload. Probe access is read-only. No save seeding, injected inputs, state mutation, teleport or resource grants.

Local final typecheck, full unit suite, production build and Playwright discovery are recorded below after completion. Browser execution is intentionally **not claimed**: local Chromium launch is blocked by the already verified socket EPERM environment restriction. The exact integrated commit must pass the PC/Android cases on GitHub and the preview SHA must be verified separately by the release coordinator.

### Local checkpoint, 2026-10-05

- `npm run typecheck`: PASS on final fixed source.
- `npm run test`: **104 files, 872/872 tests PASS**, 306.83 seconds. This includes 22 new vault cases: 10 rule cases, 11 runtime cases, and the ungifted normal-play route. The preexisting session corruption/registry tests also pass.
- `npm run build`: PASS, 108 modules. Vite retains its bundle-size advisory (main bundle 1,059.26 kB / gzip 311.76 kB); this is not a measured device-FPS claim.
- `npm run e2e -- --list`: PASS, **62 cases in 19 files**, including the new PC and Android vault route.
- `git diff --check`: PASS. No frozen provider/manifest files, protocol roster, or dependency lockfile changed.
- Browser execution, rendered screenshots, integrated-commit GitHub status and exact-SHA public preview verification: **pending release coordination**, not passed by local unit tests.

## 2026-10-05: actual mining and exposed-key regression

The Android candidate trace showed the old single-sample `dungeonCrustCleared` flag becoming true while the actual key aim still hit the crust. Production also rejected visible portions of the key when that unrelated sample remained. The key now requires both genuine depletion of at least one originally solid crust sample and a freshly validated ray to the actual aimed key surface. Intact-crust walkarounds, blocked rays, absent key geometry and duplicate claims remain rejected. Claimed-key saves with wholly intact crust are rejected before commit; the frozen terrain and key/reward costs are unchanged.

The Core route mines with production actions from both the nominal approach and a trace-adjacent offset, then completes the gate/reward/exit/save route. Focused rule/runtime/Core checks pass (26 tests), as do TypeScript and build. The PC/Android definitions now require actual mining and actual key targeting, rather than a sentinel voxel; both definitions list successfully. Browser execution remains pending because local Chromium is known to fail with socket EPERM; no launch retry was made. The release integration owns the full aggregate rerun and the shared transient-attack observer adaptation for slow CDP acknowledgements.
