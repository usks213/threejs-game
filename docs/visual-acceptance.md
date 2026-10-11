# Q13 visual comparison evidence

Actual unedited PNGs from exact-commit browser artifacts were inspected on 2026-10-06. This is a comparison of the same logical scenes, not a pixel-perfect image regression. Q13 remains partial because the boss pair is still missing.

## Four compared scenes

The 844×390 Android staff screenshots come from [7e5a777 / artifact 11384124479](https://github.com/usks213/threejs-game/actions/runs/37396974597/artifacts/11384124479) and [ed52ca6 / artifact 11386600505](https://github.com/usks213/threejs-game/actions/runs/37401433433/artifacts/11386600505). Archive digests were checked. Trace sources and preceding position observations corroborate each location.

| Scene | Screenshot suffix | Observation and limit |
|---|---|---|
| Start | staff-01-fresh-start.png | Same spawn (0,0.25,6), facing the crypt door. HUD and empty inventory remain readable. |
| Forest | staff-02-forest-gathering.png | Same tree 0 harvesting point/aim. Target card remains legible. Different material drops, carved terrain and a 0.057 m position difference are ordinary play differences. These are close harvesting views, not forest panoramas. |
| Base | staff-03-equipped-hearth.png | Same equipped-hearth route, within 0.019 m of the prior position near (-3.5,0.248,5.3). Structures, weapon and HUD are present. Camera faces the surroundings rather than the flame; timing/weather/carving differ. |
| Combat | staff-04-guarded-crypt-combat.png | Same entrance-guard lure point (0,3.2). Name/bar/material information is readable. The raised player shield fills the center-left view; a lowered-shield desktop counter frame confirms this is not established enemy-camera clipping. Different enemy poses are not scored as pixel regressions. |

The combat target panel is approximately 280×80px, beginning 28 px below the reticle. It adds central coverage, but these static guarded frames alone do not establish that it hides an otherwise visible attack tell.

## Missing boss pair

[ed52ca6 bow artifact 11386500866](https://github.com/usks213/threejs-game/actions/runs/37401433433/artifacts/11386500866) contains bow-05-warden-combat.png. The inspected 7e bow/staff artifacts stop before the corresponding warden capture. The newer e9e43f3 run may supply the later same-boss scene; it has not been inspected here. Entrance-guard and ridge-completion images are not substitutes.

## Verified compact HUD improvement and remaining defect

The same 568×320 fresh-spawn build scene in [11c9e163 / artifact 11379754154](https://github.com/usks213/threejs-game/actions/runs/37387550716/artifacts/11379754154) and [ed52ca6 / artifact 11386271461](https://github.com/usks213/threejs-game/actions/runs/37401433433/artifacts/11386271461) shows the keyboard-oriented overlapping hint replaced by a readable top touch-instruction row.

The latter artifact also reveals an unresolved actual collision in build-with-active-fire-568.png: the focus card overlaps the recipe-cost and mana/focus rows. This is a UI-on-UI obstruction, separate from the player's shield. A contextual layout correction and expanded real DOM overlap checks are implemented locally; no pass is claimed before its own browser image and assertions.
