# Enshrouded technical-talk adaptation, 2026-10-11

## Goal and reference boundary

The requested graphics overhaul uses mechanisms explained by Keen Games at
Graphics Programming Conference 2025, implemented independently for this small
Three.js/WebGL2 game. This is not the Enshrouded renderer, its assets, or a claim
of equivalent AAA image quality, scale, performance, or visual acceptance.

Primary sources:

- [Mantler/Koenen: Water Simulation and Rendering in Enshrouded](https://static.graphicsprogrammingconference.com/public/2025/talks/water-simulation-rendering-in-enshrouded/Mantler-Koenen-water-simulation-rendering-in-enshrouded.pdf), especially pp.9–20,25–31,36–44.
- [Krause: The Fog Is Lifting: Volumetric Rendering in Enshrouded](https://static.graphicsprogrammingconference.com/public/2025/talks/the-fog-is-lifting-volumetric-rendering-enshrouded/Krause-the-fog-is-lifting-volumetric-rendering-enshrouded.pdf), especially pp.17–21,39–45,49–58,83.

The fog talk explicitly separates detailed voxel fog from low-frequency froxel
volumetrics. A single screen haze or distance FogExp2 is not that mechanism.
The water talk does not publish exact simulation flux equations or all SDF/LOD
heuristics; the browser implementation's numerical choices are our own.

## Implemented architecture

1. Render opaque surfaces to linear color and depth.
2. Copy both color and depth into a distinct surface target. Trace water's SDF
   inside surface-brick proxy bounds, sample the immutable opaque target for
   refraction/reflection and write actual water-hit depth. There is no framebuffer
   texture feedback loop.
3. Inject low-frequency ambient/point lighting and extinction into a 48×28×24
   logarithmic view froxel grid, stored as a bounded 2D atlas.
4. Independently sample a world-space fog-boundary signed-distance/density field.
   This is not the solid terrain collision SDF. Noise erodes its support;
   conservative empty-space advancement must never cross expanded noise.
5. March detailed fog with dual Henyey–Greenstein directional phase, terrain
   shadow-map visibility and four light-direction density samples for fog
   self-shadowing. Jointly integrate both media's extinction and radiance source
   per segment: T=exp(−sigmaT·ds), integral=(1−T)/sigmaT with its vacuum limit.
6. Depth-weighted half-resolution reconstruction, then final ACES/display output.
   High campaign quality retains exposure adaptation and restrained bloom.

Both the dungeon and default balanced campaign use the shared volumetric path.
Campaign hazardous fog uses existing gameplay zone bounds; the old curtain
meshes are disabled in these presets. Performance mode deliberately retains the
old low-cost surface/distance-fog fallback, and is not described as equivalent.
The dungeon's torch-light scattering has no directional-sun shadow term.

## Deliberate browser-scale differences and remaining work

- The fog field is a camera-snapped 48×16×48 byte-pair texture, 73,728 bytes,
  instead of Enshrouded's sparse bordered voxel tile hierarchy and GPU tile
  classification/indirect dispatch. It does not change terrain/gameplay data.
- Froxel source/extinction is recomputed each frame. There is no temporal history,
  motion reprojection, volumetric GI, volumetric shadow cache, or physically
  complete multiple scattering.
  No temporal-stability claim should be made from the existence of this pass.
- Joint per-segment integration is our numerical adaptation of combining media;
  it does not literally implement the talk's cumulative-froxel-difference method.
- The current half-resolution reconstruction uses linear-depth bilateral weights.
  The reference's max-depth downsample plus 3×3 dilation needs independent edge
  tests; thin foreground silhouettes remain an explicit visual acceptance item.
- Water retains the existing conserved finite-volume solver and save/network
  arrays. A derived padded byte SDF and active six-cell proxy bricks replace its
  surface presentation. This is a bounded basin, not a 10 km world octree with
  CPU/GPU versioned topology feedback and indirect LOD requests.
- Surface ripple amplitude/vertical velocity and the shoreline
  direction/inverse-distance/local-depth field are separate derived presentation
  state. Refraction, absorption, Fresnel and bounded screen-space reflection are
  real shader paths, with a simplified sky reflection fallback. There is no
  full underwater volume/caustic renderer yet. Regional authored water planes
  outside the solver basin remain legacy geometry.
- Renderable half-float targets require EXT_color_buffer_float. Without it the
  same bounded geometry/volume path uses byte color targets, explicitly reports
  hdr=false, and omits HDR-only exposure/bloom. Device-specific visual quality
  and framebuffer completeness must still be verified on GPU.

## Preservation and verification

No save key/schema, water volume ownership, network protocol, combat authority,
terrain collision, loot or persistent progression is changed by this rendering
work. Existing PR4 portal lights retain stable shader-count membership rather
than the failed visibility-count optimization. The unpublished zero-BRDF candidate
is preserved separately and is not included without its own GPU-parity evidence.
Dungeon physical rendering is capped at 1,280 pixels on the longer side and
921,600 pixels total to bound the added offscreen memory; this is a declared
quality budget, not a measured device-FPS claim.

Local tests cover analytic medium integration, froxel inverse mapping, fog field
bounds/rebuild budget, GPU-resource lifetime, render ordering, detached water
buffers, capability fallback and failure-state restoration. Water adds its own
SDF/ripple/presentation tests. These tests do not establish rendered appearance.

Acceptance must use this exact branch commit's GPU outputs, with screenshots of
opaque/fog/water views, finite pixel checks, shore/underwater/near-plane edges,
camera movement and repeated resize. Then run ordinary PC/Android-emulated
campaign/dungeon input and save/co-op regressions. Android emulation is not real
Android performance, and submitted draw timing is not GPU frame/presentation time.

Current local browser limitation: installed Chromium's normal launch fails with
socket EPERM in the managed environment. No security workaround was attempted.
GPU/visual validation remains pending CI; do not call the overhaul accepted from
typechecking, a successful build, or unit-test counts alone.
