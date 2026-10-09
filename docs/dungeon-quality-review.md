# Dungeon play-quality review — 2026-10-06

## Evidence and limits

The published starting point is `0a374ddac7cabd6ff690da39b8d20347eebe7011`.
Its successful [CI run](https://github.com/usks213/threejs-game/actions/runs/37431664632)
includes desktop artifact `11397164817` and Android artifact `11398305590`.
Both were downloaded and their actual screenshot pixels reviewed. They contain
lobby and extraction-result screens only. The visible world behind the result is
flat, bare walls. These images establish UI legibility and a completed extraction;
they do **not** establish readable combat, enjoyable exploration, or responsive
movement. No fighting video exists in those artifacts.

The already-authored full two-browser raid test is an additional acceptance gate,
not a result. It has not run on the unpublished source. Local browser execution
is unavailable in this environment, so visual/gesture acceptance must run in CI.
Do not describe test discovery or shader-string unit tests as browser success.

## Prioritized diagnosis

1. **Controls can fail outright.** Rejected pointer lock leaves desktop aiming and
   mouse combat unavailable. Shift aiming precision is never enabled. A canceled
   touch incorrectly releases unrelated held controls.
2. **Combat state is difficult to read.** Damage has no short visual response;
   opponents' windup and recovery are not explained at the sightline. The player's
   attack lockout has no nearby progress cue. Some enemies display a shield that
   they do not own and cannot use.
3. **Spatial presentation is anonymous.** Untextured planes and minimal structure
   make the small flat layout look like a test arena. Exit/chest objectives are
   functional, but the current 32 m map and four similar enemies remain a thin
   vertical slice.
4. **Movement and breadth remain limited.** Local movement waits for 10 Hz server
   snapshots and is visually smoothed. This pass does not claim to solve network
   prediction, sound, enemy variety, or campaign-scale exploration. Expanding
   class/catalog counts would not repair these problems.

## Bounded changes in this pass

- Preserve first-click camera capture. If pointer lock is denied, support
  left-drag aiming, short left-click attack, and held right-button guard.
- Correct both Shift keys, independent touch cancellation, off-pad release, and
  inventory input recovery. Add event-level unit and isolated browser regressions.
- Add sightline-only opponent health/windup/recovery information. Closed walls
  and doors occlude the readout. No targeting or damage authority changes.
- Show confirmed local damage at the screen edge, confirmed actor damage on the
  actor, and the player's real attack phase/progress. No unverified hit attribution.
- Hide class-inapplicable bow/magic buttons and irrelevant resource counters.
- Use dungeon-only antialiased world-aligned masonry on the existing SDF surface,
  add high ceiling ribs, improve blade thickness, and remove fictitious AI shields.
  Campaign materials, world collision, authority, and save keys are untouched.
- Capture unobscured spawn/chest screenshots in desktop and Android acceptance;
  capture WebGL/shader console errors rather than only uncaught JavaScript errors.

## Recovery validation — 2026-10-07

- Restored the preserved work and corrected the browser-routing contract to
  include the new isolated input spec on both Chromium platforms.
- Game and Worker type checks, production build and 78 dungeon unit tests pass;
  36 focused input/readability/routing tests also pass. Final full-suite validation
  and exact-commit deployed browser acceptance are still pending.
- Local system Chromium exists but cannot start because the execution sandbox
  rejects its Unix socket creation. No local browser case reached gameplay.
- Retain the full primary-player raid video and check shader console errors on
  both clients, so active combat can be visually inspected rather than inferred
  from lobby or result images.

## Release criteria

- Root and Worker types, complete unit suite, production build, and diff checks.
- Exact-commit existing-preview deployment verification.
- Desktop and Android gameplay screenshots reviewed by a human-capable agent.
- Full ordinary-input two-browser raid, plus pointer fallback/cancel regressions.
- Report failures and missing evidence before calling the pass playable or complete.

## First recovered public acceptance and repair

Candidate `6fad15750fde363304409d0ddeb0d36d2613ed0e` passed all
1,387 unit tests / 164 files both locally and in CI, root/Worker types and build.
CI verified the existing preview served that exact commit and both service health
endpoints. Android passed all four cases, including real emulated touch input and
extraction persistence. Desktop passed both isolated input regressions and legacy
save isolation, but its chest smoke timed out. Full raid reached both outer guard
fights and the central hall, then died against the second central enemy. WebKit's
installation timed out before its browser test began. These are distinct outcomes.

Actual desktop/Android spawn/chest images and the full primary-player recording
were inspected. Masonry, ceiling structure and sightline enemy state render; the
recording also shows prolonged frozen render frames. The authoritative trace
pinpoints a 1.3s gap in input refresh with Z physically held. The server correctly
expires stale input after 0.35s, so the shield falls and the explorer takes damage.

The next candidate moves normal input sampling/heartbeat to an independent 50ms
timer. Rendering only samples the current look; it no longer owns keyboard-turn
integration. The 25Hz send cap, hidden-page reset, lifecycle cleanup and server
stale-input timeout are unchanged. Keyboard press/release also requests an input
update. New timer tests and a no-render-frame browser harness cover this contract.

The full raid driver now uses carried medicine safely before opening the central
door, retains guard while switching to the next nearby enemy, and does not drink
beside a live visible threat. The desktop smoke approaches the chest well inside
its ordinary reach rather than resting on a latency-sensitive boundary. No health,
damage, enemy count, kill requirements, time limits or server authority are relaxed.
The new candidate's exact-commit browser acceptance remains required.

## Input-heartbeat candidate acceptance

Candidate `86714b04d28863a785629a728fb185e65955c39e` passed all
1,390 unit tests / 165 files locally and in CI, types/build, and exact-SHA preview
and service health. Both desktop and Android passed all five browser cases,
including loot/extraction/reconnect and the independent input heartbeat.

The full raid now survives all four AI enemies and completes both contested loot
checks. Its remaining failure is the original 240-second route bound: the driver
passes through a close waypoint and overshoots by roughly a metre, then turns
180 degrees and repeats. The same orbiting costs over 30 seconds before the
all-four-AI milestone. The next driver correction uses brief ordinary crouched
WASD pulses near a waypoint, settles on server ticks, and preserves the exact
waypoint tolerances and time limits. The production game is unchanged by this
follow-up. Its pure direction/convergence tests pass.

WebKit's screenshot and DOM confirm the menu opened with the new control wording;
its old exact-text selector was stale. The selector now checks visible instructions
and the still-required WASD movement text. This browser check still needs rerunning.

## Verified loop baseline before supplier quests — 2026-10-08

Commit `43b2fbae0bbc1ae6b5d18081afd3b7232d9a8d3b` and
[CI37714853419](https://github.com/usks213/threejs-game/actions/runs/37714853419)
passed all 1,525 unit tests, types/build, exact-SHA existing preview deployment,
PC/Android six-case routes, WebKit menu smoke, full PvPvE and both capacity gates.
The full raid defeated four AI, contested two loot sources, completed PvP death and
corpse recovery, extracted at 168.30 seconds with 48 HP and five banked items, and
reconnected both participants. Both capacity routes completed seven natural raids;
40 stash items plus two pending returns survived reload and explicit claims, with
all 42 IDs/counts preserved. The actual recording and result/claim screens were reviewed.

The final driver corrections use finite existing keeper healing, traversable escape
lanes, and proportionally smaller real touch-stick displacement near waypoints.
They do not add player HP/resources, reduce enemy damage, or relax survival/time/precision
assertions. Mobile tests remain emulation. Spatial/enemy breadth, physical-device
performance, sound and long-term enjoyment remain separate unfinished work.

The next player-facing pass adds two explicit supplier objectives and a persistent
private journal, documented in [supplier quests](dungeon-supplier-quests.md).
This gives the existing extraction/resupply loop a visible goal and finite completion
reward. New quests require their own ordinary-input PC/Android acceptance; the green
baseline is not evidence that the new UI and reward flow have already passed.

## Quest baseline and next training slice — 2026-10-08

Commit `eca92a3e4b43a507a8460997d37a4a2fb6e7a65d` and
[CI37729491927](https://github.com/usks213/threejs-game/actions/runs/37729491927)
passed all 1,621 unit tests, types/build, exact preview, PC/Android six-case routes,
WebKit, both supplier-quest routes, both capacity boundaries, and strict full PvPvE.
The last route split the four original guards evenly between two real explorers,
contested both loot sources, killed one player, and extracted the survivor at
217.15 seconds with 29 HP and five items. Both outcomes persisted after reload.
Actual combat/death video frames, result screens, quest/claim screens and item
records were inspected. The quest and capacity browser error arrays were empty.

The next limited player-facing addition is optional [bastion training](dungeon-bastion-training.md):
one active and one passive choice, real movement/guard effects, explicit cooldown,
and visible counterplay. Existing unselected characters retain baseline behavior.
The new independent PC/Android gate must establish actual input and readable UI;
unit checks do not establish physical-device performance or long-term balance.
