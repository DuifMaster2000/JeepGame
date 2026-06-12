# JeepGame — Pine Ridge Island

Single-file Three.js (r128) open-world driving game. The live game is
`pine-ridge-island-v7.html` (index.html redirects to it); `pine-ridge-trail-v6.html`
is the previous infinite-road version, kept for reference. All game code lives in
one big `<script>` IIFE inside the HTML file. `three.min.js` and `ez-tree.umd.js`
are vendored locally (CDN fallback kept) so everything runs offline.

## IMPORTANT: the world takes time to form — wait before screenshotting

Two separate delays, both by design:

1. **Boot generation** (~2–5 s, longer on slow CPUs): terrain, the A*-routed road
   network, far-terrain mesh, far-forest billboards, ocean and minimap are all
   generated at load behind the start overlay ("Charting the coast…" progress bar).
   Wait for `window.__dbg.WORLD.ready === true` before interacting.
2. **Chunk streaming**: full-detail chunks (terrain + trees + collisions) build at
   **one chunk per frame** to avoid hitches. At 60 FPS the ring around the jeep
   fills in under a second, but in headless Chromium the game runs on SwiftShader
   at **~1 FPS**, so the detail ring can take 30–60+ s to fill (`__dbg.chunks.size`
   reaches ~37 at the default radius). After any teleport (`__dbg.car.x/z=...`)
   the ring rebuilds the same way.

So for screenshots: wait for `WORLD.ready`, then wait until `__dbg.chunks.size`
stops growing (or just wait generously). Screenshot calls themselves can time out
on the pegged SwiftShader main thread — pass `timeout:120000`.

### Known sandbox rendering limitation (not a bug to fix)

Headless SwiftShader renders all *lit/textured* materials black — terrain, trees
and the jeep appear as silhouettes. This affects v6 identically and does NOT
happen on real GPUs. Pure ShaderMaterials (sky, ocean, far-tree billboards' fog)
and 2D canvas (minimap, HUD) render correctly. `__dbg.enableCompat('x')` switches
to self-lit materials (the game auto-detects broken drivers at ~frame 40, which at
1 FPS takes ~40 s). For checking the *landscape design* without a GPU, use the CPU
shaded-relief renderer instead (below).

## Testing

```sh
node test/worldgen-test.mjs [seed]      # 21-check generation suite, no browser needed
node test/relief-render.mjs [seed]      # writes /tmp/island-relief-<seed>.bmp satellite view
# browser smoke test (boots game, drives, screenshots, asserts no page errors):
python3 -m http.server 8123 &           # game must be served over http
NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
  node test/browser-test.cjs
```

The worldgen test extracts the pure-math block between `function mulberry32` and
the `/*<<ENDWORLDGEN>>*/` marker in the HTML and runs it in Node — keep that block
free of THREE/DOM dependencies (except `location` for the seed).

## Architecture notes

- World is a seeded 20×20 km island (`?seed=N` URL param; "New island" button in
  the Esc settings menu). Sea level is y=0; the ocean is the world border.
- `baseHeight(x,z)` = raw terrain; `groundHeight(x,z)` = terrain flattened onto
  roads (via `roadQuery`, a spatial-hash lookup of road segments). Physics,
  chunk meshes and vegetation all use `groundHeight` — keep them consistent.
- Car handling is a dynamic single-track (bicycle) model in `physics()`: per-axle
  slip angles → Pacejka-style lateral force (peak ~8°, falls off past it), scaled
  by load transfer and a traction circle (drive/brake/handbrake force spends
  friction that lateral grip then loses). Understeer, oversteer and power slides
  are emergent, not scripted. Below ~4 m/s and in reverse it blends to kinematic
  steering. Tuning knobs are the named constants right above `physics()` (`MU_*`,
  `FRONT_GRIP`, `DRIVE_REAR`, `TIRE_B/C`…); the lateral solver substeps at 8 ms —
  keep that with the 40 ms frame-dt clamp for stability.
- Road network: hubs → Gabriel graph → A* over a terrain-cost grid with a
  corridor-reuse discount (creates merges/forks); deduplicated into `ROADS.sections`
  (asphalt `'a'` / gravel `'g'`); profiles grade-limited to 13% by an exact
  two-pass clamp. Whole network is meshed once at boot and always drawn.
- LOD: near = streamed 2D chunks; far = one island-wide mesh with index holes
  punched under loaded chunks + ~75k camera-facing billboard trees (ShaderMaterial)
  that fade in where the detail ring ends.
- `window.__dbg` exposes WORLD, ROADS, FAR, chunks, car, roadQuery, groundHeight,
  enableCompat, cycleMap etc. for console/testing.
- THREE r128 gotcha: every `InstancedMesh` sharing a material must have
  `instanceColor` set (we call `setColorAt(0, white)` on empty meshes) or the
  renderer's program fast-path crashes with `isInterleavedBufferAttribute of null`.
