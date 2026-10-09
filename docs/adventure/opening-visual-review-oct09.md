# Opening composition: 9 October 2026

## Observed baseline

Exact commit `460db6ab` / [CI 37907670069](https://github.com/usks213/threejs-game/actions/runs/37907670069) produced both default direct-field and explicit mesh/HDR images. The WebKit fixed-medium and Android first-construction images show a nearly white sky, a very uniform green foreground and a small first beacon partly obscured by the avatar and routine notices. These are software-browser images, not physical-phone FPS measurements or a ten-minute human play session.

Source inspection identified a concrete interaction mismatch: the generic runestone was drawn 1.7 m south of its authoritative node, while the tiny crystal crown and interaction box were centered on the node. The generic stone also disappeared when the beacon became active. The authored causeway had ordinary grass coloring, despite being described as a stone route.

The default direct-field path already bypasses the full HDR compositor and has no mesh grass. The separate `?terrain=mesh` path retains PBR, physical sky, IBL/SH, volumetric, exposure, bloom, shadows and SSR. This pass does not claim that those two paths are equivalent or silently switch rendering architecture. White distant-ground gaps in the baseline were captured while terrain uploads were still pending, and must not be mistaken for a proven permanent terrain hole.

## Bounded presentation changes

- A permanent five-piece beacon replaces the five small orbiting cubes. Its stone base, side supports, crown and suspended light all remain within the existing interaction box. It follows saved resource coordinates. An amber inactive core becomes turquoise when lit; the stone body stays present. Reduced-motion settings stop the light's animation.
- Only generator-4 beacon IDs skip the old generic runestone representation. Other stones and older worlds keep their existing appearance.
- Both terrain renderers share a render-only weathered-stone treatment for the existing causeway and restrained meadow color variation. The world density, generator version, saved edits, resource positions, collision and inventory are unchanged. Excavated surfaces below the authored road band do not inherit its stone overlay.
- Default direct daylight sky is calibrated before tone mapping without changing subject exposure, canonical IBL, full-HDR sky or night gain. Field fog is blended at the same output-space stage and view depth as Three's PBR fog.

The beacon reuses shared geometry/materials and the previous five-piece-per-beacon main-pass budget. No new lights or render targets are added. The solid pieces now cast shadows in the existing mesh/HDR path, a small added shadow cost that needs actual rendered verification.

## Evidence gates and remaining defects

Focused unit tests inspect beacon bounds, visible-model/authority targeting, inactive/lit state, saved coordinates and save preservation, resource suppression, shared terrain shader injection and sky-capture calibration. Mock/string tests do not prove GPU compilation or visual quality.

The new browser capture uses DPR 1 and the ordinary high-resolution setting at 750×342 and 844×390. It records the first controllable frame separately from subsequent streaming progress, along with graphics and terrain counters. Existing mesh/HDR acceptance separately checks shader errors, finite stage readbacks and all HDR feature stages. The normal-input fresh-world cache→two beams→manual glue→first beacon test remains the gameplay gate.

The unchanged gameplay loop passed on `fd57ccee` / [CI 37909610492](https://github.com/usks213/threejs-game/actions/runs/37909610492): native cache aim/pickup, two real beams, manual grab/glue, walking/aiming and first-beacon activation, followed by the ramp objective. Its screenshot shows wood 8 and the actual joined structure. The frozen presentation candidate passed all 1,080 non-socket tests in 221 files, typecheck and build. Exact-commit GPU screenshots and the first-beacon play recheck are still pending for this presentation change. The Android job budget is 15 minutes to include the two added fixed-DPR art cases alongside existing gameplay, HDR and direct-field checks; assertions and retries are unchanged. Routine notices can still cover the central destination. Distant streaming visibility, excessive touch-control density, full direct-mode HDR parity, four-player 30 Hz, physical-device performance and sustained combat/exploration enjoyment are not resolved by this small art pass.


## Published art evidence and bounded retry

`97da1c5a` / [CI 37911266811](https://github.com/usks213/threejs-game/actions/runs/37911266811) deployed successfully. WebKit, desktop controls and all six public co-op cases passed. Android passed 13 cases: mesh/HDR stage readback (all feature stages, no invalid pixels/shader errors), direct-field movement/mining/save/water-lighting, the native first-beacon loop, and the 750×342 DPR1/high capture. The 844×390 DPR1/high case failed at `page.screenshot` after its 20-second default action timeout; this remains a failed visual gate, not a pass.

Its failure evidence reported a live 844×390 WebGL buffer at scale 1, 16 submitted scene draws, worker tick 655, and no page/shader/worker errors. Software-browser RAF gaps reached approximately five seconds. The successful 750×342 high observation still had 1,213 terrain jobs pending and only 197 resident/uploaded bricks after roughly 71 seconds, so its image is explicitly labeled continued streaming. These measurements do not establish physical-phone FPS or a fully rendered far landscape. Distant trees over incomplete ground remain visible.

The unchanged WebKit fixed-medium camera/viewport shows a less washed-out sky and a clearly larger centered beacon. The native lit-beacon image retains its stone body and lit core alongside the joined construction and next-ramp objective. The initial walking notice still obscures the beacon and the compact goal's one-line hint is truncated; those two concrete HUD defects are the next repair.

The next capture attempt allows 60 seconds only for screenshot acquisition, retaining the 240-second case deadline, actual drawing-buffer checks, all input/readiness/error assertions and latency evidence. Android review builds now set and assert the PR head explicitly: the previous job checked out `97da1c5a` but its build label inherited the synthetic PR merge SHA `84997eee`; published preview/WebKit used the correct verified head artifact. No rendering-quality or performance criterion is weakened by correcting that metadata.

The automatic four-client measurement on `97da1c5a` reported 13.65 Hz against 30 Hz, with zero functional failures. It remains below target, not a performance acceptance. Controlled authority profiling is being used to choose the next optimization rather than attributing separate cloud-run variation to the art changes.

The HUD retry suppresses only an unchanged explicit sprint mode notice. Real walk/run/sneak transitions and the authority receipt/save/ACK path remain intact. Compact objectives gain four pixels (52px total), with two genuine hint lines at the same width and bottom anchor. The actual fresh objective now has strict horizontal/vertical scroll-dimension assertions, including landscape and rotated portrait; arbitrarily long journal entries retain their existing ellipsis policy. Rendered post-change evidence is still pending.
