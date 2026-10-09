# Play-quality repair: first goal, fair combat, and recovery (2026-10-09)

## Evidence and diagnosis

This is a source-backed design/logic diagnosis, not a claim of a completed ten-minute human play session. Local commit `125de48` and remote `575a8ec8` were explicitly verified to have the same tree `909e0869f3decc7e415b0d4e8dd224277987702e` before edits. Existing audit files are preserved separately.

- The main HUD followed a strict walk/dig/pickup/assembly/dummy-rescue practice sequence. Earlier actions did not advance later practice stages, although those stages were not prerequisites for lighting the first beacon. This presented busywork as the main objective and could keep showing an obsolete instruction.
- The ability panel combined 13 part types and dozens of construction, movement, equipment, blueprint and device controls in one long form. Finding the next relevant command required scrolling past unrelated actions.
- The next beacon pointed directly at a sky-island center instead of the approach ramp. Grave recovery did not take precedence in generator 4, even when equipment was lost.
- A locked-looking ordinary melee tell still damaged the target based on its new position without a directional hit sector. Projectile hits omitted the source required by directional shielding.
- Solo fatalities waited through a cooperative rescue timer even with no companion. Death also removed the essential glider, making recovery on a vertical route disproportionately frustrating.
- Gliding had no low-stamina or forced-closure warning.

## Changes

The main objective now derives from inventory and real construction: recover the nearby wood cache, make two beams, join them, then light the first beacon. Optional practice remains available in the guide. Graves take priority; the sky goal provides ramp entry/top and ascend guidance. Initial shared supply piles are ahead of the starting view; existing saved piles are not relocated or duplicated.

Ability commands are grouped into Assembly, Movement, Fusion, Plans and Devices/Camp. An explicit stack-on-selected-part draft makes the second piece placeable without closing the menu to re-aim; it still consumes normal materials on confirmation and needs manual grab/glue. Tilted structures or narrower replacement shapes may still need manual alignment; the helper does not promise automatic joining. Commands remain authoritative. Switching pages cancels uncommitted previews, and the preview is brought into view. Held-part renewals, safe reconnection behavior, private cargo and blueprint ownership remain unchanged.

Ordinary melee uses a shared committed-direction sector for warning and damage. A depth-tested 3D direction arrow remains above the creature when slopes hide part of the floor sector. Ranged attacks retain their existing behavior except that the incoming direction is supplied for shield checks. Solo deaths enter the existing three-second respawn; cooperative rescue remains available. The exact owned glider equipment lots are retained without granting or duplicating gear. Previous graves preserve equipment identity and have aimed, authority-validated interaction IDs bound to their current location and contents; stale IDs reject and partial recovery leaves overflow. Low gliding stamina and forced wing closure have explicit warnings.

## Verification

Focused goal tests cover actual assembly state, out-of-order optional practice, grave recovery after the ending, ramp steps and a real safe ascend exit at the ramp top. Fresh-arrival browser acceptance uses the generated world and native camera input and aimed interaction for cache pickup, then normal controls to create and join two beams, walk to the beacon and light it, without injected materials or coordinates. Separate browser cases cover page switching, cancelled preview/no created part, blueprint access, native menu scrolling and existing compact-phone controls.

The frozen final candidate passed typecheck, all 1,074 non-socket tests across 220 files, production build and diff whitespace checks. Socket integration was excluded locally because this execution environment cannot create its required sockets; exact-commit CI remains responsible for real networking and browser evidence. The build retains its existing large-chunk warning. Exact-commit browser/public-preview results are pending. A passed logic suite does not establish enjoyable combat, ten-minute pacing or physical-phone FPS. Local Chromium cannot start because process sockets return EPERM, including one reviewed escalated launch. No rendering or input pass is claimed from that attempt. Cloudflare co-op persistence remains a separate unresolved public-service verification gate; this batch does not weaken save-before-acknowledgment behavior or request new credentials.
