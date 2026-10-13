import { Material, MATERIALS } from './materials';
import type { CellWorld } from './materials';
import { structureSize } from './survival';
import { extinction, scattering, surfaceNormal, surfaceResponse, SURFACE_MATERIALS } from './render-materials';

/** Absolute ceilings remain no higher than the previous mobile renderer. */
export const LIGHT_BUDGET = Object.freeze({ cellSize: 3, maxLights: 7, maxRadius: 60, maxRays: 6144, maxRaySteps: 128, updateSeconds: 1 / 12, maxGridCells: 16384, maxEmitterCells: 221184 });
export type GraphicsQuality = 'low' | 'balanced' | 'high';
export interface GraphicsEffects { pbr: boolean; volumetric: boolean; bloom: boolean }
export interface GraphicsOptions extends GraphicsEffects { quality: GraphicsQuality }
export const GRAPHICS_PRESETS = {
  low: { cellSize: 4, maxLights: 4, maxRadius: 52, maxRays: 2048, updateSeconds: 1 / 8 },
  balanced: { cellSize: 3, maxLights: 5, maxRadius: 60, maxRays: 4096, updateSeconds: 1 / 10 },
  high: { cellSize: 3, maxLights: 7, maxRadius: 60, maxRays: 6144, updateSeconds: 1 / 12 },
} as const;
export const DEFAULT_GRAPHICS: Readonly<GraphicsOptions> = Object.freeze({ quality: 'balanced', pbr: true, volumetric: true, bloom: true });
export interface CaveLight { x: number; y: number; radius: number; strength: number; color: readonly [number, number, number]; emission: number }
export interface LightViewport { x: number; y: number; width: number; height: number }
export interface LightMetrics { lights: number; rays: number; raySteps: number; samples: number; updates: number; budgetLimited: boolean; pbrSamples: number; volumeSamples: number; lightingMs: number }
export interface LightStructure { type: 'torch' | 'workbench' | 'camp'; x: number; y: number }

// DDA coordinates are already integer cells; avoid repeated flooring/validation
// through CellWorld.get in the hot ray loop, while preserving hard boundaries.
const gridMaterial = (world: CellWorld, x: number, y: number): Material => x < 0 || y < 0 || x >= world.width || y >= world.height ? Material.HardRock : world.cells[y * world.width + x];

/** Supercover traversal: even a one-cell or diagonal solid wall blocks light.
 * The first struck surface is lit, but light never crosses it. Starting inside a
 * solid does not grant permission to tunnel out through a neighboring solid.
 */
export function traceLight(world: CellWorld, x: number, y: number, tx: number, ty: number, medium = false): { visible: boolean; steps: number; opticalDepth?: number } {
  if (![x, y, tx, ty].every(Number.isFinite)) return { visible: false, steps: 0 };
  let cx = Math.floor(x), cy = Math.floor(y);
  const endX = Math.floor(tx), endY = Math.floor(ty);
  const dx = tx - x, dy = ty - y, sx = Math.sign(dx), sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx), deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let nextX = dx === 0 ? Infinity : (sx > 0 ? cx + 1 - x : x - cx) * deltaX;
  let nextY = dy === 0 ? Infinity : (sy > 0 ? cy + 1 - y : y - cy) * deltaY;
  let steps = 0, opticalDepth = 0, previousT = 0;
  const distance = Math.hypot(dx, dy);
  let currentMaterial = gridMaterial(world, cx, cy);
  const solid = (xx: number, yy: number) => MATERIALS[gridMaterial(world, xx, yy)].solid;
  while (cx !== endX || cy !== endY) {
    if (++steps > LIGHT_BUDGET.maxRaySteps) return { visible: false, steps: LIGHT_BUDGET.maxRaySteps };
    const crossing = Math.min(1, nextX, nextY);
    if (medium) opticalDepth += extinction(currentMaterial) * Math.max(0, crossing - previousT) * distance;
    previousT = crossing;
    if (Math.abs(nextX - nextY) < 1e-9) {
      // Do not let a ray squeeze through touching diagonal blocks.
      if (solid(cx + sx, cy) || solid(cx, cy + sy)) return { visible: false, steps };
      cx += sx; cy += sy; nextX += deltaX; nextY += deltaY;
    } else if (nextX < nextY) { cx += sx; nextX += deltaX; }
    else { cy += sy; nextY += deltaY; }
    if (cx === endX && cy === endY) {
      if (medium && !solid(cx, cy)) opticalDepth += extinction(gridMaterial(world, cx, cy)) * Math.max(0, 1 - previousT) * distance;
      return { visible: true, steps, opticalDepth };
    }
    const id = gridMaterial(world, cx, cy);
    if (MATERIALS[id].solid) return { visible: false, steps };
    currentMaterial = id;
  }
  return { visible: true, steps, opticalDepth: medium ? extinction(currentMaterial) * distance : 0 };
}

