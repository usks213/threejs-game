# Bounded iPhone-profile WebKit smoke

`iphone-webkit` is one Playwright engine-emulation project, using the bundled
official `iPhone 13` device profile. Its launch arguments explicitly exclude the
Chromium-only ANGLE/SwiftShader flags. The existing desktop and Android Chromium
projects retain their original device settings, launch arguments and test suite.

The isolated `tests/e2e/iphone-webkit.spec.ts` case checks the production app:

- A live WebGL2 context with the required floating-point color-buffer extension,
  nonzero drawing buffer, advancing submitted frames and simulation ticks.
- Original adventure title, journey, health HUD and eight quick slots.
- Portrait/landscape logical canvas dimensions and WebKit touch menu activation.
- Passive capture of trusted `touchstart` and `pointerdown` (`pointerType: touch`)
  events on every natively tapped control, alongside the resulting UI changes.
- Camera inversion and sound-caption settings persisting through a real reload.
- No uncaught JavaScript or WebGL/shader console errors, with screenshots and
  engine diagnostics attached to the report, including on failure.

No WebGL, Worker, startup-state or network mock is used. Production graphics,
security and browser permissions are unchanged. A WebGL startup failure fails
the case; it is never converted to a skip or success.

Touch capability is checked by actual input delivery, not a host hardware count.
The first CI run reported `navigator.maxTouchPoints === 0` after real WebGL,
render/tick progress and portrait startup had passed. Playwright 1.55.1's WebKit
implementation enables `Page.setTouchEmulationEnabled` from `hasTouch` and sends
native taps through `Input.dispatchTapEvent`; it does not require a nonzero
`maxTouchPoints` value. The smoke records that unmodified browser value and the
configured device profile, then requires trusted touch events plus opened/closed
menus and changed/persisted settings. Missing trusted input still fails the case.
No JavaScript-generated touch event or navigator override is used.

The `iphone-webkit-smoke` CI job follows the existing `verify.outputs.game` scope,
downloads `game-dist` from that same verified commit and installs the supported
WebKit binary/system dependencies with `npx playwright install --with-deps webkit`.
The browser also checks the build manifest against the job's explicit PR-head or
push commit, rather than accepting GitHub's synthetic pull-request merge SHA.
It runs one worker, no retries, a three-minute case budget, a four-minute test-run
budget and an eight-minute job budget. It is independent of preview publication.
The full regression job continues to select the two existing Chromium projects;
it does not become an all-browser matrix.

To run the selected engine check in a permitted environment:

```sh
npx playwright install --with-deps webkit
npm run e2e -- --project=iphone-webkit --workers=1 --retries=0 --global-timeout=240000
```

This is Linux WebKit plus device emulation. It does not verify physical iPhone
Safari, iOS GPU/thermal/memory behavior, native browser chrome/safe-area insets,
real orientation sensors, multi-touch game controls or phone FPS. CI results for
the exact commit are the source of pass/fail evidence; adding the case alone is
not a passed browser check.

Primary references:

- [Playwright device emulation](https://playwright.dev/docs/emulation)
- [Playwright browsers and installation](https://playwright.dev/docs/browsers)
- [Playwright CI setup](https://playwright.dev/docs/ci)
- [Native locator taps](https://playwright.dev/docs/api/class-locator#locator-tap)
- [WebKit input implementation, v1.55.1](https://github.com/microsoft/playwright/blob/v1.55.1/packages/playwright-core/src/server/webkit/wkInput.ts)
- [WebKit touch emulation setup, v1.55.1](https://github.com/microsoft/playwright/blob/v1.55.1/packages/playwright-core/src/server/webkit/wkPage.ts)

The actual 548 portrait screenshot also exposed a clipped second mission-hint line. The pending CSS keeps the same card size and touch layout, budgets explicit text line heights, and clamps long hints to two complete lines. Read-only geometry checks now run in both portrait and landscape phases of this real WebKit smoke, plus the Android geometry-only regression. Browser validation of this fix is pending.
