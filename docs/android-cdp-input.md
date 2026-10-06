# Android Chromium contact delivery

Use the normal CDP TouchEmulator path in Playwright 1.55.1's pinned Chromium
140.0.7339.186. Do not enable `SyntheticPointerActions`: that alternative path
delivers raw touch pointers without the gesture recognition needed by menu
buttons' ordinary click handlers on the Linux runner.

## Actual failure and source diagnosis

At public commit `2b9702b2`, [CI run 37392317338](https://github.com/usks213/threejs-game/actions/runs/37392317338)
failed both Android bow/staff routes before starting play. Artifacts
`11382018538` and `11382212510` show three successful `#quality-toggle.tap()`
calls at visible point (340, 350), but every subsequent probe and button snapshot
remained `balanced` / 標準. Both hit the unchanged 60-second assertion timeout.
Other observed pointerdown combat controls still worked. This was a transport
regression, not a reason to change game input or replace touch with mouse/keys.

The pinned implementation explains that distinction:

- [Synthetic debugger touch delivery](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/renderer_host/input/synthetic_gesture_target_aura.cc#L147)
  calls the window delegate directly, bypassing
  [Aura's gesture-recognizer preprocessing](https://github.com/chromium/chromium/blob/140.0.7339.186/ui/aura/window_event_dispatcher.cc#L1075).
- [Normal CDP injection](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/devtools/protocol/input_handler.cc#L1598)
  enables TouchEmulator. Its [gesture provider recognizes and forwards taps](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/renderer_host/input/touch_emulator_impl.cc#L286),
  which [Blink uses to dispatch click](https://github.com/chromium/chromium/blob/140.0.7339.186/third_party/blink/renderer/core/input/gesture_manager.cc#L346).
- [SyntheticPointerActions is disabled by default](https://github.com/chromium/chromium/blob/140.0.7339.186/content/public/common/content_features.cc#L1249)
  in this pinned browser. Removing our override restores the normal path.

Playwright sends a tap's start/end concurrently, but Chromium queues synthetic
gestures in order. Sequentializing those calls alone would still bypass gesture
recognition. Ordinary `locator.tap()` remains unchanged. The quality helper now
requires each real input to change the observed setting before another attempt.

## Contact contract

The [normal event constructor](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/devtools/protocol/input_handler.cc#L466)
uses changed-contact semantics:

- `touchStart` begins the first contact.
- `touchMove` adds unknown IDs or moves existing ones. Omitted IDs stay held.
- Partial `touchEnd` contains only the saved point being released. Other held
  contacts remain stationary; only the supplied ID is removed.
- Empty `touchEnd` releases all remaining contacts.

The serialized contact helper uses this contract to preserve movement/shield
through repeated look, jump, dodge and cast gestures. Unit tests independently
model the native changed-contact rules. The separate Android preflight requires
trusted quality/start/pause clicks, repeated actual look/action gestures and
movement release while the shield remains held. No production handler, DOM
event injection, keyboard fallback, resource grant or game-state write is used.

The source diagnosis and focused checks are not a browser pass. This executor
did not retry its known Chromium launch socket EPERM. Exact-commit CI must
verify menu taps and retained contacts together before accepting this fix.
Android emulation does not certify physical Android or iPhone Safari.
