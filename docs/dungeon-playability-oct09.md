# Dungeon first-raid quality repair — 2026-10-09

## Baseline and evidence discipline

The source baseline is the published PR #4 commit
`6ff411a4f47e38b07826627a4fe62507dc433c6e`. A stale local Oct 6 worktree
was preserved, not reused as current code. All 508 files in the new checkout were
verified against the current remote Git tree before changes.

Existing masonry, pointer-lock fallback, input heartbeat, supplier trading,
pending-return protection, quests and both training slices are baseline features.
They are not new improvements in this pass.

The following defects were verified in the current source. Local Chromium cannot
reach a page: its Unix-socket creation fails with EPERM, including a reviewed
ordinary launch. Consequently no local visual-playthrough success is claimed.
Exact-commit public desktop/Android browser gates and actual image/video review
are required after publication. Automated outcomes alone do not establish fun.

## Prioritized defects and repairs

1. **The obvious interaction stops before loot.** E and the touch “調べる” control
   opened a chest but could not open its inventory. Only a separate nearby button
   completed the interaction. E allowed 2.6m while that button used 2.2m.
   Both now use contextual opened-chest interaction; pickup reach is 2.5m.
2. **Loot was buried beneath unavailable systems during danger.** Inventory placed
   the supplier, bag and full 10×10 stash before the opened chest. Narrow layouts
   stacked these while enemies kept attacking. Live-raid inventory now puts the
   selected loot first, focuses its first item and hides unavailable shop/stash
   operations. Bag arrangement remains available. Stable keyed pickup nodes avoid
   replacing a control between pointer-down and release. Lobby/results restore
   their normal storage and supplier access.
3. **Enemy tells did not commit.** Enemies re-aimed every 50ms even during their
   strike/recovery and moved during the swing. They now commit facing and feet
   from windup through recovery; normal pursuit returns when idle. Normal strafe
   input avoids the committed sword/greatsword strike, while a stationary target
   still takes the unchanged 32/48 damage in the focused comparison. An occluded
   nearer explorer no longer prevents acquiring a farther visible explorer.
4. **The in-raid goal lacked directions.** A small contextual card shows chest →
   pickup → extraction and a relative direction along the actual wall/door graph.
   It tells the player to open a closed passage and prefers the soonest reachable
   remaining exit, rather than waiting at a nearby locked one. It does not reveal
   enemies, automate movement, mutate saves or promise a safe route. Route work is
   capped at twice per second, independently of rendering FPS.
5. **Bow primary attacks used an invisible sword.** The visible bow hid the blade
   but normal attack used a sword sweep. Bow primary attack now uses the existing
   finite-arrow draw/release action. The heavy control is hidden for bows and the
   server refuses bow heavy attacks. F remains a shooting shortcut.
6. **Combat had no sound.** Short, low-volume procedural cues accompany confirmed
   local actions and outcomes. They require a user gesture, can be muted, and do
   not claim hit attribution that snapshots cannot establish.

## Verification plan

- Focused rules: counterplay including baseline sensitivity, line-of-sight target
  selection, finite-ammo bow action, contextual reach, routed objectives, inventory
  focus/node stability and audio lifecycle.
- Root and Worker types, complete unit suite, build, diff check.
- The existing ordinary-input two-client smoke now opens and loots the chest with
  E/touch “調べる”, checks first-raid guidance and visible first pickup, and captures
  the loot-first inventory. Existing strict PvPvE, quests, capacity, supplier and
  training gates retain their outcome assertions.
- The Ravager diagnostic screenshot repair is reconstructed from the current
  source, not represented as recovery of the absent local `777724b` commit.
  Its screenshots stay viewport-sized, with touch capability checked before and
  after captures/reloads. Held-touch cancellation assertions are not weakened.

## Remaining limits

- First-person movement still waits for authoritative snapshots then smoothing.
  A real reconciled prediction design needs latency/loss and collision acceptance;
  adding an unverified camera-only prediction patch would risk misleading reach.
- Four similar guards and the compact 32m floor plan remain a limited dungeon.
- Class/weapon balance, expressive locomotion, long-term replay value and physical
  Android/iPhone performance are not established by these repairs.
- The existing full-raid driver knows coordinates and observes public snapshots;
  it is regression evidence, not proof a newcomer can discover the route.

## Local verification checkpoint

The five new focused suites pass 67 assertions (15 enemy counterplay, 6 bow,
11 guidance, 11 loot UI, 24 audio). Root type checking has passed. Full aggregate
checks are recorded separately against the frozen candidate; earlier interrupted
runs are not passes.

Route topology is cached for at most two seeds. A 120-call varied-position Node
CPU check after the body-clearance fix measured median 0.36ms, p95 0.86ms and
20.50ms for the first cold graph construction. This is not a physical-device
frame-rate claim. Route recomputation remains capped at 2Hz.

An additional desktop/Android newcomer gate follows only the visible direction
card and reachable buttons from a fresh default character through first loot and
extraction. It does not read the snapshot probe or use preknown coordinates. This
is a new acceptance gate, not an already-passed outcome.


## Aggregate-discovered route correction

The first complete run passed 1,825 tests and failed two central-approach driver
assumptions. With the visible-target acquisition fix, opening one central door
alone attracts both guards. The old driver incorrectly expected the guard nearest
the closed door to ignore the visible explorer and remain still.

The coordinated two-player route now makes space with the early opener while the
opposite explorer approaches, then begins independent fights only after observed
separation. Five focused tests include both one-second door orders and 96
settling/facing/input-delay combinations. Setup keeps player/guard HP intact;
ordinary movement obeys collisions. The full route still requires all four guards,
two kills per explorer, contested loot, PvP, extraction, persistence and its
original 240-server-second budget. This is driver robustness, not proof that a
novice can safely enter the central hall alone.

