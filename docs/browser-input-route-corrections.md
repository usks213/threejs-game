# Browser input and crypt-route corrections

2026-10-05. Findings from exact published SHA
`11c9e163f29e41860dfb1097ebf995d1620897f0`,
[CI 37387550716](https://github.com/usks213/threejs-game/actions/runs/37387550716).
These are trace-based input/route fixes. Their next browser execution is pending.

## Android weapon selection and guarded aim

The [bow job](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223841)
(artifact 11380103978) and
[staff job](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223896)
(artifact 11380335498) failed the unchanged 0.035rad pitch assertion.

The traces show that both builds had their intended weapon equipped, but
`tool=true` at combat. Equipping a weapon already selects it in the production
command handler. The browser helper then translated `Digit1` into an unconditional
tap on the touch toggle, selecting the chisel again. The actual shield button was
disabled, and the input observations recorded `controls.block=false` throughout
the supposedly guarded aiming sequence.

The stationary bow player's pitch alternated between about −0.01856 and
−0.22328rad; the staff player's between about −0.01837 and −0.21357rad. Both
retained HP 100. This is evidence of a gesture/mode problem, not a reason to widen
the aim tolerance or claim the ranged combat passed.

`PlayerControls.action` now treats a mobile `Digit1`/`Digit2` request as selecting
the corresponding observed mode. It taps the real toggle only if needed, then
checks the actual tool state. The Q03 route additionally checks that its weapon
is selected and the shield is enabled immediately after crafting/equipping.

The guarded look also sent `touchEnd` with a nonempty retained-shield array.
The [Chromium protocol definition](https://chromium.googlesource.com/devtools/devtools-frontend/+/e2269160c6899e5abfe73d2274f211ef6e04bda1/third_party/blink/public/devtools_protocol/browser_protocol.json)
requires an empty array for touchEnd/touchCancel and describes touchPoints as the
complete active set. The helper now sends a touchMove containing only the shield
finger to release the look finger, then verifies the production block input is
still held. Shield activation checks that the actual button is enabled and its
input became active. Full release still sends touchEnd with an empty array.

This corrects two concrete problems. The next real touch run must establish
whether they account for the complete observed pitch oscillation.

## First-chapter rescue return

The [Android chapter job](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027223743)
(artifact 11379654701) actually rescues the artisan, then dies on its return:

- Entrance guard dies at simulation time 133.683, player HP 100.
- The warden activates during the first approach to (0,0).
- At 143.450, aiming at the artisan takes 38 damage: HP 100→62.
- call@4770 at 143.833 confirms `artisanRescued=true`.
- A roughly 2.26rad turn back takes another hit at 146.117: HP 62→24.
- At 149.733, the player dies while correcting the return waypoint, at
  (−0.085,−0.064), with the warden 1.49m away. Observed turn/move inputs are unguarded.

The chapter route now resolves the alerted warden at the first (0,0) stop,
before the long interaction/escape turns. At that point the trace has full life
and stamina and the warden is still 6–7m away. It uses the existing shield/counter
helper, starter sword and 18-round bound, then re-anchors at (0,0) before rescuing.
Later conditional warden encounters skip an already defeated enemy. The copied
chapter inside the new Q07 route receives the same change.

No health, supplies, collisions, enemy damage, .18m waypoint tolerance, .035rad
aim bound or existing timeout is changed. This early starter-sword encounter
still requires desktop and Android browser verification.

## Desktop short-waypoint release latency

The [desktop watermill job](https://github.com/usks213/threejs-game/actions/runs/37387550716/job/112027224837)
(artifact 11380890898) misses its final .18m arrival by .2124m. While correcting
for (2.5,5.75), a poll already observes (2.5129,5.6917), less than .06m away;
after the delayed key release and velocity settling, it reaches
(2.4253,5.9488). The prior correction also ran without its intended shield
because the Core tool mode changed before the rendered button became enabled.

Desktop segments shorter than 2.25m now wait for the real weapon-mode label
before sampling shield availability. Their existing aimed heading uses at most
24 actual W-key pulses, each held for 50–200ms and released by Playwright before
any telemetry read. Each pulse is allowed to settle for the same .3 simulation
seconds already used by the walker. Later pulse lengths are calibrated from
observed settled displacement, with no simulator writes or speed changes.

This remains inside the existing 60-second segment budget. It does not add
waypoint correction attempts: the original five re-aims, .18m final distance,
.035rad aim checks and long-leg behavior are unchanged. The reported desktop
bow/inventory misses use this same helper; their next runs must establish the
fix rather than infer a pass from the watermill trace.

## Desktop staff cast rejected after a stale aim

The desktop staff artifact 11380996762 records the last G input at simulation
time 291.3–291.47, with player HP 100, stamina 66.4, mana 40 and the entrance guard
at 13.6 HP with 77 material scars. The post-input DOM snapshot says
“7m以内のVoxelに照準を合わせる”; mana remains 40. The action was rejected before
spending mana because its ray no longer hit a voxel, not because recovery failed.

The ranged driver previously selected a surviving material point, then waited
through an entire new enemy attack before firing. It now reacquires real enemy
material after the newly observed recovery, while still guarding. If that look
consumes the opening, the existing bounded loop begins another guarded cycle.
The 28-round limit, reticle-name check, .035rad aim tolerance, exact 20-mana debit,
finite dose budget and all existing timeouts remain unchanged.

## Local checks

TypeScript and Playwright definition listing only. No local Chromium launch,
full test suite, build, external write or publication was attempted. Successful
definition discovery is not evidence that these corrected routes pass.

## Exact 2b9702b2 trace corrections

The desktop staff trace recorded Home release from 16.61s to 19.61s while yaw
continued from 1.96 to 4.11 radians, past its 1.84 target. The next driver sends
real CDP key presses and schedules releases on the Node clock before awaiting
renderer acknowledgements. It does not write camera or game state. The existing
12 look attempts, 0.035-radian tolerance, five waypoint corrections, 0.18m arrival
and 60-second walking-segment bound remain. Regression tests block or reject
key-down acknowledgements and verify release still occurs on schedule.

The SDF reflection failure was observed after an unbounded strafe had reached
x12.69 and fallen to HP0. Its route now settles at the actual x5.5/z3.2 viewing
point and asserts life before looking toward the basin; the reflection check is
retained. Long walking legs also use bounded released pulses.

The Android workbench case had four wood and a remaining wood target after two
strikes, with no loose drops. Two strokes are not a recipe contract. It now uses
the established maximum-20-stroke normal miner to earn eight wood before paying
the same exact workbench cost.

The desktop inventory reload comparison ran while worldReady was false and the
status still said that regions were loading. The saved meal drop was present;
no restored world had yet been observed. The case now waits for both completed
world loading and the actual loaded-save status before comparing the drop and
storage, and asserts that restoration reported no failure. These corrections
still require exact-head browser reruns; they are not acceptance claims.

Precision walking pulses are capped at400ms to permit actual simulation frames
on the measured slow software renderer; near-goal duration is still reduced from
observed movement. The 24 short-leg pulses, 60-second segment budget and arrival
tolerance remain. Western resident checks additionally record the live Core target
and actor pose immediately after aiming, without changing the target assertion;
the reported pose/angle resolved to the correct actor in a standalone Core check.

The 7e5a7772 Android bow route defeated its entrance guard, then died turning
toward the artisan while the warden pursued. Like the first-chapter route, both
ranged builds now face and fight that warden before the rescue turn. The same
32 arrows or12 earned mana doses, 28-round combat bound, exact spending checks
and no-death assertions remain. The warden fight screenshot is taken there;
forge armor and the level point are earned and exercised afterward. This case
does not claim that later armor was worn during the earlier boss fight.
