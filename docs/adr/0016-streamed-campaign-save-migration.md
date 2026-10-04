# 0016: Certified legacy saves and streamed sample overlays

Status: migration/adapter stage only. No production Core, app, or storage-default switch.

## Identities and representation

The frozen legacy authoring fingerprint is `campaign-v2:c1602605`. Its certified sample
provider is `campaign-samples-v1/c1602605`. No other legacy baseline is inferred or accepted.
The full-authoring/provider parity test must continue to certify this relationship.

`StreamedCampaignField` exports a VoxelState-compatible version-1 geometry envelope with
that new manifest as `baseline` and a required `suppressed` array. The candidate campaign
uses `world: campaign-v3`. Distances remain absolute JavaScript Float64 numbers; the migration
never quantizes distances, converts to voxel occupancy, or changes material IDs/layer order.
Base edits, object edits, explicit deleted-sample keys, and player-created layers survive.

Whole authored objects omitted by the legacy layer order become suppression tombstones.
Legacy removed-and-recreated IDs already list every absent original sample in `removed`;
those keys and the exact current order remain intact. Later streamed remove/recreate uses
whole-layer suppression plus new overrides. Cache eviction affects neither representation.

The existing grapple anchor compatibility repair is an ordinary same-ID overlay after the
frozen baseline. Migration preserves those exact deltas. It does not recapture repairs or
player changes as authored baseline.

## Staging APIs

- `migrateLegacyCampaignField` validates and converts only the certified geometry DTO.
- `prepareLegacyCampaignMigration` stages geometry and all gameplay component validators,
  then returns a detached v3 candidate. It never changes the source, live world, or storage.
- `StreamedCampaignField.restoreState` accepts only its explicit manifest envelope, supports
  dry-run validation, and rejects malformed input without changing revision/dirty state.
- Legacy baseline capture, full-world packets, legacy bootstrap, and authoring generators
  are deliberately blocked on the new adapter. Core/app integration must opt in explicitly.

## Original-save preservation and future commit order

1. Pause the selected v2 world and stage/validate the complete candidate.
2. Call `preserveLegacyMigrationBackup(storage, legacyKey)`. It copies exact original envelope
   bytes to `legacyKey:migration:campaign-samples-v1:c1602605`, verifies the write and checks
   that the source has not changed. An existing different archive is never overwritten.
3. If backup/verification/quota checks fail, keep the v2 world and source selected; report the
   blocker. Do not clear either source or archive.
4. Commit the verified candidate to a separate v3 store/key and verify that write. Ordinary
   v3 `:backup` rotation must never touch the dedicated migration archive or old v2 primary.
5. Only after successful commit, select v3 durably. Keep that format-selection marker through
   New Game/reset; a missing v3 primary must not silently re-import the retained old v2 world.

Stage B intentionally performs neither steps 4–5 nor any automatic erase/selector change.
No connection identifiers, resume credentials, or room permissions are introduced.

## Proofs

Migration tests cover mining, burning, removed/recreated authored objects, opened crafted
doors, layer order, hidden/positive-band samples, signatures, inventories and loose resource
conservation, provider-cache eviction, live door operation after migration, grapple repair,
unknown fingerprints, malformed atomic rejection, and a write-once archive surviving rotating
autosaves and storage failure. Provider tests separately certify full authored-sample parity.
