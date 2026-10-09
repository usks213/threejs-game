# Q07 bounded seven-region browser acceptance

2026-10-06. This change defines desktop and Android-emulated touch acceptance
routes. **No successful
browser execution, screenshots, FPS result or Q07 completion is claimed yet.**
The existing normal-Core route is useful rule evidence, not browser evidence.

## Scope and route

`tests/e2e/campaign-regional-playthrough.spec.ts` starts in a fresh Playwright
context with empty inventory, no regional claims, level 1 and 100 finite mana.
The public `streaming=1` startup option selects the v3 sampled world used by the
Core reference. `test=1` only enables observation. No localStorage fixtures,
teleports, grants, time manipulation, direct Core calls or invulnerability are
used. The optional western expansion is outside this route.

The route physically earns the first chapter: logs/stone/grass/metal, hearth,
entrance guard, artisan rescue, sword/armor/grapple/glider/medicine, mist cache,
grapple ascent, glide return, crypt warden, tier-two hearth and northern camp.
It follows the finite route in `tests/unit/campaign-regional-play.test.ts`:

1. Western field herb and seal, forest beast/cache, then hearth unlocks.
2. Eastern authored fen stairs and spear guard, then the mine approach/guard.
3. Earned vigor/endurance/attunement points, real gear repairs/upgrades and
   finite harvested berry medicine before the ash caster and summoner.
4. Snow step/jump, ice keeper, sixth seal and actual crystal collection.
5. Real foliage gathering, eight bandages and fourteen hand-crafted mana doses;
   the lake stalker, then the final guardian from the western shore.
6. Oxygen-bounded swim to the last cache and back to the shore hearth. Require
   all seven seals/unlocked regions, each mandatory enemy reward, zero deaths
   and the visible “七つの灯をつないだ” objective.
7. Actual settings-menu save, page reload and continuation. Require identical
   campaign/inventory/sample terrain/weather, mana/focus value, position and
   the same completion UI.

The initial stone target is 22. The explicit balance is 22 − 6 hearth − 12
gear upgrades + 4 caster reward + 6 snow crystal = 14 mana doses. This improves
on the Core route's 20-stone threshold, which depends on incidental harvest
surplus. The finite twenty-strike harvest bound is unchanged.
The existing browser chapter's extra six grass/two ridge bandages are retained.
The new full route targets 19 initial grass: five more than the chapter. This
covers the three-grass late preparation deficit and two-grass snow preparation
deficit without depending on incidental harvest surplus; the 20-strike limit stays.
All later preparation checks exact material debits and item outputs, skill-point
costs, repairs and upgrade costs. The spell fight accounts for every mana dose
and every 20-mana cast. There are no arrows fired by this sword/element route;
the independently defined Q03 bow route owns arrow acceptance.

The lake strategy casts only water/lightning and preserves the selected visible
enemy-material aim offset during the pending cast. It plants on the bank for
the real 0.45-second pending cast, then resumes shore movement; finite-rate
keyboard look is not treated as Core's instantaneous tracking. Imminent tells
are checked again after aiming. It never uses Focus, earth
or wind on the shoreline: their impulse can move the guardian under the bank.
The driver remains inside a checked western-shore corridor and responds to
real burst/lunge tells with ordinary jump/dodge keys or visible action touches.

## Test-only observation and input constraints

`src/prototype/regional-input-observation.ts` is an isolated, query-gated scalar
probe. It reads player/enemy positions, phase, grounded state, wetness, mana and
the already visible attack tell's kind/remaining time/serial. Its getter does
not raycast, clone a save, advance the simulation or expose live references or
callable actions. Two small unit definitions check detachment and forbidden
source access; their execution remains with the parent verification gate.

The ordinary shared `PlayerControls` retains five walking corrections,
strict 0.18m settlement, strict 0.035rad aim checks and at most twenty harvest
attempts/four nearby-drop pickups. The new regional loops keep the Core route's
18 melee rounds, 70 assault cycles and 50 shore cycles. Combat has explicit
simulation-time and input-delivery bounds. Failures are preserved, never
converted into a weaker arrival/death/resource assertion.

