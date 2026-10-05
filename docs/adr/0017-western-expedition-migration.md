# 0017: Western expedition migration contract

Status: local opt-in session/store integration. The v3 factory, manifest and defaults remain unchanged. App integration and browser certification are separate stages.

## Explicit identities

- Source: `world: campaign-v3`, manifest `campaign-samples-v1/c1602605`.
- Candidate: `world: campaign-v4`, manifest `campaign-west-expedition-v1`.
- The v3-specific store validator rejects v4. Manifest-aware hydration selects a separate western runtime only for an explicit v4 envelope.

Activation must use a manifest/roster registry. Do not infer compatibility from a common
backend or quietly accept 22 actors under the old identity. Registry entries must bind the
world version, immutable authoring identity, object catalogue, actor slots/definitions and
progress validator. Future authoring, roster or progression changes require a new identity
and explicit migration. Freeze a target authoring certification before activation.

## Geometry preservation

`createWesternMigrationContext` records western operations separately and appends them to
the immutable source provider. No global factory is modified. Seam routes intentionally
change some previously authored terrain near the old forest/mesa entries.

`prepareWesternFieldMigration`:

1. Validates the exact source manifest and source sparse envelope.
2. Verifies that the target retains every original authored layer in its original prefix.
3. Preserves every absolute distance/material tuple, deleted sample key, suppression
   tombstone and saved layer order. Existing order is the prefix; new authored IDs append.
4. Rejects collisions between a new authored ID and an existing custom layer.
5. Queries each existing edited coordinate against source and migrated composition.
   If new baseline geometry would alter it, returns `content-overlap` (up to 16 diagnostic
   samples) without changing either save or live field. It never silently buries construction
   or cuts a new gate to force acceptance. Content relocation or a separately reviewed
   conflict-resolution policy is required for such saves.
6. Keeps new default geometry only where it does not violate those saved edits. Cache
   eviction changes neither overlays nor tombstones.

## Actors, quests and resource accounting

Slots 0–17 and their entity material/reward budgets remain exactly unchanged. In particular,
summon slots 15–17 must not move. Append the agreed stable mapping:

- 18 / definition 201: `west-axeguard`
- 19 / definition 202: `west-lookout`
- 20 / definition 203: `west-pitguard`
- 21 / definition 204: `west-orewatch`

Do not append these to the old pre-summon construction loop and thereby renumber reserves.
The v4 validator must distinguish the three reserve slots from all ordinary/western actors,
validate exact per-slot HP/ownership limits, and stage all 22 body states atomically.

Existing CampaignState, inventory, equipment, home jobs, claims and completed quests copy
unchanged. `WestExpeditionState` is a separate versioned member with no claims, defeats,
completed quests, route visits or camp/gate unlocks initially. Existing base progress supplies
access requirements; migration awards no XP, materials, items, or completed quests.
New objects append their authored closed/unclaimed defaults; existing object flags are not
reset. No new currency/item IDs are introduced.

Whole preparation uses the existing v3 hydration validators on a fresh sparse Core, then
returns a detached `candidate` and a diagnostic `plan`. A source already carrying western
state is rejected rather than resetting its claims. Migrating the candidate again is rejected.

## Required activation transaction

1. Pause v3 and capture the exact source bytes/revision.
2. Stage the complete v4 candidate, including West ledger and geometry consistency.
   Validate important new-object/actor clearances against migrated geometry before exposing
   gameplay. Existing safe-position recovery remains a hydration decision, not a terrain reset.
3. Write/verify a dedicated, write-once
   `ash-campaign-v3:migration:campaign-west-expedition-v1` archive. Retain the v3 primary and
   the older v2 primary/archive. Abort if the source changes or storage/verification fails.
4. Write/verify v4 at a separate key such as `ash-campaign-v4`.
5. Only then select v4 durably. Preserve that selector through New Game so a missing/reset
   v4 primary cannot automatically resurrect v3. Unknown/future identities must remain blocked.
6. Hydration stages the West ledger and a temporary edited field together. Reject an
   opened-ledger/closed-gate mismatch before mutating active state. Reconciliation must not
   recreate claimed resources or a player-damaged gate and must never award rewards.
7. Co-op invitations and handshakes must select the same manifest/roster before applying
   full snapshots or actor frames. The save migrator is not a way to accept a newer peer's
   incompatible live payload. No room ID, resume key or edit permission enters the archive.

The isolated helper is now used by the explicit opt-in v4 session/store path. Steps 3–6 are implemented with a dedicated write-once archive, separate key, durable selector, staged geometry validation and 22-actor registry checks. App invitation/handshake wiring remains separately owned. The default remains the previous world unless opt-in or a verified stored selector chooses v4.

## Existing proof coverage

Tests preserve seam carving/deletion, authored-object removal/recreation, custom construction,
layer order and cache-eviction behavior; reject content overlap, ID collision and unknown or
malformed sources; verify old18 actor/entity records and all game ledgers remain unchanged;
verify fresh West defaults and appended slots; and verify the old v3-specific store guard refuses v4. Session/store tests additionally cover v4 terrain and companion round trips, wide map pins, atomic gate mismatch rejection, shared-snapshot local actor preservation, migration write failures, future identity protection and New Game non-resurrection.
