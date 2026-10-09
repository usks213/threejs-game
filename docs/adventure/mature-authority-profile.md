# Mature authority investigation, 2026-10-06

Investigation used an isolated copy of the immutable milestone29 soak source and its actual final checkpoint, with no removed/replaced world entities. The one-line early building-model cache lookup and its regression tests were subsequently promoted to the working candidate; exact publication/aggregate validation is recorded in implementation-status.md.

## Evidence

- Checkpoint SHA-256: `e5d82c997ea9d50a53766d058ca1260fbed8e370af7f8ca253bba3676f45bbc9`.
- 19,686 water cells, 203 buildings, 230 resources, 24 enemies, 6 bodies, 11 edits and one awake wooden block at load.
- Node v24.19.0, esbuild ESM node22 target. Existing `profile-authority.ts`, deterministic four-player input, virtual 30 Hz ingress, all cold ticks/outliers retained. CPU-only investigation: no sockets, persistence, browser, Workers or real-time 30 Hz acceptance claim.
- Baseline server-only 300 ticks: room.step mean 31.696 ms, p95 90.684 ms; simulation mean 14.877 ms.
- Baseline combined 300 ticks: room.step mean 26.953 ms, simulation mean 13.047 ms, eight exact decoded snapshot comparisons passed. Separate execution variance is significant.
- Both 300-tick runs yield the complete game-save digest `815cbec830a5f5ce6cde506660081037aca9ca75dfd8de039bb27b0aa29138df`.
- Node server-only sampled RSS maximum 413,618,176 bytes and final-GC heap 45,955,304 bytes. Node RSS is not a Workers isolate-memory measurement.

## Specific current bottleneck

The baseline CPU tree attributes 771 ms inclusive sampled time to enemy local navigation, 716 ms to its ground-step path, and 407 ms to five-column siteSupport scans over 300 ticks. These are nested numbers and cannot be added. A separate 150-tick diagnostic counted 908,656 density calls, of which 540,472 occurred under Adventure.step (excluding separately instrumented groundAt), versus 109,650 in Skybound volumeClear. This identifies meaningful mature enemy-navigation terrain work beyond the previously studied snapshot-copy path.

Known water/encoding costs still dominate the overall budget: baseline server-only fluid snapshots took 2,143 ms inclusive, fluid simulation 936 ms, water dictionary 940 ms and state encoding 909 ms across 300 ticks. Inclusive nearest/snapshot phases overlap.

An exact query trace ruled out same-tick support memoization: 5,602 support queries in 150 ticks, zero duplicates inside a tick. 2,805 repeated across different ticks and happened to return identical answers; this does not authorize a cross-tick cache that ignores live terrain, buildings, trees or assemblies. No such cache was implemented.

The final checkpoint is not an exact checkpoint at the epoch1/epoch2 boundary, and the bundled profiler runtime differs from the tsx soak. These results do not prove the causal size of the restart slowdown.

## Isolated low-risk candidate

`early-building-cache.patch` adds a one-line early lookup to buildingVoxels. Cached models previously still paid for a linear BUILDINGS.find, roof classification, bounds objects and a fill closure before generate performed its cache lookup. That path accounts for 332 ms inclusive sampling across the mature 300 ticks, from context creation, drops and actor collisions. The candidate returns the same existing model and adds no cache, invalidation logic, geometry changes or retained memory structure.

- All 45 catalog models match exact ordered cells and materials; repeated-call identity and unknown-ID errors pass.
- Warm paired microtest uses the actual checkpoint's 203 building IDs, 10 repetitions per sample, 240 alternating before/after pairs. Per 2,030-call batch mean: 0.372 -> 0.128 ms, p95 1.334 -> 0.246 ms. This is a model-lookup microtest, not whole-room improvement evidence.
- Candidate combined 300 ticks: all eight exact decoded snapshots pass and complete save digest remains identical. Room.step mean 29.612 ms lies between the two baseline runs, so overall speedup is unproven.
- Regression test `voxel-building-cache.test.ts`: exact all-45 model digest, stable object identity, warm lookup bypasses catalog.find and roof/model preparation, unknown IDs still throw. Three checks pass. Negative control on the unchanged baseline fails only the bypass assertion (135 catalog.find calls); its geometry and unknown-ID checks pass.
- Existing voxel foot-surface, obstacle-merge and ray tests: nine checks pass. Existing navigation tests: three pass after restoring the omitted test helper in the isolated harness. Initial missing-helper import failure is retained in its log.

Recommendation: the tiny cache fast path is safe to review/promote separately, but report only its validated narrow improvement. Do not use it to close the 30 Hz, long-run latency, Workers-memory or device gates. Profile files, raw timing JSON and logs are retained; `investigation-summary.json` indexes the findings.
