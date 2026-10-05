# Q08 long-session acceptance

## Scope

`tests/unit/campaign-soak.test.ts` separates two kinds of evidence:

1. One streamed campaign (`campaign-v3`) starts with the unmodified player and empty inventory. The existing `NormalPlayer` first-chapter route gathers materials, activates the hearth, fights, rescues the artisan, crafts and equips travel/combat gear, grapples and glides, upgrades the flame and reaches the ridge camp. Subsequent circuits use the normal travel transaction to return home, conserve materials through storage, pay for and undo an intact workbench, cast water and lightning at retained metal, and walk an exterior circuit.
2. A separately authored small rendering fixture visits three distant sets of geometry eight times each. It verifies bounded provider caches, unchanged-frame mesh reuse, geometry disposal on eviction, and material disposal at shutdown. It uses Three.js CPU geometry without a renderer or WebGL context.

The campaign advances exactly 18,000 ticks of `1/30` second, for ten **simulated** minutes. There is no large-delta fast-forward, resource/HP/coordinate grant, repeated resource respawn, world replacement, or artificial particle clearing. The player helper's short-test CPU watchdog is replaced only for this test by a deterministic frame bound. Test-runner timeouts are safety limits, not performance acceptance thresholds.

The campaign event queue is consumed with `events.splice(0)` after every tick, matching `src/prototype/app.ts`. Unconsumed event accumulation in a headless harness would not represent the application's normal lifecycle.

## Checks

- Enemy and elemental-body roster lengths stay fixed, including reserved summon slots.
- The actual production limits apply: 192 live drops, 256 active elemental states per system, 64 effects and 64 shards, 32 enemy projectiles, and 24 telegraphs. Save-decoder bounds apply to pending drops and source identifiers.
- Player, enemy, material, projectile and serialized numeric state remains finite.
- The streamed field never constructs a duplicate full-world `cells` map; numeric LRU cache bytes and blocks stay within the provider's configured capacity.
- Repeated intact build/undo restores the exact prior terrain envelope, sparse edit count and material count, with no retained construction layer.
- Periodic checkpoints serialize, pass the save envelope validator, deserialize, restore through full component validation into the same world, and match their captured state. Water storage retains its fixed-size backing buffer and valid cell volumes.
- A final ordinary-clock settle checks effect, shard, projectile, telegraph and drained-event expiry.
- The rendering fixture accounts for every created geometry's disposal and checks that the scene has no retained meshes after eviction or shutdown.

## Measurement method

The test logs the actual Node/platform/architecture/CPU environment; simulated time and frame count; productive circuits, casts and checkpoints; elapsed wall time and process CPU time; peak live buffer sizes; event count; final provider stats; and final encoded save bytes.

Every checkpoint also logs separate capture, JSON encoding, cheap envelope validation, JSON decoding and full restore elapsed times. `restoreMs` includes the real decoder's internal JSON normalization, component validation, installation and water/terrain reconciliation. Test assertion traversal and round-trip comparison are outside those individual timings, but included in the whole-test wall/CPU measurements. Timings are descriptive, with no hardware-dependent pass/fail threshold.

## Execution evidence

2026-10-05, installed local runner:

```sh
node node_modules/vitest/vitest.mjs run tests/unit/campaign-soak.test.ts --reporter=verbose
```

**PASS: 2/2 tests**, 33.20 seconds for the scoped runner. No full-suite result is implied.

The installed local TypeScript check (`node node_modules/typescript/bin/tsc --noEmit`) and `git diff --check` also passed after the test was added.

- Environment: Linux x64, Node v24.19.0, reported AMD EPYC 9V74 80-Core Processor, 9 logical CPUs visible to Node.
- Campaign: 600.0000000001116 simulated seconds (floating-point accumulation), exactly 18,000 frames. First-chapter route and normal return completed at 140.03 seconds, followed by 28 circuits, 56 elemental casts and 5 checkpoints. No deaths.
- Campaign test wall time: 32,187 ms. Process CPU time: 33,820 ms. These include assertions, capture/restore verification and harness work; they are not frame-time or FPS measurements.
- Events consumed: 1,071; maximum 3 waiting at one frame's normal drain. Final event queue empty.
- Observed maxima: 3 live material drops, 16 active elemental states, 13 effects and 30 shards per system, all within their production budgets. Final world effects, shards, arrows, enemy shots and telegraphs empty.
- Provider: 64 resident numeric blocks / 3,145,728 bytes, exactly its configured capacity; 134 evictions. No full-world cell map was created.
- Separate CPU mesh fixture: passed in 238 ms; 24 distant visits with unchanged-view reuse, geometry eviction/disposal and final material disposal checked.

Checkpoint measurements, milliseconds except encoded UTF-8 bytes:

| Simulated seconds | Capture | JSON encode | Envelope validation | JSON decode | Full restore | Encoded bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 140.03 | 13.13 | 1.04 | 2.47 | 0.75 | 850.26 | 167,251 |
| 247.07 | 8.00 | 1.14 | 1.17 | 0.69 | 746.82 | 168,501 |
| 369.37 | 6.63 | 1.02 | 0.83 | 0.69 | 817.12 | 161,895 |
| 491.63 | 6.97 | 1.05 | 0.60 | 0.69 | 631.74 | 161,751 |
| 600.00 | 7.25 | 1.04 | 0.63 | 0.69 | 685.27 | 161,645 |

Full restore was synchronous and took approximately 632–850 ms in this environment. This is a concrete reason to profile the user-visible cold-load/file-import path before claiming hitch-free operation. Cached network synchronization uses reuse proofs and needs separate profiling. It is not a measurement of regular autosave cost: autosave captures and stores state, rather than restoring all components. No optimization or hardware-dependent threshold was added from this observation.


## Limits

This does not establish ten minutes of wall-clock play, browser rendering stability, mobile or desktop FPS, GPU memory behavior, touch/keyboard usability, multiplayer/network longevity, every biome under every weather condition, or indefinite-session safety. The mesh fixture is deliberately separate from campaign progression. Browser/device Q08/Q09 acceptance and publication verification remain independent requirements.

## Player-exposure integration recheck

2026-10-05 02:06 UTC: the same two tests passed again after player wet/fire/shock integration (32.71 s runner duration). The 600-second route still completed with zero deaths and the same production buffer maxima; five restored checkpoints remained valid. Full restores measured 699–797 ms, captures 6.94–14.45 ms, final encoded state 161,759 bytes. This recheck does not add browser or device evidence.
