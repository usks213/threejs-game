# Compact water coordinate allocation

2026-10-06. This is a small, measured encoder optimization. It is not a demonstrated improvement to public four-player tick rate, tail latency or gameplay smoothness.

## Reason to inspect this path

The exact e0b53f55 preview completed all functional CI checks, but its latest four-client/60-second measurement was 11.99 Hz against a 30 Hz target. Prior identical gameplay/server logic produced different measurements; the preceding input-only fix is not a demonstrated cause.

An unchanged fresh-world four-player local profile over 300 ticks measured room.step mean 19.61 ms, p95 66.69 ms. Simulation accounted for 2,254.7 ms of 5,881.5 ms total; remaining broadcast/room work was 61.7%. Water snapshot cost 1,606.3 ms; water dictionary 521.9 ms; sampled compact encoding approximately 459.8 ms (7.8%). Inclusive nearest-selection timings must not be added to their parent phases. This profile excludes sockets and persistence and does not measure Worker CPU or heap.

Previous shared-snapshot caches and scheduler experiments did not establish a worthwhile improvement. They remain excluded.

## Narrow change

The compact encoder used coordinate strings solely to detect duplicate or overlapping cells. After the same coordinate/tuple validation, use the existing mixed-radix numeric addressing technique already used by FluidWireEncoder. Each coordinate is a half-cell grid digit within WORLD: x/z have 4,001 values and y has 129. The maximum address is 2,065,032,128, exactly representable as a safe integer.

Only temporary duplicate-check keys change. Canonical removal strings are still validated first; malformed, out-of-range and non-grid tuples are rejected first. Existing string keys and numeric Set keys both treat +0/-0 as the same coordinate, while unchanged tuple flags/Float64 serialization retain the original signed zero. Decoder, precision, bytes, limits, ordering, cadence, water physics, saves and authority checks are unchanged.

## Measurement and fidelity

1,600 alternating pairs replayed 400 actual production four-player deltas. All four rounds improved encoder mean (23.6–29.0%); all samples were retained.

| Encoder metric | Baseline | Candidate |
| --- | ---: | ---: |
| Mean ms | 1.162 | 0.861 |
| p95 ms | 2.692 | 2.012 |

There were 1,600 exact byte comparisons, 24,528 accepted parity cases and 73 matching rejections, including all 24,001 millimetre velocities, boundaries, full-size frames, malformed values and signed-zero duplicates.

A separate paired 300-tick full-room experiment matched all 400 compact water packets and decoded gameplay frames. Each side passed eight independent authority/decode comparisons; both final saves match SHA256 `27b22b20d20748c2e29634632185d9ccc55a16bc4c3e9c5541874d380931e9b4`.

Whole-room mean changed 25.77→24.77 ms, but p99 worsened 145.26→163.53 ms and broadcast p95 worsened 139.76→152.89 ms. Ordinary ticks also changed despite identical code, showing timing noise. Comparisons allocate outside the timed step and may affect GC. Consequently the whole-room result is inconclusive; do not turn the narrow 25.9% encoder improvement into a game-speed claim.

The initial whole-room harness stopped on legitimate receipt/performance-counter differences. The corrected comparison excludes only transport receipts and three profiling counters; every gameplay field and water byte remains checked. The raw initial failure is retained in the work evidence rather than called a game failure.

## Regression coverage and limits

Existing compact-codec tests stay intact. Added tests pin the baseline encoded-byte hash at world corners/stride edges/fallback values, verify Object.is signed-zero round-trip, and check 343 distinct boundary-neighborhood cells plus duplicate/canonical/malformed rejection. The safe-integer domain is asserted so an expanded WORLD cannot silently exceed the address proof.

[Measured data](../benchmarks/compact-water-numeric-2026-10-06.json). Integrated type/unit/build and exact-SHA CI/public measurement remain separate gates. Actual Worker CPU/heap, 128 MiB acceptance, physical-phone FPS and sustained public 30 Hz are still unverified or unmet.
