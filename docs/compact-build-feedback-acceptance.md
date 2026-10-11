# Compact construction HUD acceptance

2026-10-06. PR #4, compact landscape Android-emulation correction.

## Observed defect

The actual `build-with-active-fire-568.png` from run 37401433433, artifact
11386271461, showed the target/prompt card at x174–394, y172–225 overlapping
recipe cost at x12–308, y165–191 and combat resources at x12–300, y196–220.
The separate top instruction row was already readable.

## Change

- Preserve the top instruction and danger/status zones.
- At widths up to 600px in touch construction, place recipe cost and the complete
  combat readout in one row and dock target, material durability/reactions, and
  prompt between the movement and combat controls, above equipment.
- Keep 12px type and controls at least 48px. Compact controls use a 6px bottom
  margin, increased by any safe-area inset, and the equipment starts after the
  movement pad to accommodate the equipped rake label.
- Restore material details in compact construction. Soil filling uses the same
  zones, with a persistent touch instruction and its owned/required soil and
  undamaged-removal refund rule visible. The generic inventory summary is
  replaced by these relevant material costs while building/filling.
- Remove repeated collection/placement prose from the mobile cost row; retain
  workbench proximity, costs, owned quantities, target details, and the complete
  mana/focus/unlock readout. No target text is hidden or ellipsized.

## Checks

Passed locally: TypeScript, production build, 17 focused campaign-HUD and
combat-resource unit tests, and discovery of eight desktop/Android browser
cases across campaign HUD, hazards, and soil filling. The build retains the
existing large-chunk warning.

Browser cases now require real nonempty target/material/prompt strings, check
12px fonts and unclipped text, and compare the actual feedback rectangles
pairwise against cost, combat resources, status, menus, building buttons,
movement, equipment and combat controls. Every visible control is checked for
48px bounds and overlaps. HUD and soil-fill cases cover 844×390 and 568×320;
the active-fire case covers 568×320. Player movement/aiming remains real input.

Actual browser execution and new screenshots are pending the integrated commit's
CI. No local browser was launched because of the known socket EPERM restriction.
This does not claim a local browser pass, physical Android/Safari acceptance,
or every possible long target string/safe-area combination. The next CI run
must run the repository aggregate unit suite and these real browser cases.

The compact soil cost row contains only required/owned soil. The complete
undamaged-removal refund rule remains in the top soil instruction. This avoids
repeating the same sentence beside the full combat resource readout and leaves
space for the actual target/material/preview card. Browser checks remain strict.
