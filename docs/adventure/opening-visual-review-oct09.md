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