/** Sources represent real scene emitters, never arbitrary bright terrain. */
export function collectCaveLights(world: CellWorld, player: { x: number; y: number }, structures: readonly LightStructure[], viewport: LightViewport, maxLights: number = LIGHT_BUDGET.maxLights, stats?: { cells: number }): CaveLight[] {
  const lights: CaveLight[] = [{ x: player.x + 2, y: player.y + 0.5, radius: 43, strength: 0.82, color: [1, 0.83, 0.56], emission: 0.16 }];
  const intersects = (x: number, y: number, radius: number) => x + radius >= viewport.x && x - radius <= viewport.x + viewport.width && y + radius >= viewport.y && y - radius <= viewport.y + viewport.height;
  const candidates: (CaveLight & { priority: number })[] = [];
  for (const s of structures) {
    if (s.type === 'workbench' || !intersects(s.x, s.y, 56)) continue;
    candidates.push({ x: s.x, y: s.y - Math.min(structureSize(s.type).height - 1, s.type === 'torch' ? 4 : 2), radius: s.type === 'torch' ? 56 : 60, strength: 1.05, color: [1, 0.61, 0.27], emission: 0.38, priority: 20000 - Math.hypot(s.x - player.x, s.y - player.y) });
  }
  // A deterministic 12-cell cluster prevents every grain of fire/lava becoming
  // a light. Inspect actual cells, so a lone fire particle is not skipped.
  const clusters = new Map<number, { x: number; y: number; count: number; fire: boolean; anchorX: number; anchorY: number }>();
  const left = Math.max(0, Math.floor(viewport.x - 32)), right = Math.min(world.width, Math.ceil(viewport.x + Math.min(320, viewport.width) + 32));
  const top = Math.max(0, Math.floor(viewport.y - 32)), bottom = Math.min(world.height, Math.ceil(viewport.y + Math.min(512, viewport.height) + 32));
  if (stats) stats.cells = Math.max(0, right - left) * Math.max(0, bottom - top);
  const clusterColumns = Math.ceil(world.width / 12);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const m = world.cells[y * world.width + x];
    if (m !== Material.Fire && m !== Material.Lava) continue;
    const key = Math.floor(y / 12) * clusterColumns + Math.floor(x / 12), cluster = clusters.get(key);
    if (cluster) { cluster.x += x; cluster.y += y; cluster.count++; cluster.fire ||= m === Material.Fire; }
    else clusters.set(key, { x, y, count: 1, fire: m === Material.Fire, anchorX: x, anchorY: y });
  }
  for (const c of clusters.values()) {
    const x = c.anchorX + 0.5, y = c.anchorY + 0.5;
    candidates.push({ x, y, radius: c.fire ? 27 : 34, strength: 0.75 + Math.min(0.35, c.count / 60), color: c.fire ? [1, 0.58, 0.21] : [1, 0.29, 0.12], emission: 0.32, priority: 1000 + Math.min(50, c.count) - Math.hypot(x - player.x, y - player.y) });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.y - b.y || a.x - b.x);
  for (const candidate of candidates) {
    if (lights.length >= Math.min(LIGHT_BUDGET.maxLights, maxLights)) break;
    lights.push(candidate);
  }
  return lights;
}

/** Bounded 2.5D material lighting and single scattering. No scene readback,
 * full-resolution blur, or full-world scan. All masks reuse allocated storage.
 */
