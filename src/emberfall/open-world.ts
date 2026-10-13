import { CellWorld, Material } from './materials';
import { random, WORLD_HEIGHT, WORLD_WIDTH } from './generation';
import type { Enemy } from './simulation';

export const OPEN_WORLD_WIDTH = 1536;
export const OPEN_WORLD_HEIGHT = 768;
export const OPEN_CHUNK_SIZE = 32;
export const ACTIVE_CHUNK_RADIUS = 3;
export const MAX_ACTIVE_CHUNKS = (ACTIVE_CHUNK_RADIUS * 2 + 1) ** 2;
export const MAX_ACTIVE_CELLS = MAX_ACTIVE_CHUNKS * OPEN_CHUNK_SIZE ** 2;
export const OPEN_REGIONS = [
  { id: 'home', name: '燐光の故郷', from: 0, to: 256 },
  { id: 'grove', name: '琥珀樹の森', from: 256, to: 512 },
  { id: 'dunes', name: '砂硝子の丘', from: 512, to: 768 },
  { id: 'reservoir', name: '青の貯水地', from: 768, to: 1024 },
  { id: 'fungal', name: '胞子の大洞', from: 1024, to: 1280 },
  { id: 'ember', name: '熾火の山脈', from: 1280, to: OPEN_WORLD_WIDTH },
] as const;
export const LEGACY_EXITS = [
  { x: 253, y: 8, width: 3, height: 26 },
  { x: 253, y: 338, width: 3, height: 26 },
  { x: 240, y: 380, width: 12, height: 4 },
] as const;
export function regionAt(x: number) { return OPEN_REGIONS[Math.max(0, Math.min(OPEN_REGIONS.length - 1, Math.floor(x / 256)))]; }
export function getRegionName(x: number, y = 0): string { return `${regionAt(x).name}${y >= 432 ? '・深層' : y >= 80 ? '・地下' : ''}`; }
export function surfaceAt(x: number): number { return x < 300 ? 34 : 34 + Math.round(Math.sin((x - 300) / 130) * 6); }

/** Physics uses an aligned 7×7 chunk rectangle, never the whole large map. */
export function focusWorld(world: CellWorld, x: number, y: number): void {
  if (world.width <= WORLD_WIDTH && world.height <= WORLD_HEIGHT) return;
  const cx = Math.floor(Math.max(0, Math.min(world.width - 1, x)) / OPEN_CHUNK_SIZE);
  const cy = Math.floor(Math.max(0, Math.min(world.height - 1, y)) / OPEN_CHUNK_SIZE);
  const left = Math.max(0, cx - ACTIVE_CHUNK_RADIUS) * OPEN_CHUNK_SIZE;
  const top = Math.max(0, cy - ACTIVE_CHUNK_RADIUS) * OPEN_CHUNK_SIZE;
  const right = Math.min(world.width, (cx + ACTIVE_CHUNK_RADIUS + 1) * OPEN_CHUNK_SIZE);
  const bottom = Math.min(world.height, (cy + ACTIVE_CHUNK_RADIUS + 1) * OPEN_CHUNK_SIZE);
  const old = world.activeRegion;
  if (!old || old.x !== left || old.y !== top || old.width !== right - left || old.height !== bottom - top) world.setActiveRegion({ x: left, y: top, width: right - left, height: bottom - top });
}

/**
 * Finite, reproducible terrain held in a bounded 1536×768 cell buffer. Terrain
 * generation is one-time; only active chunks run material physics afterward.
 * Migration copies every old cell/lifetime except the documented immutable
 * outer-wall exits. Player-built cells and editable terrain are not replaced.
 */
