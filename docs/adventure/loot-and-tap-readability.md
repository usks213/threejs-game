# Loose loot and ordinary touch attacks

## Observed problems and bounded changes

At the untouched spawn, loose stone and resin were rendered with full deposit geometry. The fixed-medium WebKit image at `60d45c3587c2384a946e8d06075fb49d0aca278a` hides most of the avatar behind these foreground piles. `b04807c5ea78193edaedbd69e6c3f87a71f85aa3` scales only bulky loose item instances around their existing saved anchors. Natural resources and already hand-sized wood, flint, mushroom, flower and fish pickups keep their size. Node IDs/counts, saves, physics and generous interaction targeting are unchanged.

The actual auto/fixed-medium WebKit images for b04807c5 show the avatar torso/legs and adjacent ground clearly; stone remains recognizable. The nearest gold-colored pickup can still sit partly under the hotbar. These are Linux WebKit screenshots, not physical-phone performance evidence.

## Native attack diagnosis

CI [37466884073](https://github.com/usks213/threejs-game/actions/runs/37466884073), Android `shoulder aim, weapon contact` case, records passive DOM input, outgoing Worker actions, snapshots and notices. The test does not synthesize DOM clicks or alter production input/state.

| Browser time, ms | Observation |
| --- | --- |
| 10588.2 | Trusted touch pointerdown, pointerId 3 |
| 10588.7 | First attack sent with latest snapshot tick 192 / attack 0 |
| 10589.3 | Pointerup and lostpointercapture |
| 10615.1 | Trusted compatibility click: same pointerId 3, touch, detail 0, firesTouchEvents true |
| 10615.5 | Duplicate attack sent, still snapshot tick 192 / attack 0 |
| 10668.4 | Authority notice: 攻撃 |
| 10668.7 | Authority notice: 操作の間隔を空けてください |

Release occurs before the 120 ms hold interval. This is a duplicated compatibility-click activation, not normal hold repetition. The authority correctly rejects the duplicate; changing its cooldown or hiding all warnings would conceal the cause.

The fix shares the existing pointer-aware compatibility-click filter with `holdAction`. Capture, held class, initial action and then repeat timer keep their original order. Genuine keyboard/accessibility clicks remain supported without starting a hold timer. Water hold repetition and dynamic repeat predicates remain unchanged. Pointer cancel, capture loss, blur, resize, hidden document and abort still stop the timer.

The two new duplicate-touch regressions fail on the old handler. The final browser case retains its trace and requires one outgoing attack for one native tap, actual enemy damage and no duplicate-action warning. Final corrected-browser evidence is pending the next exact-SHA CI run; b04807c5 diagnoses the old behavior, not the fix.

## Limits

This repairs a visible obstruction and a misleading response to an ordinary tap. It does not establish combat enjoyment, physical Android/iPhone FPS, 30 Hz four-client performance or actual Worker heap usage. No cooldown, save schema, resource quantity or server admission rule is weakened.
