import { Material, MATERIALS } from './materials';
import type { CellWorld } from './materials';
import { structureSize } from './survival';

/** All expensive lighting work is bounded independently of fire/structure count. */
export const LIGHT_BUDGET = Object.freeze({ cellSize: 3, maxLights: 7, maxRadius: 60, maxRays: 6144, maxRaySteps: 128, updateSeconds: 1 / 12, maxGridCells: 16384 });
export interface CaveLight { x: number; y: number; radius: number; strength: number; color: readonly [number, number, number]; emission: number }
export interface LightViewport { x: number; y: number; width: number; height: number }
export interface LightMetrics { lights: number; rays: number; raySteps: number; samples: number; updates: number; budgetLimited: boolean }
export interface LightStructure { type: 'torch' | 'workbench' | 'camp'; x: number; y: number }

/** Supercover traversal: even a one-cell or diagonal solid wall blocks light.
 * The first struck surface is lit, but light never crosses it. Starting inside a
 * solid does not grant permission to tunnel out through a neighboring solid.
 */
export function traceLight(world: CellWorld, x: number, y: number, tx: number, ty: number): { visible: boolean; steps: number } {
  if (![x, y, tx, ty].every(Number.isFinite)) return { visible: false, steps: 0 };
  let cx = Math.floor(x), cy = Math.floor(y);
  const endX = Math.floor(tx), endY = Math.floor(ty);
  const dx = tx - x, dy = ty - y, sx = Math.sign(dx), sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx), deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let nextX = dx === 0 ? Infinity : (sx > 0 ? cx + 1 - x : x - cx) * deltaX;
  let nextY = dy === 0 ? Infinity : (sy > 0 ? cy + 1 - y : y - cy) * deltaY;
  let steps = 0;
  const solid = (xx: number, yy: number) => MATERIALS[world.get(xx, yy)].solid;
  while (cx !== endX || cy !== endY) {
    if (++steps > LIGHT_BUDGET.maxRaySteps) return { visible: false, steps: LIGHT_BUDGET.maxRaySteps };
    if (Math.abs(nextX - nextY) < 1e-9) {
      // Do not let a ray squeeze through touching diagonal blocks.
      if (solid(cx + sx, cy) || solid(cx, cy + sy)) return { visible: false, steps };
      cx += sx; cy += sy; nextX += deltaX; nextY += deltaY;
    } else if (nextX < nextY) { cx += sx; nextX += deltaX; }
    else { cy += sy; nextY += deltaY; }
    if (cx === endX && cy === endY) return { visible: true, steps };
    if (solid(cx, cy)) return { visible: false, steps };
  }
  return { visible: true, steps };
}

/** Sources represent real scene emitters, never arbitrary bright terrain. */
export function collectCaveLights(world: CellWorld, player: { x: number; y: number }, structures: readonly LightStructure[], viewport: LightViewport): CaveLight[] {
  const lights: CaveLight[] = [{ x: player.x + 2, y: player.y + 0.5, radius: 43, strength: 0.82, color: [1, 0.83, 0.56], emission: 0.16 }];
  const intersects = (x: number, y: number, radius: number) => x + radius >= viewport.x && x - radius <= viewport.x + viewport.width && y + radius >= viewport.y && y - radius <= viewport.y + viewport.height;
  const candidates: (CaveLight & { priority: number })[] = [];
  for (const s of structures) {
    if (s.type === 'workbench' || !intersects(s.x, s.y, 56)) continue;
    candidates.push({ x: s.x, y: s.y - Math.min(structureSize(s.type).height - 1, s.type === 'torch' ? 4 : 2), radius: s.type === 'torch' ? 56 : 60, strength: 1.05, color: [1, 0.61, 0.27], emission: 0.38, priority: 20000 - Math.hypot(s.x - player.x, s.y - player.y) });
  }
  // A deterministic 12-cell cluster prevents every grain of fire/lava becoming
  // a light. Inspect actual cells, so a lone fire particle is not skipped.
  const clusters = new Map<number, { x: number; y: number; count: number; fire: boolean }>();
  const left = Math.max(0, Math.floor(viewport.x - 32)), right = Math.min(world.width, Math.ceil(viewport.x + viewport.width + 32));
  const top = Math.max(0, Math.floor(viewport.y - 32)), bottom = Math.min(world.height, Math.ceil(viewport.y + viewport.height + 32));
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const m = world.cells[y * world.width + x];
    if (m !== Material.Fire && m !== Material.Lava) continue;
    const key = Math.floor(y / 12) * 32 + Math.floor(x / 12), cluster = clusters.get(key);
    if (cluster) { cluster.x += x; cluster.y += y; cluster.count++; cluster.fire ||= m === Material.Fire; }
    else clusters.set(key, { x, y, count: 1, fire: m === Material.Fire });
  }
  for (const c of clusters.values()) {
    const x = c.x / c.count + 0.5, y = c.y / c.count + 0.5;
    candidates.push({ x, y, radius: c.fire ? 27 : 34, strength: 0.75 + Math.min(0.35, c.count / 60), color: c.fire ? [1, 0.58, 0.21] : [1, 0.29, 0.12], emission: 0.32, priority: 1000 + Math.min(50, c.count) - Math.hypot(x - player.x, y - player.y) });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.y - b.y || a.x - b.x);
  for (const candidate of candidates) {
    if (lights.length >= LIGHT_BUDGET.maxLights) break;
    lights.push(candidate);
  }
  return lights;
}

