# Shared-surface renderer performance

The collision height field, normals, physics substeps, launch controls and body geometry are unchanged. The old uniform stadium mesh used 46,650 vertices / 91,336 floor triangles. The replacement samples the same bank/notch/pocket features and adaptively splits shared edges without internal cracks: 10,685 vertices / 20,955 floor triangles. No render LOD changes during a battle.

## Measured isolated comparison

Sword /3-60/N, 80%/0°/8°, unchanged CPU; desktop1280×900, unrecorded Chromium SwiftShader, same machine. All runs completed 30.7667 simulated seconds with the **same complete final battle-state hash**. This is software rendering, not real smartphone FPS.

| Private served variant | Wall seconds | Total rendered triangles |
|---|---:|---:|
| Original floor | 59.57 | 104,000 |
| Rendering disabled (diagnostic only) | 31.38 | 0 |
| Only floor hidden (diagnostic only) | 32.57 | 12,664 |
| Arena draw capped30Hz (not adopted) | 52.31 | 104,000 |
| Adaptive shared floor (adopted) | 35.07 | 33,619 |

The adopted variant reduces this fixture's wall time by approximately41%, without skipping physics or changing results. Draw submission itself used only0.502s in the original run; large idle/rAF gaps and the no-floor control identify software-GPU/compositor scheduling rather than expensive Three.js JavaScript alone. A draw cap barely helps because the original cadence is already below30Hz.

## Geometry and validation

Triangle-centroid height error versus the shared physical surface: maximum0.187244mm overall /0.158494mm in pockets. Normal interpolation: area-weighted mean0.324°, p953.52°, rare maximum30.20° near sharp transitions. The latter is not claimed exact; old normals' corresponding maximum was29.86°. Tests retain dense interior height/normal checks and shared-edge conformity, not merely exact vertex sampling. Outer-circle chord inset is at most0.074mm.

The integrated position/normal/color/index buffers match the measured private prototype byte-for-byte. Typecheck, production build, all153 unit/integration tests and desktop/390px phone visual checks passed with no browser errors or horizontal overflow. This does not prove real-world toy fidelity or all-device performance. The original public deadline failures remain in history; current exact-head CI must still be observed separately.
