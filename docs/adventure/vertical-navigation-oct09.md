# Vertical navigation and controlled descent (2026-10-09)

## Diagnosis and bounded change

The objective HUD measured only horizontal separation. A player above the cave beacon at y=22.7 could see 0m despite a 33.2m height difference. Objective targets now retain optional height, the HUD measures full distance when it is known, and the visible two-line hint and accessibility label include a short up/down height prefix. This remains visible when compact layouts hide the distance kicker. Heightless legacy targets retain horizontal distance.

The ramp entry now advances only after crossing onto its walkable apron. Its next objectives identify the ramp top and the actual upper island height. Cave guidance separates the sky-to-surface landing, ground stamina recovery to 40, and surface-to-cave descent. It routes to the western landing area at (22,3,8), outside the 3.5m-radius shaft, rather than promising an uninterrupted sky-to-cave flight.

Wings previously capped velocity at -0.4 before the motor's three gravity substeps. At 30Hz this produces -0.8667m/s end-of-tick velocity and roughly 0.7111m/s downward displacement, too slow to descend 14m before a 50-stamina wing budget expires. Full movement keeps this existing forward lift for thermal/island crossings. Easing movement continuously increases descent to a -3.4 pre-gravity cap at zero input, roughly 3.7111m/s downward displacement and -3.8667m/s end velocity. The wing opening notice and cave hints explain easing/releasing movement and correcting wind drift.

Stamina costs remain 5/s normally, 3.5/s with endurance food, and 2/s in updrafts. Wind, updraft lift, horizontal speed, free debug-flight controls, collision authority and save format are unchanged. The tradeoff is purposeful: full steering preserves range; releasing/partially easing the stick makes landing practical. Ground rest remains necessary on the staged sky route.

## Real-terrain evidence

Both baseline and candidate probes start at the real spawn with the unchanged generated terrain, water, enemies and starter equipment. They walk onto the ramp apron using normal movement. Each descent opens the wing once and never reopens after exhaustion. The sky route walks the full ramp, calls normal Ascend preview/confirm actions, and walks onto the sky island before departing.

- Before: the surface-to-cave descent exhausted stamina, fell, and landed at 17/25 HP. Sky-to-western-lip plus the cave leg each exhausted stamina and ended at 9/25 HP despite ground recovery between them.
- After: surface-to-cave lands at 25/25 HP with 27.67 stamina remaining. The complete spawn-to-cave route takes about 13.7 simulation seconds.
- After: sky-to-western-lip lands at 25/25 HP with 7.0 stamina. Waiting on the ground to 40 takes approximately 2.73 seconds; ordinary walking to the hole continues regeneration. The next continuous glide lands at 25/25 HP with 27.5 stamina. The complete ramp/Ascend/two-landing route takes about 35.3 simulation seconds.
- Zero-input release in the initial breeze lands safely within the shaft footprint. Separate real-terrain tests use the actual storm wind with keyboard-style on/off corrections and gentle analog corrections. Only the world clock is a weather fixture; spawn, geometry, water and enemies are untouched. Keyboard correction uses more lift time and retains over 10 stamina rather than the analog test's over-15 reserve.
- The existing first-thermal-to-higher-island acceptance still passes, along with wing exhaustion warnings, traversal safety and stamina-free debug-flight tests.

## Browser continuation and verification limits

`vertical-navigation.spec.ts` is a separate native-input continuation; it does not alter the existing 180-second fresh-arrival test. Its imported first-beacon fixture is earned through production simulation actions from spawn: pickup, two constructions, grab/glue/release, walking, and beacon activation. No coordinates, inventory, beacon-ready flags, water or enemies are assigned. The independent fresh-arrival browser case covers earning that state natively.

After import, browser coverage uses native mouse/keyboard or touch movement for the ramp, actual Ascend controls, native camera aiming and sky-beacon interaction, a simultaneous held touch stick plus wing-button tap, surface landing/recovery, and the continuous cave landing. After landing it walks two meters west and aims/activates the cave beacon from the real floor. It captures ramp, sky guidance, surface landing, recovery, cave landing, cave activation and observed authoritative state. Reading worker snapshots does not change gameplay. The new case has its own 240-second bound. A separate production HTML/CSS geometry case requires the complete height-prefixed hints to fit at 750×342 and rotated 342×750, with the kicker hidden; these are layout fixtures, not gameplay evidence.

Local focused checks passed: 52 tests across eight files, plus the final tightened dynamic-waypoint test in a 17-test goal/route recheck. Typecheck passed. The parent release check owns the final frozen aggregate suite/build. Native browser execution is pending exact-commit CI: this environment's Chromium launch is already verified blocked by socket EPERM. These tests and simulations do not establish physical-phone FPS, human play enjoyment, or all-weather skill-free sky travel. The latest 20.18Hz four-client load measurement on a43b0dd8 remains below the 30Hz target; this navigation batch does not claim to resolve that performance gap or broaden the prior opening-only visual approval.