Reactive regional combat uses actual desktop keyboard input or Android-emulated
CDP touch contacts. The same route and resource/combat assertions run in both
projects. `PlayerControls` owns a small serialized contact set: movement (1),
look (7), shield (8), and action (9). A jump, dodge, cast or look gesture releases
only its own finger. Moving the analog stick or releasing it does not release
the shield. Live pending-cast tracking uses a bounded look-pad drag without an
idle-phase wait; mobile never falls back to keyboard movement/look/actions.
Touch starts use visible, unobstructed controls. Menus, startup and save/reload
use ordinary locator taps. No game state is injected or modified by the driver.
The Android project uses the pinned Chromium's normal CDP TouchEmulator path,
which delivers recognized taps as well as raw touch pointers. The first finger
uses touchStart; touchMove adds/moves contacts; a partial touchEnd names only
the finger being released. The source-backed contract and actual CI regression
from enabling SyntheticPointerActions are in [Android CDP input](android-cdp-input.md).

`campaign-touch-controls.spec.ts` is a separate fresh-context preflight before
the long Android route. It first requires one trusted quality-toggle click from
an ordinary tap and a real pause/resume menu round trip. It then observes
trusted touch pointer events and actual
movement axes, held shield, look, jump, dodge and one finite 20-mana water cast.
It rejects keyboard events and records its evidence. Its movement/spell do not
affect Q07's independent new-game inventory or position. The contact scheduler
also has focused unit coverage for retained contacts, concurrent gestures,
ordered cleanup and failed delivery. Neither unit tests nor Playwright test
discovery establish Chromium behavior or Android acceptance.

## Independent CI job and evidence to collect

The `regional-campaign-browser` job and independent
`regional-campaign-android-browser` job in `.github/workflows/ci.yml` run for
PR #4 after the normal verification/build artifact. Each
100-minute job budget contains a 90-minute full-route test budget, setup and
artifact upload. This larger budget covers the existing 30-minute chapter plus
seven physical round trips, boss fights and save/reload. It does not change the
existing 20-minute short jobs, chapter timeout, input timeouts or assertions.
Retries remain zero. It uses the existing GitHub-hosted runner and no new paid
service, credentials, deployment or access grants.

Artifacts are uploaded even after failure as `regional-campaign-desktop` or
`regional-campaign-android-emulation`. The Android job runs its short preflight
first and preserves its separate report/results, including on early failure:

- Trace/report plus `browser-diagnostics` with page errors, console errors and
  all HTTP responses of status 400 or higher.
- JSON at every named authored checkpoint, containing position, life, oxygen,
  inventory, campaign, enemies, weather and renderer statistics.
- Scene screenshots at fresh spawn, cleared field, cleared ash boss, defeated
  final guardian, prepared home, completed shore and reloaded completion.
  Intermediate combat/underwater checkpoints do not add screenshot delays.
- At safe spawn/home/completed-shore locations, a bounded sample requests 120
  rAF intervals or records the observations obtained in 15 seconds. It reports
  sample completeness, FPS, median/p95/max interval, elapsed wall/game time,
  visibility/focus, browser version/user agent, viewport, DPR, concurrency and
  renderer/loop statistics. A partial or stalled sample stays explicitly partial.

The fixed environments are desktop Chromium at 960×540 CSS pixels and Pixel 7
landscape Chromium emulation at 844×390. Both use device scale factor 1, the
actual “省電力” preset and the existing SwiftShader launch flags. Every checkpoint
asserts its exact project viewport and records its input/emulation label.
These are local CI rendering observations, not hardware-device FPS guarantees
or historical before/after visual comparison. No performance pass threshold is
invented without a measured baseline.

## Verification record and remaining work

- Local checks on 2026-10-06: `npm run typecheck` passed, focused contact and
  regional-observation unit tests passed, and Playwright discovery finds the
  shared Q07 route in both projects plus the Android contact preflight. The
  desktop project skips only the touch-specific preflight. These checks do not
  start a browser or prove the route.
- Chromium execution was deliberately not retried in this executor: the known
  launch socket EPERM occurs before a page opens. No local screenshot exists.
- No full unit suite, production build, CI job, push, PR update or deployment was
  run by this worker. The existing published branch and in-flight CI are intact.
- The parent must integrate the commit, run the normal verification gate and
  both regional jobs at that exact SHA, inspect screenshots/trace and record
  pass/failure plus measured values here before Q07 can be marked accepted.
- The first browser run can expose input latency, terrain/aim, supplies or
  survival failures. Fix the real route/control cause without increasing old
  tolerances, granting resources, changing damage/collision or hiding failure.

Physical Android/iPhone and raw-relative mouse input remain unverified. The
171-item ledger remains intact. Q07 is browser pending; this file adds a
concrete way to obtain evidence for the bounded original campaign, not a claim
of Enshrouded parity or completion of every requirement.