export class CaveLighting {
  width = 0; height = 0; x = 0; y = 0; cellSize = 3;
  illumination = new Uint8ClampedArray(0);
  emission = new Uint8ClampedArray(0);
  volume = new Uint8ClampedArray(0);
  specular = new Uint8ClampedArray(0);
  effects = new Uint8ClampedArray(0);
  private red = new Float32Array(0); private green = new Float32Array(0); private blue = new Float32Array(0);
  readonly metrics: LightMetrics = { lights: 0, rays: 0, raySteps: 0, samples: 0, updates: 0, budgetLimited: false, pbrSamples: 0, volumeSamples: 0, lightingMs: 0 };
  update(world: CellWorld, sources: readonly CaveLight[], viewport: LightViewport, options: Readonly<GraphicsOptions> = DEFAULT_GRAPHICS, time = 0) {
    const began = performance.now(), preset = GRAPHICS_PRESETS[options.quality], cell = preset.cellSize;
    this.cellSize = cell; this.x = Math.floor(viewport.x / cell) * cell - cell * 2; this.y = Math.floor(viewport.y / cell) * cell - cell * 2;
    const width = Math.min(256, Math.ceil(viewport.width / cell) + 5);
    const height = Math.min(Math.floor(LIGHT_BUDGET.maxGridCells / width), Math.ceil(viewport.height / cell) + 5);
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.illumination = new Uint8ClampedArray(width * height * 4); this.emission = new Uint8ClampedArray(width * height * 4);
      this.volume = new Uint8ClampedArray(width * height * 4); this.specular = new Uint8ClampedArray(width * height * 4); this.effects = new Uint8ClampedArray(width * height * 4);
      this.red = new Float32Array(width * height); this.green = new Float32Array(width * height); this.blue = new Float32Array(width * height);
    }
    this.red.fill(0); this.green.fill(0); this.blue.fill(0); this.emission.fill(0); this.volume.fill(0); this.specular.fill(0);
    const metrics = this.metrics;
    metrics.lights = 0; metrics.rays = 0; metrics.raySteps = 0; metrics.samples = width * height; metrics.updates++;
    metrics.budgetLimited = sources.length > preset.maxLights; metrics.pbrSamples = 0; metrics.volumeSamples = 0;
    for (const light of sources.slice(0, preset.maxLights)) {
      if (![light.x, light.y, light.radius, light.strength, light.emission, ...light.color].every(Number.isFinite) || light.radius <= 0) continue;
      const radius = Math.min(preset.maxRadius, light.radius), radius2 = radius * radius;
      const left = Math.max(0, Math.floor((light.x - radius - this.x) / cell)), right = Math.min(width - 1, Math.ceil((light.x + radius - this.x) / cell));
      const top = Math.max(0, Math.floor((light.y - radius - this.y) / cell)), bottom = Math.min(height - 1, Math.ceil((light.y + radius - this.y) / cell));
      // Admit a complete source or skip it. Never leave a half-rasterized light
      // with a visible horizontal cutoff when the mobile ray budget is reached.
      let needed = 0;
      for (let yy = top; yy <= bottom; yy++) for (let xx = left; xx <= right; xx++) if ((this.x + xx * cell + cell / 2 - light.x) ** 2 + (this.y + yy * cell + cell / 2 - light.y) ** 2 < radius2) needed++;
      if (metrics.rays + needed > preset.maxRays) { metrics.budgetLimited = true; continue; }
      metrics.lights++;
      for (let yy = top; yy <= bottom; yy++) for (let xx = left; xx <= right; xx++) {
        const tx = this.x + xx * cell + cell / 2, ty = this.y + yy * cell + cell / 2;
        const dx = light.x - tx, dy = light.y - ty, distance2 = dx * dx + dy * dy;
        if (distance2 >= radius2) continue;
        const ray = traceLight(world, light.x, light.y, tx, ty, options.volumetric); metrics.rays++; metrics.raySteps += ray.steps;
        if (!ray.visible) continue;
        const falloff = 1 - Math.sqrt(distance2) / radius;
        const baseAmount = falloff ** 1.7 * Math.min(1.5, Math.max(0, light.strength));
        const transmission = options.volumetric ? Math.exp(-(ray.opticalDepth ?? 0)) : 1, amount = baseAmount * transmission;
        const index = yy * width + xx, pixel = index * 4, id = world.get(tx, ty);
        const surface = MATERIALS[id].solid || (id >= Material.Water && id <= Material.Lava);
        if (options.pbr && surface) {
          const response = surfaceResponse(SURFACE_MATERIALS[id], surfaceNormal(world, tx, ty, time), [dx, dy, 18]);
          metrics.pbrSamples++;
          this.red[index] += amount * light.color[0] * (0.12 + response.diffuse[0] * 1.32);
          this.green[index] += amount * light.color[1] * (0.12 + response.diffuse[1] * 1.32);
          this.blue[index] += amount * light.color[2] * (0.12 + response.diffuse[2] * 1.32);
          for (let c = 0; c < 3; c++) this.specular[pixel + c] += Math.min(90, response.specular[c] * amount * light.color[c] * 180);
        } else {
          this.red[index] += amount * light.color[0]; this.green[index] += amount * light.color[1]; this.blue[index] += amount * light.color[2];
        }
        if (options.volumetric && !surface && ty >= 0 && ty < world.height) {
          // Real smoke/steam are denser; coherent dust variation modulates the
          // thin atmosphere. Solid occlusion creates shafts through apertures.
          const dust = 0.8 + Math.sin(tx * 0.045 + Math.sin(ty * 0.027) * 2 + time * 0.12) * 0.2;
          const scatter = scattering(ray.opticalDepth ?? 0, extinction(id) * dust, 18 / Math.sqrt(distance2 + 324));
          const volume = scatter * baseAmount * 340;
          for (let c = 0; c < 3; c++) this.volume[pixel + c] += volume * light.color[c];
          metrics.volumeSamples++;
        }
        if (options.bloom) {
          const bloom = (falloff ** 5 * 140 + falloff ** 2 * 32) * Math.max(0, Math.min(1, light.emission)) * transmission;
          for (let c = 0; c < 3; c++) this.emission[pixel + c] += bloom * light.color[c];
        }
      }
    }
    for (let i = 0; i < width * height; i++) {
      const pixel = i * 4;
      this.illumination[pixel] = Math.min(255, 139 + this.red[i] * 182);
      this.illumination[pixel + 1] = Math.min(255, 157 + this.green[i] * 143);
      this.illumination[pixel + 2] = Math.min(255, 186 + this.blue[i] * 114);
      for (let c = 0; c < 3; c++) this.effects[pixel + c] = this.emission[pixel + c] + this.specular[pixel + c] + this.volume[pixel + c];
      this.illumination[pixel + 3] = this.emission[pixel + 3] = this.specular[pixel + 3] = this.volume[pixel + 3] = this.effects[pixel + 3] = 255;
    }
    metrics.lightingMs = performance.now() - began;
  }
}
