# Connected world, portrait controls and material lighting

This follow-up responds to the 2026-10-11 request for a connected open world, survival-oriented UI, portrait phone play and stronger lighting. The last accepted public baseline before this candidate is `0fe75af9`.

## Candidate architecture (acceptance pending)

- A finite 1536×768 cellular world, partitioned into 32×32 chunks. The maximum active physics window is 7×7 chunks (50,176 cells). The world is connected in ordinary world coordinates; crossing a region is not a portal or a new run.
- Inactive matter remains stored and is paused rather than discarded. Reactions and motion at the active edge must not transfer matter into a region that is inconsistently updated. Internal chunk seams are ordinary adjacent cells.
- Existing survival saves retain edited terrain, resources, equipment and actor state. Only specified immutable former outer-wall openings may change when expanding the old world; original save bytes and recovery copies remain protected. Expedition saves and dimensions remain isolated.
- Compact status/materials, reachable tools, organized crafting/inventory/equipment/settings, independent aim and use, and simultaneous movement/levitation/work on portrait touch. Desktop controls remain supported.
- Material-aware 2D lighting with explicit roughness/metalness and estimated normals, occluded scattering, emitter bloom and low/balanced/high quality modes. These are 2D approximations, not a claim of a full 3D physically based renderer.

## Required evidence before publication

1. Nonreactive sand/water conservation across internal and active-region boundaries; dormant matter survives departure, return and save/reload.
2. Ordinary PC/touch travel to a distant region and back, preserving a visible mined/placed change; distant save/resume and camp return.
3. Existing mining/crafting/death/recovery, reservoir engineering, equipment recovery and legacy compatibility routes remain accepted.
4. Touch aim alone does not destroy terrain. Move, aim, use and flight can coexist; cancellation, blur and rotation release every action. Controls remain at least 48px and avoid safe-area overlaps.
5. Actual identical-scene images with material lighting, scattering and bloom switched on/off through settings; readable character/terrain/UI at each quality. Report measured work budgets and frame progress separately from unmeasured real-phone FPS.
6. Strict type/unit/build checks, independent review, exact-head CI and same existing version-preview publication with served SHA and production unchanged.

## Explicit limits

Finite dimensions and active-radius simulation are deliberate mobile budgets. Distant water/fire does not continue advancing in real time. No promise of infinite world generation, perfect global conservation across intentional reactions, full Noita/Terraria content, true volumetric 3D transport or handset-specific performance is made. Exact implementation details and test results must replace candidate assumptions before release.

## Implementation details

The map contains 48×24 = 1152 chunks. Cells/lifetimes are retained in a fixed world; this is not disk streaming or infinite generation. Only the active 7×7 region advances powder/liquid/gas/reaction state. Both ends of movement, density swaps and reactions must be active. Enemies and their attack timers pause outside it. A projectile freezes before its movement/contact/blast envelope crosses the boundary. At the 128-projectile cap a new local shot can remove the oldest dormant projectile without exploding it; this explicit temporary-object rule does not delete terrain matter.

Legacy survival expansion opens only former immutable HardRock cells at x253–255/y8–33, x253–255/y338–363 and x240–251/y380–383. Existing editable cells/lifetimes and actor/equipment coordinates remain. Load does not write. The first explicit v2 save additionally archives the old primary and backup as `emberfall-survival-original-v1` and `emberfall-survival-original-backup-v1`. The regular save keys and nested world RLE location remain compatible with diagnostics. A 4,000,000-character serialized budget and actual storage errors reject saving while retaining the last valid primary. Storage limits depend on the browser; this budget is not a promise that all highly fragmented maps fit.

Material lighting linearizes albedo and uses per-material roughness, metalness, F0 and relief. Neighbour gradients estimate terrain normals; liquids have animated height normals. Cook–Torrance GGX, Schlick Fresnel and Smith-Schlick geometry produce diffuse/specular response. The view faces the 2D sheet and lights have an artistic 18-cell height. Occluded rays integrate Beer–Lambert extinction through air, smoke, steam and liquid, with thin single-scattering and phase g=0.18. Emitter bloom is independently switchable. This does not implement 3D geometry, IBL, multiple scattering or radiometrically calibrated HDR.

Sources: [Filament's physically based rendering model](https://google.github.io/filament/Filament.md.html), [PBRT volume transmittance](https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance).

Low/balanced/high cap lights at 4/5/7 and rays at 2048/4096/6144, updating lighting at 8/10/12 Hz. Six slow lighting updates (>9ms balanced, >12ms high) lower effective quality; explicit user selection resets the governor. Canvas-effect allocation failure keeps basic rendering playable. Terrain buffers cover only the viewport plus margin, not the full world; emitter search also stays local. CI receipts report requested/effective quality, work counts and frame progress. CPU unit timings are not real-phone FPS.
