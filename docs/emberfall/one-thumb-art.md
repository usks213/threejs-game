# One-thumb controls and original pixel art

This increment answers the 2026-10-12 request for one-handed phone play and stronger pixel graphics. The public release remains the previously verified build until this candidate passes input, image, performance and independent review gates.

## Controls

Phone play defaults to one-hand mode. Touch anywhere in the preferred-hand pad to establish its origin. The soft origin follows drags beyond a 48 CSS-pixel leash, using time-based easing. Travel mode steers horizontally and an upward drag levitates. Work mode aims from the character, with a visible world target away from the thumb. Leaving the 28% dead zone starts a 220 ms grace period, then the selected tool operates even while the direction changes. This is a timed grace period, not a stillness detector.

Mining and firing repeat while held. Placement attempts only once per displaced gesture, including failed attempts. Read the placement reason, release/recenter, and drag again to retry; holding does not spend multiple blocks. The lower workshop button, tool belt and inventory/equipment tabs provide ordinary touch access to crafting and held tools. The one-hand portrait workshop is a bottom sheet with lower tab/return actions and independently scrollable contents. Travel and work are explicit modes; simultaneous movement plus tool use requires the optional two-hand controls or desktop controls.

Lift, recenter, pointer cancellation, lost capture, blur, rotation, hidden page, menus and control changes release current input. Switching hand/mode/tool cannot transfer an old held contact into a new action. Right/left preference mirrors the pad and lower action cluster. Two-hand mode retains separate aim/use/move/flight controls.

The existing UI preference record is extended with validated layout and handedness fields. Missing/invalid fields default safely. No world-save schema, material rule, inventory or cellular update rule changes are made by this increment.

## Art changes and bounds

- Terrain: original fractured strata, clustered mineral variation, exposed-edge bevels, wood grain, granular sand/ore and distinct liquid surfaces/depths. Cell identity still drives collision and physical simulation.
- Background: bounded, deterministic three-tier parallax with six regional palettes and original root, ruin, mineral and fungi silhouettes. Twilight uses restrained irregular cloud/ridge layers rather than broad repeating shapes.
- Actors: copper hood and teal clothing, visible articulated boots and directional tool, walk/breathing/airborne animation and casting recoil. Enemy designs have distinct silhouettes and motion.
- Effects: bounded water rims/ripples, fire tongues/embers, smoke wisps and projectile accents. These sample visible cells without consuming simulation RNG or mutating cells/lifetimes.
- Balanced/high draw actors and decor at two backing pixels per logical world cell. Low/effective-low remains one. World coordinates, logical viewport, physics and UI scale do not change. The existing independent material lighting, occlusion/scattering and bloom remain; this is not a new 3D renderer or a claim of Noita-equivalent quality.
- Read-only visual work stays viewport-local, with explicit scan/accent limits. Existing three quality budgets, slow-light fallback, optional-effect allocation fallback and fixed-step simulation remain. Canvas contexts retain `willReadFrequently` for the software rendering path.

## Reference and visual goals

Viewed actual official Nolla images from [the Noita press kit](https://www.noitagame.com/press/index.html): [000](https://www.noitagame.com/press/images/screenshot_000.jpg), [001](https://www.noitagame.com/press/images/screenshot_001.jpg), [004](https://www.noitagame.com/press/images/screenshot_004.jpg). Goals derived from these references are material clusters/edge contrast, irregular multi-depth silhouettes, region-specific motifs, and small warm/cool focal highlights against quieter dark regions. No image pixels, game assets, maps, prose or audio were copied into this project.

The prior public game had coarse static actors, repeated broad background shapes and relatively uniform blue terrain. Before/after screenshots are actual game renders, not concept art. A controlled desktop pair uses the released 2150ae47 source and the new source at seed 3397, 1180×757, player (40, 29.9986), camera (0, −32), logical viewport 240×154. Materials, actor silhouettes and background separation visibly change while physical topology stays the same. Other captures may differ in quality or pose and are not performance benchmarks.

## Acceptance

`one-thumb.spec.ts` uses at most one CDP touch point at a time and ordinary tappable UI: harvest wood/stone, craft and place camp/workbench, fly/walk, build a three-block stone dam, hold water, mine an opening and release flow, change handedness, fire a wand, rotate to cancel, then save/reload. No actor/resources/world mutation is injected. Native settings selects use Playwright's standard accessible selection action; gameplay gestures use a real single touch contact.

`one-thumb-layout.spec.ts` checks 393×851, 360×640 and 320×568 layouts, target sizes, hero separation and real screenshots, plus low/balanced/high bounded work and physical tick progress. Existing two-hand, exploration, reservoir, persistent death/reload, finite inventory and expedition routes remain regression tests.

Local aggregate types, 202 unit tests and build pass. The one-thumb route passed after reach/sky refinements using tappable tool/inventory/equipment controls. An earlier pilot exhausted the left floor patch and lacked three stone after spending 21 on camp/workbench; it now mines a fresh reachable patch without changing resource costs or rules. The full local browser suite then passed all 15 applicable routes first attempt (five profile skips). After the final workshop-only CSS, both one-thumb routes passed again, including the smaller bottom sheet. A subsequent real one-pointer swipe moved the 320-pixel-wide sheet contents while its lower navigation stayed fixed. Exact CI and the actual served SHA remain publication gates. Hosted Android emulation and sampled work timings do not establish real-device FPS or ergonomic comfort for every hand size.

Local three-quality entrance samples recorded 0.3/0.4/0.6 ms lighting updates and 0.8/1.2/1.1 ms draw work, with 365/642/642 rays and 160×347 or 320×694 backing sizes. These are isolated hosted-cloud Chromium samples, not frame-time percentiles or phone FPS.
