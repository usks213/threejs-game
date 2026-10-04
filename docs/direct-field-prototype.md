# Direct density-brick preview

Use `?terrain=direct` on the PR preview. Remove the query parameter to return to the normal renderer. Both paths use the same IndexedDB save, generator, authoritative collision, terrain edits, buildings, inventory and drops; no reset or migration occurs.

This is a small, reversible rendering experiment, not an Enshrouded engine reproduction:

- A dedicated terrain worker samples 17³ density values per 8 m brick at the existing 0.5 m resolution. It emits no terrain surface vertices or indices.
- WebGL2 samples R16F 3D textures and finds sign-changing surface intersections within bounded ray intervals. The existing density is an implicit field, not a Euclidean SDF; no unsafe sphere-tracing distance assumption is made.
- Twelve proxy-box triangles per visible surface brick invoke the shader. The shader writes the actual surface depth. Surface triangulation is eliminated, not all rasterization.
- The first playable volume is approximately 22 m horizontally and 12 m vertically from the player, with CPU-directed demand, worker caching and bounded uploads. Distant terrain and grass are not rendered by this prototype. GPU feedback and visibility buffers are not implemented.
- Direct mode uses simple terrain lighting and the direct beauty pass. SSR, bloom, volumetric lighting and terrain shadows are not equivalent to the normal pipeline. Frame comparisons must disclose this quality difference.
- Settings → performance contains build, simulation tick, snapshot/worker age, submitted/received input, pause/readiness/epoch and errors. “診断をコピー” copies only technical state and timings, not the saved world or inventory. Nothing is transmitted automatically.

Checks: exact old-save roundtrip with terrain edits, building/storage and inventory; field samples against authoritative collision density; CPU ray/depth/lifecycle tests; browser shader/movement/mining and same-scene frame samples. Actual phone performance must be established from the device, not software-GPU CI alone.