Separately, a fresh default-class simulation follows the actual guidance through
the west chest and west extraction using ordinary input. No guard is alerted and
no HP is lost. Its browser counterpart still requires exact-commit acceptance.

The new newcomer browser gate disables raw traces at file scope (required by
Playwright) so private room credentials are not retained. Test discovery confirms
all ten cases in the modified smoke/Ravager files. This is discovery, not execution.

## First-batch exact-preview acceptance

Remote `58a16a7044827628595f8c6cd48aea2f80b7ee86` passed
[run 37909993013](https://github.com/usks213/threejs-game/actions/runs/37909993013).
The deployment checked that the existing PR4 preview served that exact commit,
plus dungeon authority and campaign health endpoints. All selected browser jobs
passed: desktop/Android smoke, visible-guide-only newcomer loot and return,
resupply, overflow return, supplier quests, Bastion/Ravager training, the full
two-player PvPvE raid, and the narrower WebKit menu smoke. The full raid completed
extraction at 146.70 server seconds with its original 240-second bound intact.

Actual desktop/Android loot and return screenshots, Android portrait/landscape
Ravager screenshots, and sampled frames from the full raid recording were
inspected. Loot buttons appear without scrolling; guidance, notices and touch
controls remain usable in those views. These artifacts also show incomplete
walls during the first active frame and overbright nearby weapons/shields. Those
remain concrete presentation defects, not successes inferred from passing tests.
Sound listening and physical-phone performance remain unverified.

## Follow-on: input sampling and release delivery

The isolated input-response candidate uses one monotonic input clock across
render samples, event edges and the independent heartbeat. Keyboard aiming now
advances on each render sample without double-counting the heartbeat. Mouse,
touch, guard, crouch and release edges request delivery immediately. A bounded
latest-state sender retains trailing changes rather than silently discarding
changes inside the old send-cap interval.

Ordinary input is capped at 25 packets per rolling second; an extra neutral
lifecycle release can use a reserved slot, with 26 input packets maximum. Twelve
actions and one hello still fit below the server's unchanged 40-packet limit.
Queued neutral release priority survives later neutral heartbeats, but cannot
be transferred to new held movement. Disconnect/reset/disposal cancel pending
state. No packet schema, authority, collision, save key or input lease changed.

The frozen source candidate passed 1,855 tests across 198 files, root and Worker
type checks, build and diff checks. Browser test discovery passed; exact-head
browser execution for this follow-on is still pending publication. The input
change does not provide movement prediction or remove rendering stalls. Fresh
aim is offered before an action, but an occupied input slot can still let the
synchronous action precede that latest aim; guaranteed ordering needs a separate
action-sequencing design and acceptance, not a claim hidden in this patch.

## Input follow-on exact-preview acceptance

Remote `ab08aec53228220245f3595364cdbda036a390c4` passed
[run 37912605949](https://github.com/usks213/threejs-game/actions/runs/37912605949).
The existing preview was verified against that exact commit. All selected jobs
passed, including nine main cases on each Chromium platform, immediate blur
release, rapid multi-touch cancellation, newcomer extraction, the full raid,
training, quests, overflow return and the narrower WebKit menu smoke. Actual
PC/Android screenshots were inspected and retained as the lighting baseline.

## Follow-on: complete initial geometry and nearby-light readability

The rendering candidate moves dungeon SDF authoring and owner-bucket creation
out of the snapshot callback into cooperative work, preserving the existing
sample order, values, ownership and surface extraction. It prepares all owner
chunks of this bounded dungeon and retains them during the raid. Initial input
and direct raid action paths wait for complete current geometry and a successful
draw, rather than treating WebGL creation or the first two chunks as readiness.
The loading panel displays server-confirmed remaining time and explicitly says
that raid time and enemies continue; it grants no pause, protection or return.

Generation changes, join/leave, cancellation and disposal abandon old work.
Already-ready geometry survives an ordinary transport reconnect, while controls
wait for a fresh confirming snapshot. Door updates keep held guard/look active
and swap a completed revision; they do not impose a new initial-load gate.
A thrown draw or lost graphics context cancels work, stays unready, and shows a
reload-required error without stopping the app's animation loop. Transport
reconnection is not presented as a repair for failed graphics.

The one camera lantern changes from intensity 11 / cutoff 9 / position
(-0.25, -0.15, -0.15) to 14 / 10 / (0, 0.15, 0.65). Decay 2, exposure 1.3,
other lights, materials, fog and shared blade trajectories remain unchanged.
The old lamp was only about 0.16m from a shield vertex; the candidate moves it
behind the eye to reduce the near-light peak while keeping similar illumination
farther down the corridor. Numeric distance checks are not pixel acceptance.

Frozen runtime source passed 1,882 tests across 201 files, root and Worker type
checks, production build and diff checks. Exact sample/geometry tests cover both
layout parities and all door combinations. Browser waits now require complete
first-draw coverage and attach preparation time, authoritative elapsed time and
pose metadata. G2 retains its existing combat/extraction assertions and adds a
held-guard check through door-geometry updates. Exact-head deployment and browser
execution for this rendering candidate remain pending publication.

Measured Node preparation was 1.52–1.80 seconds for all 81 chunks; repeated
same-generation requests reused geometry in 0.04–0.12ms. Individual mesh work,
GPU upload and rendering can still stall. No mobile-FPS or complete prediction
claim follows from those measurements. Initial joins still spend real raid time
loading. Existing point lights do not introduce new shadow/occlusion machinery;
actual nearby walls, equipment and dark-room opponents require visual review.