export function createOpenWorld(seed: number, legacy: CellWorld, fresh = false): CellWorld {
  if (legacy.width !== WORLD_WIDTH || legacy.height !== WORLD_HEIGHT) throw new RangeError('Expected legacy starting region');
  const world = new CellWorld(OPEN_WORLD_WIDTH, OPEN_WORLD_HEIGHT, legacy.rngState);
  world.cells.fill(Material.Rock);
  // The surface is a continuous shallow ridge, with clear headroom for walking
  // and levitation rather than a sequence of disconnected arenas.
  for (let x = 3; x < world.width - 3; x++) world.fillRect(x, 3, 1, surfaceAt(x) - 3, Material.Air);
  // Broad horizontal galleries are joined by climbable shafts with alternating
  // rest ledges, so fuel can recharge on a trip back from the deep world.
  for (const y of [88, 168, 248, 344, 432, 528, 640, 720]) world.fillRect(6, y - 9, world.width - 12, 18, Material.Air);
  for (let x = 300; x < world.width - 40; x += 236) {
    world.fillRect(x - 10, surfaceAt(x) - 2, 20, 720 - surfaceAt(x) + 12, Material.Air);
    for (let y = 72, i = 0; y < 720; y += 48, i++) world.fillRect(x + (i % 2 ? 1 : -10), y, 9, 3, Material.Rock);
  }
  // Chunk-seeded side chambers, veins and reservoirs make excursions distinct.
  for (let cy = 2; cy < world.height / OPEN_CHUNK_SIZE - 1; cy++) for (let cx = 8; cx < world.width / OPEN_CHUNK_SIZE - 1; cx++) {
    const rng = random(seed ^ Math.imul(cx + 1, 73856093) ^ Math.imul(cy + 1, 19349663));
    const x = cx * OPEN_CHUNK_SIZE + 16, y = cy * OPEN_CHUNK_SIZE + 16;
    if (rng() < 0.38) {
      world.carveCircle(x, y, 7 + Math.floor(rng() * 7), 100);
      if (rng() < 0.36) world.fillRect(x - 5, y + 3, 10, 3, y > 580 ? Material.Lava : x > 1024 ? Material.Toxic : Material.Water);
    }
    if (rng() < 0.32) world.fillRect(x + 10, y + 8, 3, 4, Material.Gold);
    if (rng() < 0.15) world.fillRect(x - 10, y - 8, 6, 5, Material.Sand);
  }
  // Reopen the guaranteed gallery center after decorative veins and pools.
  for (const y of [88, 168, 248, 344, 432, 528, 640, 720]) world.fillRect(256, y - 7, world.width - 262, 14, Material.Air);
  // New surface resources keep the main trail passable; trees can be mined or
  // flown over and reservoirs are sunk below the walking ridge.
  for (let x = 340; x < world.width - 30; x += 96) {
    const floor = surfaceAt(x);
    if (x >= 512 && x < 768) world.fillRect(x - 7, floor - 3, 14, 3, Material.Sand);
    else { world.fillRect(x, floor - 11, 3, 11, Material.Wood); world.fillRect(x - 4, floor - 14, 11, 4, Material.Wood); }
    world.fillRect(x + 14, floor + 4, 10, 5, Material.Gold);
  }
  for (const x of [430, 830, 940, 1190]) {
    const floor = surfaceAt(x); world.fillRect(x - 12, floor + 3, 24, 9, Material.Water);
    world.fillRect(x - 12, floor, 24, 3, Material.Rock);
  }
  world.fillRect(0, 0, 3, world.height, Material.HardRock);
  world.fillRect(world.width - 3, 0, 3, world.height, Material.HardRock);
  world.fillRect(0, 0, world.width, 3, Material.HardRock);
  world.fillRect(0, world.height - 4, world.width, 4, Material.HardRock);
  for (let y = 0; y < legacy.height; y++) {
    world.cells.set(legacy.cells.subarray(y * legacy.width, (y + 1) * legacy.width), y * world.width);
    world.life.set(legacy.life.subarray(y * legacy.width, (y + 1) * legacy.width), y * world.width);
  }
  world.fillRect(240, 384, 12, 56, Material.Air);
  for (const exit of LEGACY_EXITS) for (let y = exit.y; y < exit.y + exit.height; y++) for (let x = exit.x; x < exit.x + exit.width; x++) {
    if (world.get(x, y) === Material.HardRock) world.set(x, y, Material.Air);
  }
  if (fresh) {
    world.fillRect(162, 8, 94, 26, Material.Air);
    world.fillRect(162, 34, 94, 3, Material.Rock);
    world.fillRect(232, 338, 24, 26, Material.Air);
    world.fillRect(240, 364, 12, 20, Material.Air);
  }
  world.tick = legacy.tick; world.rngState = legacy.rngState;
  world.markAllDirty();
  return world;
}
export function openWorldEnemies(firstId: number): Enemy[] {
  const enemies: Enemy[] = [];
  for (let sector = 1; sector < 6; sector++) for (const depth of [88, 248, 432, 640]) {
    const x = sector * 256 + 90, kind = depth >= 432 ? 'sentry' : sector % 2 ? 'crawler' : 'moth';
    enemies.push({ id: firstId + enemies.length, x, y: depth - 3, vx: 0, vy: 0, hp: 30 + sector * 4, maxHp: 30 + sector * 4, kind, cooldown: 1.5, flash: 0 });
  }
  return enemies;
}
