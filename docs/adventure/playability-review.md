# Playability repair pass (2026-10-06)

This pass addresses the opening action view and understandable controls. It is not a new feature milestone or a claim that the game is finished.

## Evidence and diagnosis

The exact `cd63fcb935434aa17709a3c7dc29e0eef836611c` WebKit/iPhone-profile screenshots in [run 37452896005](https://github.com/usks213/threejs-game/actions/runs/37452896005) show a foreground post/roof obstructing the starting view, and a two-row quickbar covering the avatar's lower body at 750×342. The object that looked like a tree is a merchant stall: every merchant-kind resource received the same 4.3m-wide booth, including the rescue practice dummy at (3,12). Its pole was consequently at (1,12), close to the initial camera. Story guides received the same unnecessary stall.

The same screenshots show unclear opening directions and no useful compass. CSS both hid the compass on smaller screens and placed the abilities button over its desktop position. The existing camera-reset button was permanently hidden.

The screenshots' world blur is qualified evidence: their diagnostics report an automatic render scale of 0.35 on software-rendered Linux WebKit. This does not establish physical iPhone quality or FPS. Adaptive resolution and required lighting features are unchanged.

## Repairs

- Story guides are compact blue-clothed figures; the rescue mannequin has its own compact wooden model. Real travelling merchants retain their booth. Resource IDs, positions, saves, inventories and authority rules are unchanged.
- Camera obstruction includes the real merchant booth's individual occupied pieces, shared with rendering. It does not invent booth collision for a guide/dummy. Existing occupied-tree and carved-building behavior remains in place.
- Quick slots use one row of eight 48px buttons where the actual safe-area-adjusted space fits. Narrow layouts retain all eight slots in two rows. Context actions follow the same width decision instead of overlapping row two.
- The compass gets a separate, readable strip. Camera reset is available in settings and returns to gameplay. Compact goal cards retain an instruction line.
- The first beacon's opening goal follows existing saved tutorial progress: walk, dig, collect, construct/glue, rescue. The goal opens the relevant existing menu. Worlds past the first beacon keep their story goal; no new progress gates or save format are added.
- The abilities menu populates from the latest snapshot immediately when opened, avoiding a delayed jump as trial/device rows appear. Native-scroll acceptance also waits for the populated status before selecting a swipe target, retaining actual trusted input, button-scroll and no-accidental-activation checks.

## Verification and limits

Thirteen focused unit checks cover opening goal selection, actual person-model bounds, occupied-tree camera retraction, merchant-piece clearance, and rescue interaction labels. The new phone layout case requires eight full-size slots in one row at 750×342. Existing safe-area, rotation, input and menu checks remain; a 750px notched case is added. WebKit captures both automatic and a known fixed 0.75 render scale using ordinary settings controls.

The initial integrated source passed 1,002 tests in 209 files. After the final UI-readiness and interaction-label refinements, typecheck, 34 related tests (including line geometry), and build were checked again. Fresh exact-commit CI/browser/publication results are still pending. Local Chromium cannot open its required process socket, including an escalated attempt; the cloud browser cannot create WebGL. Do not count either as successful direct gameplay. No physical Android/iPhone session or subjective combat-feel validation was performed. Four-client 30Hz throughput and actual Worker heap remain separate unresolved quality gates.

## Carry inspection after the first repair

The first repair was published as `60d45c3587c2384a946e8d06075fb49d0aca278a` in [run 37455665586](https://github.com/usks213/threejs-game/actions/runs/37455665586). Typecheck, 1,001 selected tests/208 files, build, exact publication, PC controls, desktop menu/flight, WebKit and public co-op passed. The new WebKit images confirm the obstructing booth pole is gone, a 750×342 phone has one quick-slot row, and the compass and basic opening goal are visible. Fixed-medium (0.75) output was captured separately from automatic quality.

Android finished 17 passed, two failed and one desktop-only skip. Its layout/safe-area/rotation, aim interaction, voxel rendering and shoulder combat cases passed. Neither failure is counted as a pass:

- Native powers-menu forward scrolling succeeded, but moved the chosen button underneath the sticky trial panel. The reverse test now repositions only an occluded button before recording its independent reverse baseline; native input and all scroll/no-click checks remain.
- The new screenshot/reopen sequence exposed that an idle held part loses its lease after 150 ticks, despite the player still using the page. The holding tray also covered the avatar and reticle in the actual image.

The carry follow-up uses a bounded one-second heartbeat only for an observed, living player's owned, reachable, unexpired held assembly while visible and connected. The authority cannot acquire or resurrect a lease through this action. It has its own 15-tick rate limit, does not consume manual action cooldown or interrupt rescue, and does not request a world checkpoint. Ingress validation, release, expiry, disconnected-owner cleanup and save behavior remain in place. Tests cover these boundaries, including completing an actual rescue during renewal.

The existing manipulation buttons move into a horizontal strip above the reticle. Release remains pinned; narrow phones can swipe the other buttons. Ordinary water/jump controls remain visible. The browser carry case now waits beyond the old expiry without re-grabbing, checks the clear reticle, and performs a native compact-phone control-strip swipe before continuing the same move/record/release sequence.

This follow-up's exact CI and browser results are pending. The initial resin/stone supply piles still occupy too much of the lower camera view; loose-item presentation remains a known visual issue. Combat contact/guard/dodge assertions and their footage do not alone establish satisfying combat feel or physical-phone performance.
