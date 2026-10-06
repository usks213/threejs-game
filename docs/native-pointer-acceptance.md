# PR4 native relative-mouse acceptance

2026-10-06. This adds a dedicated acceptance definition and CI job; PR4 browser
execution remains pending. It does not modify the production game or replace
the existing keyboard-look and synthetic-event regression cases.

`native-pointer-browser` downloads the same verified build as the normal browser
matrix, installs Ubuntu's `xdotool`, and starts headed desktop Chromium on its
own Xvfb display with XTEST available. One worker runs only
`tests/e2e/native-pointer.spec.ts`, with zero retries and `E2E_NATIVE_MOUSE=1`.
The spec skips normal headless and Android runs.

The case starts the existing trial through its actual menu, selects the existing
performance preset, and acquires real browser Pointer Lock. The initial ignored
movement after lock is consumed with native XTEST input. Subsequent relative
moves must produce trusted locked mouse events and change both yaw and pitch in
both directions. Native left/right buttons must start an attack, maintain shield
input across simulation frames, and release the shield. Opening the menu while
movement and shield remain held must unlock and clear both inputs; unlocked
movement must not rotate the camera. Resume must leave movement neutral and
accept another native attack.

Mouse motion and combat buttons use `xdotool` XTEST events. Start/menu clicks and
keys use Playwright. Browser-side code observes event delivery and the existing
read-only input probe; it never dispatches a synthetic mouse event or writes
camera, health, inventory, position, or simulation state. `mousemove_relative`
intentionally omits `--sync`, because Pointer Lock recentering can otherwise
leave xdotool waiting indefinitely. Event delivery, state checkpoints and errors
are attached as `native-pointer-input.json`, alongside the screenshot and normal
failure trace.

This route follows the independently successful PR5
[desktop-controls job](https://github.com/usks213/threejs-game/actions/runs/37390246811/job/112034474174)
(three cases, zero retries). That result validates the CI transport on PR5; it
is not a passing PR4 result. PR4 needs its own run at the integrated commit.

XTEST is OS-level input emulation. It is not a physical mouse, hardware-GPU,
Android/iPhone device, human playability, or performance acceptance result.
The trial's held-shield check verifies production block input, not a new
enemy-hit/mitigation acceptance; the existing duel cases retain that scope.

Local verification for this addition: strict TypeScript passes; the routing,
prototype-input and input-observation suites pass 15/15 tests across three
files. Playwright discovers one case with the dedicated job's flags, and the
existing five prototype cases remain discoverable for both projects. The YAML
parses successfully and all new job shell steps pass `bash -n`. No local browser
launch, full suite, build, push or external write was performed for this change;
browser execution and aggregate integration checks remain separate gates.
