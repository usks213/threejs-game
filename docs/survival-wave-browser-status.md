# Survival wave browser acceptance

## Published 1cf73b73: terminal CI

Run: https://github.com/usks213/threejs-game/actions/runs/37309390739

Exact preview SHA `1cf73b73d2687c4599f021619f95d0c4cc0c8ef2` and relay protocol 4 were verified at 2026-10-05 12:34:52 UTC (deploy job 111764289460, release artifact 11345353641). GitHub passed 998 tests in 120 files, typecheck and build. All 33 jobs finished: 22 succeeded, 10 failed, one production-only job was skipped. Browser-only totals: 20 succeeded, 10 failed.

New positive evidence includes the complete Android first chapter (normal gathering, rescue, equipment, grapple/glide, warden and ridge), Android vault, desktop input/codex/settings/UI, and desktop finite soil plus western resident cases. Android chapter evidence: artifact 11346219704. Save/file transfer and invitation/west migration passed on both browser projects. Physical devices remain unverified.

Remaining failures are desktop streamed/short campaign/first chapter/equipment/vault/watermill, Android baseline multitouch/soil/watermill, and cooperation. Trace findings: a multitouch test struck and broke the door before trying to open it; movement drivers accepted a signed waypoint crossing even after overshoot; delayed coarse look key release left a large correction at the fine rate; the unprepared watermill route died against the warden; the cooperative build key received a synchronous pre-send synchronization refusal. Local driver corrections retain actual input, survival/resource/precision assertions, no-queue semantics and original time limits. They are not public browser passes. The desktop first chapter also spent only about five simulation seconds in a 90-second guard wait; a closer safe engagement point now has a Core regression keeping the warden unaware.

## Previous published f05ccbe


Published checkpoint: `f05ccbe7337d0df2fb51f0d3d1b0bf6835c64523`.
GitHub Actions run: https://github.com/usks213/threejs-game/actions/runs/37303399135
Preview release artifact verified the exact commit and relay protocol 3. Unit/integration verification passed 939 tests; typecheck and production build passed.

Browser acceptance is incomplete. Android-equivalent Chromium passed equipment/tool crafting, codex/controller settings, campaign UI, short campaign, save/file transfer, west/invitation migration, streamed migration and elemental cases. Desktop passed save/file transfer, invitation/west migration, duel, authored motion, SDF and elemental cases. These are emulated browsers, not physical Android/iPhone/gamepad acceptance.

Failures and changes prepared for the next release:
- Desktop keyboard fine-look waits expired across routes. Traces showed about 0.8–1.2 s between animation frames despite approximately 6 ms JavaScript render submission. Held input polling now has a visible-page timer, independent of presentation. Solo physics still advances through its original RAF clock.
- A desktop attack finished during slow input acknowledgements. A read-only observer installed before genuine input records actual windup/strike/recovery, with cleanup; the test still requires completion and correct aim.
- Two-player join/chat, genuine guest movement and host agreement passed. The later denial notice was present in the trace but expired before assertion. A read-only DOM observer now records that actual notice; permissions and the denied action are still checked.
- Android first-chapter gathering reached 10 grass while another 10-unit physical drop lay outside pickup reach. The driver now approaches nearby fallen resources with ordinary walking; inventory requirements remain unchanged. Movement start is sampled after aiming to account for real inertia.
- Android vault mining cleared one sampled voxel while the actual key ray still hit crust. Acceptance must mine until the key itself is exposed; production now requires actual crust depletion and a freshly validated ray to the real key surface.
- The desktop UI job hit its overall time limit. It is not counted as passing.

The next wave adds optional saved western NPC lives, finite soil fill, and flow-powered weaving. Those features require a new combined verification run and separate public browser acceptance. Protocol 4 rejects older peers before authority assignment; single-player save compatibility remains separately tested.
