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
