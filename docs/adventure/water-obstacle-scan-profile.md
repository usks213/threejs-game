# Exact water-obstacle scan bounds

2026-10-06. The current four-player public preview is still below 30 Hz. This change targets measured fixed-obstacle compilation work without a cache, changed geometry or relaxed water fidelity.

## Diagnosis

Stable local four-player runs separated simulation, snapshots, encoding and Node GC pauses. The two worst co-located steps were 105.86/104.98 ms with zero recorded GC overlap; water-obstacle refresh accounted for 30.30/34.98 ms. Ordinary steps averaged 3–4 ms, while every-third-step broadcasts averaged 37–49 ms. These are local timings, not Worker CPU/heap measurements.

Exact callsite tracing found 19 fixed-key recompiles in 100 measured obstacle updates. Every obstacle-refresh spike above 5 ms was in static compilation (10.37–33.52 ms); four dynamic player hulls averaged 0.11 ms. Unchanged buildings enter/leave the 48 m interest boundary. A second compiled-map cache was rejected:14 distinct keys recur too little, saving only 1/19 rebuilds while retaining another 10,675 map/set entries.

## Narrow algorithm change

Yaw-only boxes previously scanned both horizontal axes using the diagonal radius hypot(hx,hz), including many empty columns around thin walls. Tighten each extent to the rotated box AABB, with outward floating-point padding and a clamp to the original radius. Preserve lower exterior cells because positive edges can enter a thin solid from outside.

The original occupancy probes, segment intersections, quaternion path, fractional overlaps, insertion order, refresh/invalidation and memory retention remain unchanged. Use the fast path only on 0.5/1 m grids with finite positive boxes and conservative safe quarter-cell indices. Generic decimal grids, nonpositive/unusual inputs and large coordinates retain the exact original loop: decimal repeated addition can otherwise change string coordinates. No obstacles or visible water cells are dropped, and no simulation/broadcast cadence is changed.

## Measurement

All 14 measured fixed-key arrays were recovered with matching hashes. Final padded bounds visit 43.7–44.3% fewer loop cells. The guarded-source compile comparison uses 168 alternating pairs: mean 12.35→8.53 ms, p95 16.41→12.20 ms. All samples are retained.

A paired full-room comparison of the padded algorithm (before the final domain guard, which leaves all measured production boxes on the same path) preserved 800 exact water/gameplay frames and both complete saves. Each side/layout also passed final independent authority/decode checks.

| Co-located metric | Baseline ms | Candidate ms |
| --- | ---: | ---: |
| Obstacle refresh p95 | 19.23 | 8.99 |
| Broadcast p95 | 73.11 | 60.25 |
| Room mean | 15.84 | 15.44 |
| Room p95 | 52.08 | 50.88 |
| Room maximum | 77.36 | 83.60 |

Spread-room mean was effectively unchanged 15.617→15.610 ms, and its p99/maximum were slightly worse. The result supports reduced obstacle work and a targeted broadcast-tail improvement; it does not establish universal latency improvement, public 30 Hz, or physical-device smoothness.

## Validation and limits

The guarded candidate passed 2,423 exact ordered-output comparisons, including rotated/overlapping thin slabs, negative coordinates, ±ULP probe boundaries, quaternion mixtures, generic-size and large-index fallback, edits, movement, deletion and restore. A frozen pre-change oracle is retained in tests; committed checks compare unsorted occupancy/barrier collections, including the concrete decimal-grid counterexample. Existing water/quaternion tests remain intact.

[Measured evidence](../benchmarks/water-obstacle-scan-2026-10-06.json). Integrated type/unit/build and exact-SHA public CI are separate gates. Node phase/GC data cannot establish actual Worker CPU, peak heap or 128 MiB compliance; no dashboard access was used.

Local integration:17 focused water/geometry tests and type/build passed. The aggregate run had1,028 passes and3 default5-second timeouts (debug-flight cleanup, hold/rescue and PBR); the same17 tests across those three files passed on a focused rerun without changing assertions or timeouts. The failed aggregate receipt is not counted as a full pass; exact-SHA CI is the remaining aggregate gate.
