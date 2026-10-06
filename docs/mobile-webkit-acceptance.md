# Mobile WebKit engine acceptance

The dedicated `mobile-webkit-browser` CI job runs the built game in Playwright's
Linux WebKit with its iPhone 13 landscape descriptor, an 844 × 390 viewport,
touch emulation, and DPR 1. It downloads the same `game-dist` artifact as the
Chromium jobs and installs the official browser and operating-system dependencies
with `npx playwright install --with-deps webkit`.

This job is independent of preview publication and the existing Chromium jobs.
`playwright.webkit.config.ts` only discovers `tests/webkit/`; the Chromium config,
test groups, launch flags, and CDP/native input drivers are unchanged.

## Acceptance boundary

1. Campaign startup must create a visible canvas, submit triangles/draw calls,
   advance rendered frames and simulation after Start, and keep the error screen
   hidden. Touch taps must change the selected tool, open the campaign map and
   pause menu, and resume play. A read-only observer requires trusted touch
   PointerEvents on the actual buttons alongside their visible/state effects.
2. A portrait viewport must pause simulation and show the rotation prompt. Returning
   to landscape must remain paused until a new Start tap. Input must remain neutral.
3. Public menu taps change graphics quality and the volume slider, save the journey,
   reload it, and verify the settings, inventory, and campaign snapshot survived.
   The restored slider and graphics label must agree with the saved settings, and
   the saved journey must resume simulation.

All actions use Playwright's browser touch tap API and public controls. Evaluated
JavaScript only reads production diagnostics/storage or records delivered input
events. It never dispatches synthetic DOM events, writes private game state,
seeds saves, accelerates the clock, or spoofs browser capabilities. WebKit has no
Chromium CDP input transport; these cases do not import the Chromium touch-hold
helper. They also do not assert `navigator.maxTouchPoints`, which Linux WebKit
can report differently from the configured mobile touch profile.

The suite has three cases, one worker, no retries, a three-minute per-case budget,
and a nine-minute total browser budget. CI retains screenshots, touch observations,
browser errors, failure traces, and the HTML report for seven days. Installation
and runner setup have a separate fifteen-minute job limit.

## Reproduce and interpret

Run `npm ci`, `npm run build`, and `npx playwright install --with-deps webkit`, then
`npm run e2e:webkit`. Use `npm run e2e:webkit -- --list` for discovery without
launching a browser. `E2E_BASE_URL` may point at an already verified deployment;
without it, Playwright starts the local production preview.

An added test or successful discovery is **not a browser pass**. The initial patch
was typechecked, built, and checked for test discovery locally; browser execution
was deferred to CI because the local executor cannot open browser sockets. Record
the exact commit and CI result before claiming the WebKit boundary passed.

Passing establishes this bounded Linux WebKit engine behavior only. It does not
establish physical iPhone/iPad Safari compatibility, iOS system/fullscreen or
browser-toolbar behavior, hardware GPU/FPS/thermal performance, sustained held
or simultaneous multitouch, or the full seven-region campaign in WebKit. Those
remain separate acceptance work.

Official Playwright references: [browser/dependency installation](https://playwright.dev/docs/browsers),
[device emulation](https://playwright.dev/docs/emulation), and
[touchscreen API](https://playwright.dev/docs/api/class-touchscreen).

## Exact engine result and visual follow-up

Run37406668087 passed all three cases on4276b09 without retries; artifact11387589938 was downloaded and its pixels inspected. Campaign rendering, portrait pause and the restored settings panel are visible. These results establish Linux WebKit engine coverage, not physical iPhone/Safari performance.

The restored-settings image exposed pale selected text on WebKit's light native
dropdown face. The next correction paints the select face explicitly with the
existing dark palette, while retaining the native picker and keyboard behavior.
The case scrolls the graphics select fully into view, records foreground and
background contrast, and captures another image for actual pixel review.
