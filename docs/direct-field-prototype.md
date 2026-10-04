# Direct density-brick preview

Use `?terrain=direct` on the PR preview. Remove the query parameter to return to the normal renderer. Both paths use the same IndexedDB save, generator, authoritative collision, terrain edits, buildings, inventory and drops; no reset or migration occurs.

This is a small, reversible rendering experiment, not an Enshrouded engine reproduction:

- A dedicated terrain worker samples 17³ density values per 8 m brick at the existing 0.5 m resolution. It emits no terrain surface vertices or indices.
- WebGL2 samples R16F 3D textures and finds sign-changing surface intersections within bounded ray intervals. The existing density is an implicit field, not a Euclidean SDF; no unsafe sphere-tracing distance assumption is made.
- Twelve proxy-box triangles per visible surface brick invoke the shader. The shader writes the actual surface depth. Surface triangulation is eliminated, not all rasterization.
- Demand uses 0.5 m samples within 24 m, 1 m to 48 m and 2 m to 80 m, with shared-face/edge interpolation at LOD boundaries. Near demand follows the player vertically; distant demand covers generator surface bands and known legacy islands. Distant underground edits become visible on approach. CPU-directed demand, worker caching and bounded uploads remain; decorative grass is omitted. GPU feedback and visibility buffers are not implemented.
- Direct mode uses simple terrain lighting and the direct beauty pass. A cached low-resolution physical sky environment and SH probe light water/materials; only their intensity follows time/weather, without repeated captures. New intact tree templates are admitted one per update, using temporary voxel placeholders. SSR, bloom, volumetric lighting and terrain shadows are not equivalent to the normal pipeline. Frame comparisons must disclose this quality difference.
- Settings → performance contains build, simulation tick, snapshot/worker age, submitted/received input, pause/readiness/epoch and errors. “診断をコピー” copies only technical state and timings, not the saved world or inventory. Nothing is transmitted automatically.

Checks: exact old-save roundtrip with terrain edits, building/storage and inventory; field samples against authoritative collision density; CPU ray/depth/lifecycle tests; browser shader/movement/mining and same-scene frame samples. Actual phone performance must be established from the device, not software-GPU CI alone.

An opt-in `waterProbe=1` performs one 16×16 asynchronous lighting comparison on the actual water geometry/material. It is disabled in ordinary play; no continuous GPU readback is added.