/** Low-resolution colored illumination and a separate emitter-only bloom mask.
 * No scene readback, full-resolution blur, or per-frame texture allocation.
 */
export class CaveLighting {
  width = 0; height = 0; x = 0; y = 0;
  illumination = new Uint8ClampedArray(0);
  emission = new Uint8ClampedArray(0);
  private red = new Float32Array(0);
  private green = new Float32Array(0);
  private blue = new Float32Array(0);
  readonly metrics: LightMetrics = { lights: 0, rays: 0, raySteps: 0, samples: 0, updates: 0, budgetLimited: false };
  update(world: CellWorld, sources: readonly CaveLight[], viewport: LightViewport) {
    const cell = LIGHT_BUDGET.cellSize;
    this.x = Math.floor(viewport.x / cell) * cell - cell * 2;
    this.y = Math.floor(viewport.y / cell) * cell - cell * 2;
    const width = Math.min(256, Math.ceil(viewport.width / cell) + 5);
    const height = Math.min(Math.floor(LIGHT_BUDGET.maxGridCells / width), Math.ceil(viewport.height / cell) + 5);
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.illumination = new Uint8ClampedArray(width * height * 4); this.emission = new Uint8ClampedArray(width * height * 4);
      this.red = new Float32Array(width * height); this.green = new Float32Array(width * height); this.blue = new Float32Array(width * height);
    }
    this.red.fill(0); this.green.fill(0); this.blue.fill(0); this.emission.fill(0);
    const metrics = this.metrics;
    metrics.lights = 0; metrics.rays = 0; metrics.raySteps = 0; metrics.samples = width * height; metrics.updates++; metrics.budgetLimited = sources.length > LIGHT_BUDGET.maxLights;
    for (const light of sources.slice(0, LIGHT_BUDGET.maxLights)) {
      if (![light.x, light.y, light.radius, light.strength, light.emission, ...light.color].every(Number.isFinite) || light.radius <= 0) continue;
      const radius = Math.min(LIGHT_BUDGET.maxRadius, light.radius), radius2 = radius * radius;
      const left = Math.max(0, Math.floor((light.x - radius - this.x) / cell)), right = Math.min(width - 1, Math.ceil((light.x + radius - this.x) / cell));
      const top = Math.max(0, Math.floor((light.y - radius - this.y) / cell)), bottom = Math.min(height - 1, Math.ceil((light.y + radius - this.y) / cell));
      metrics.lights++;
      for (let yy = top; yy <= bottom; yy++) for (let xx = left; xx <= right; xx++) {
        const tx = this.x + xx * cell + cell / 2, ty = this.y + yy * cell + cell / 2;
        const distance2 = (tx - light.x) ** 2 + (ty - light.y) ** 2;
        if (distance2 >= radius2) continue;
        if (metrics.rays >= LIGHT_BUDGET.maxRays) { metrics.budgetLimited = true; break; }
        const ray = traceLight(world, light.x, light.y, tx, ty); metrics.rays++; metrics.raySteps += ray.steps;
        if (!ray.visible) continue;
        const falloff = 1 - Math.sqrt(distance2) / radius;
        const amount = falloff * falloff * Math.min(1.5, Math.max(0, light.strength));
        const index = yy * width + xx, pixel = index * 4;
        this.red[index] += amount * light.color[0]; this.green[index] += amount * light.color[1]; this.blue[index] += amount * light.color[2];
        // Bloom comes from emission only, restricted to the occluded light field.
        // Its narrow core preserves crisp terrain and silhouette boundaries.
        const bloom = (falloff ** 7 * 58 + falloff ** 3 * 8) * Math.max(0, Math.min(1, light.emission));
        this.emission[pixel] += bloom * light.color[0]; this.emission[pixel + 1] += bloom * light.color[1]; this.emission[pixel + 2] += bloom * light.color[2];
      }
      if (metrics.rays >= LIGHT_BUDGET.maxRays) break;
    }
    for (let i = 0; i < width * height; i++) {
      const pixel = i * 4;
      this.illumination[pixel] = Math.min(255, 139 + this.red[i] * 182);
      this.illumination[pixel + 1] = Math.min(255, 157 + this.green[i] * 143);
      this.illumination[pixel + 2] = Math.min(255, 186 + this.blue[i] * 114);
      this.illumination[pixel + 3] = this.emission[pixel + 3] = 255;
    }
  }
}
