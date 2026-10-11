# 0022: Sparse water surfaces and hybrid volumetric fog

## Scope and sources

PR5 adapts the same mechanisms as PR4 from the original 2025 Enshrouded presentations:
- [Water Simulation and Rendering](https://static.graphicsprogrammingconference.com/public/2025/talks/water-simulation-rendering-in-enshrouded/Mantler-Koenen-water-simulation-rendering-in-enshrouded.pdf), especially pp18–44.
- [The Fog Is Lifting](https://static.graphicsprogrammingconference.com/public/2025/talks/the-fog-is-lifting-volumetric-rendering-enshrouded/Krause-the-fog-is-lifting-volumetric-rendering-enshrouded.pdf), especially pp39–58.

This is an independently implemented, bounded WebGL2 adaptation, not engine/source parity. No source-game assets are used. Save, fluid simulation, terrain edits, authority, networking and generator versions are unchanged.

## Water

The existing latest-only water worker atomically returns an exact-height mesh for ice/thin films and a sparse display SDF for deeper cells. A representation switch cannot publish mismatched revisions. Exact packed-cell equality skips rebuilds when the visible state is unchanged. Deep-water aligned .5m/1m cells retain the original volume and bottom as read-only input. Films thinner than .26m, frozen cells and nonstandard alignment retain the old mesh rather than vanishing between texture samples.

Occupied 3m bricks have a padded 8×14×8 anisotropic sample lattice. The R8 narrow band is sampled through a bounded integer hash lookup, allowing rays, normals and medium integration to cross adjacent bricks. Up to8192 aligned visible cells imply at most8192 bricks; the atlas is at most128×224×256, within the WebGL2 minimum3D texture dimension. Remote water is not deleted or re-saved. One active result and one latest queued snapshot bound worker backlog.

Instanced padded proxy boxes sphere-trace the display field and write the actual hit depth. Refraction samples a distinct opaque color/depth target and rejects foreground taps. A bounded12-sample screen reflection uses a sky-color fallback. First-liquid-exit integration limits absorption rather than using distant terrain through an air gap. Rays starting inside the medium or whose near plane cuts the interface use a separate medium branch; an opaque floor before a free surface receives attenuation. A separate64² amplitude/velocity ripple field responds to player movement, with fixed-step damped waves and .035m maximum displacement. Fine normal detail and depth-derived shoreline foam are visual only.

### Deliberate limits

This is not the source game's octree, GPU fluid solver, full shoreline-distance field, current/target temporal interpolation or accumulated foam history. Occupied bricks rather than a strictly minimal surface-only atlas are retained. The sampled minimum of individual cell-box distances is not an exact distance to the exterior union; a3m solid block's side is biased inward by about .083m in the measured lattice case. A regression explicitly bounds that case below .11m. The terrain/collision/water volume itself is unchanged.96 trace steps and a64-step/6m first-exit march remain finite approximations, especially at grazing angles. Ice and shallow films use the prior surface path.

## Fog and HDR composition

Both mesh terrain and direct-field terrain now feed the same linear-HDR compositor. Order: opaque beauty/depth (existing SSR for compatible mesh terrain), copied color+depth, SDF water writing hit depth, hybrid volume, exposure, bloom, ACES/sRGB output, FXAA. Direct-field terrain still does not claim shadow/PBR parity with the mesh renderer. Existing extension gating reports unsupported HDR visibly.

Low-frequency lighting/extinction is injected into48×28×24 logarithmic-depth froxels. Localized shore/forest/cavern fog uses a separate48×16×48 world-space distance+density field, independent of terrain/collision density. The ray pass combines both media, dual HG phase, four sunward detail-fog samples, shadow visibility where available, and analytical per-segment transmittance. Bilateral reconstruction respects opaque and water depth. Fog is not also applied as a flat material tint. There is no temporal/checkerboard history or sparse-octree fog claim.

## Evidence and remaining acceptance

- Exact starting remote tree09ddf1aa14b8c7dcd81489d6109a8c48fa7e181a (PR5 head7ac7e112) reconstructed and all blobs verified; prior dirty work was preserved.
- Typecheck/build passed at integration checkpoints. Focused partial-fill, immutability, sparse budgets,8192-entry negative/collision lookup, atomic deep/thin/ice, existing water ownership and opening tests passed. Final counts are recorded in the delivery report.
- Initial full run:1134 passed,3 failed. Two interim water-API failures were corrected while retaining the old API's tests; the pre-existing40-second route-case timeout passed unchanged in isolated rerun. This is not a claim that the initial aggregate run passed.
- Synthetic8192-cell CPU bake: initially1487ms, squared-distance hot loop311ms in an earlier warmed sample; later samples under concurrent test load were569–784ms. These are worker-CPU measurements, not GPU frame rates. Async credit control bounds main-thread work, but visual water update latency remains a limitation.
- Local Chromium exits before opening a page with socket EPERM. GPU shader compilation, screenshots and actual mobile FPS are unverified locally. A dedicated dev-server GPU fixture and existing gameplay/HDR tests run in CI; never report them passed before their exact results exist.
- Existing co-op30Hz performance deficit and real-device FPS remain separate unresolved acceptance items. No main merge or new service/access is part of this change.

### GPU follow-up (2026-10-11)

The exact-head CI for `c27141de` passed 1151 unit tests, type/build, desktop and Android rendering fixtures, WebKit, desktop feedback and Android gameplay smoke. The public co-op visibility check exposed a measurement regression: real peers now render into HDR targets, while the old probe accepted only the default framebuffer. `3baa76ef` follows the actual beauty target and queries the completed water depth before fog/output, without loosening the original movement/visibility thresholds. Its technical GPU gate passed; public co-op then exposed that Three r180 rejects `renderBufferDirect` outside an active render context. The follow-up uses a dedicated non-writing query scene with shared torso geometry and its exact drawn world matrix, preserving the completed target depth and restoring renderer clearing. A real-GPU fixture now verifies both positive visibility and deliberate opaque occlusion with fresh asynchronous peer queries before the release gate, in addition to unit tests. Public co-op acceptance remains pending the corrected run.

Same-camera, frozen-time underwater variants in run38134386498 isolated dense moire to unresolved fine-wave normals and broad stepped bands to binary coarse SSR hits. The follow-up integrates normal waves over a ray-derived pixel footprint and brackets/refines SSR depth crossings with residual, self-hit, screen-edge and range confidence. Both effects remain enabled. Derivatives are captured before divergent ray tracing. The SSR loop remains bounded to12 coarse samples plus5 bisections and1 resampled secant correction. Final appearance and performance require the new exact-head screenshots; the diagnosis screenshots alone are not evidence that the fix passed. Public4-client load measured26.25Hz on `c27141de` and14.74Hz on `3baa76ef` against the30Hz target, still below acceptance, and is not an actual-device FPS result.

The `3baa76ef` Android gameplay run finished16passed/1failed: vertical-navigation reached the ramp targetXZ withy1.878m rather than>17m. That unchanged route assertion remains a separate open acceptance item; no route-test threshold or cadence-driver change is included in the rendering correction.
