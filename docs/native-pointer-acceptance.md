# PR4 native relative-mouse acceptance

2026-10-06. The native route uses Ubuntu X11 XTEST through `xdotool`, headed
Chromium and an isolated Xvfb display. This changes only browser acceptance and
CI routing, not the production game.

## Observed result and the menu correction

On PR4 candidate `7e5a7772`, [CI 37396974597 / native pointer job
112058478489](https://github.com/usks213/threejs-game/actions/runs/37396974597/job/112058478489)
reached the unlocked-menu assertion after checking trusted locked relative
motion, both camera axes, native attack, held shield, and menu input clearing.
The case then failed because a relative `+20,+10` move did not reach the page
once Pointer Lock released. This is a failed case with a verified prefix, not a
complete native-input pass.

Pointer Lock can restore the OS cursor outside the page. The corrected case
first moves the actual OS cursor into the browser's measured content area,
then moves it again. It still requires a new trusted, unlocked mouse event
inside the viewport and exactly unchanged camera yaw/pitch. The input-reset,
neutral-resume and attack-after-resume assertions remain. An additional short
movement checks the shared simulation-observed native key-hold adapter.

## Shared desktop campaign input

`tests/e2e/helpers/native-input.ts` provides native relative motion, X11 key
mapping, bounded action taps, real key holds, and read-only event observations.
It never dispatches DOM input events or writes camera, position, health, items,
or simulation state. `mousemove_relative` omits `--sync`, because Pointer Lock
recentering can outrun xdotool's position poll.

`PlayerControls` selects this route only with `E2E_NATIVE_MOUSE=1` on desktop.
A native Pointer Lock movement consumes the production first-event suppression
at each reacquisition. Subsequent corrections require new trusted locked events.
Aim uses the observed sensitivity and current production attack slowdown, with
bounded pixel deltas, the same 12 attempts per axis, 90-second axis budget,
0.015 early stop and strict 0.035 final angle checks.

Native walking holds the OS W key across actual simulation progress. A
read-only listener records simulation time at the trusted keydown. A frame
observer then waits for either the existing waypoint brake or the bounded
simulation duration; it also stops on pause/death. XTEST releases the key before
renderer-dependent readback and cleanup. This avoids a short wall-time pulse
being pressed and released entirely behind one slow frame. The 24/120 pulse
bounds, five waypoint corrections, 0.18 m final arrival, 60-second segment
budget, and existing finite gathering/combat limits are unchanged. The game
clock and movement speeds are not changed.

Held movement, shield, heavy charge and action keys use XTEST in native mode.
Opening a campaign menu releases OS-held inputs and clears the driver's held
state. Headless runs retain the keyboard-look/CDP fallback. The prototype's
existing synthetic mouse regression branch remains only in fallback mode;
its native branch uses actual XTEST motion/buttons. Input annotations and
regional evidence identify the active transport explicitly.

## CI routing and evidence limits

`scripts/run-native-browser.sh` gives each desktop job one display, one worker,
headed Chromium and zero retries, after verifying XTEST. It preserves command
arguments and exit status. Definition listing bypasses X11.

The desktop matrix, first chapter, ranged builds, regional campaign, streamed
campaign, and focused native-pointer job use this wrapper with Ubuntu's official
`xdotool`, `xvfb`, `xauth`, and `x11-utils` packages. Android jobs, the Android
contact preflight, and multi-page cooperation remain on their existing routes.
Job deadlines are unchanged. No browser security setting or flag was added.

The focused case attaches event delivery and state checkpoints in
`native-pointer-input.json`; campaign drivers attach their bounded native
motion observations. Existing screenshots and failure traces are retained.
These additions still require execution at the next integrated PR4 commit.

XTEST is OS-level input emulation, not a physical mouse, hardware GPU,
Android/iPhone device, human playability or performance result. Held-shield
checks observe production block input; the existing duel cases retain enemy
hit/mitigation assertions. The successful [PR5 transport
job](https://github.com/usks213/threejs-game/actions/runs/37390246811/job/112034474174)
remains separate historical evidence, not a PR4 campaign pass.

Local checks for this change: strict TypeScript passes; 32 targeted tests across
native-input, keyboard-pulse, prototype-input, input-observation and browser
routing suites pass. Thirteen desktop cases across the affected focused/long
paths are discovered, and desktop/Android campaign group discovery remains
intact. Workflow YAML, shell/runner syntax and unchanged job deadlines are
checked. No local browser, full suite, build, push or external write was run.
