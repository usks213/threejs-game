import { CellWorld, Material } from './materials';
export const WORLD_WIDTH = 256;
export const WORLD_HEIGHT = 384;
export const BIOMES = [
  { name: '燐光の坑道', subtitle: 'THE LANTERN MINES', color: '#c99559', background: '#111725' },
  { name: '胞子の貯水層', subtitle: 'THE SPORE RESERVOIR', color: '#72b6a3', background: '#102321' },
  { name: '熔炉の心臓', subtitle: 'THE CINDER HEART', color: '#ef9166', background: '#281923' },
] as const;
export function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export interface Spawn { x: number; y: number; kind: 'crawler' | 'moth' | 'sentry' | 'warden' }
export function generateLevel(seed: number, level: number) {
  const world = new CellWorld(WORLD_WIDTH, WORLD_HEIGHT, seed ^ (level * 997));
  const rng = random(seed + level * 1879);
  world.fillRect(0, 0, world.width, world.height, Material.Rock);
  world.fillRect(0, 0, 3, world.height, Material.HardRock);
  world.fillRect(world.width - 3, 0, 3, world.height, Material.HardRock);
  world.fillRect(0, world.height - 4, world.width, 4, Material.HardRock);
  const nodes = [{ x: 40, y: 23 }];
  for (let i = 1; i <= 7; i++) nodes.push({ x: i % 2 ? 185 + Math.floor(rng() * 20) : 48 + Math.floor(rng() * 28), y: 20 + i * 46 });
  nodes.push({ x: 210, y: 352 });
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    // Guaranteed traversable diagonal passage, with side rooms and seed-specific texture.
    if (n > 0) {
      const prev = nodes[n - 1], distance = Math.hypot(node.x - prev.x, node.y - prev.y);
      for (let t = 0; t <= distance; t += 3) {
        const f = t / distance;
        world.carveCircle(prev.x + (node.x - prev.x) * f, prev.y + (node.y - prev.y) * f, 14, 100);
      }
    }
    world.fillRect(node.x - 24, node.y - 13, 48, 29, Material.Air);
    if (n > 0 && n < 8) {
      const mat = level === 2 ? Material.Lava : level === 1 ? Material.Toxic : (n % 2 ? Material.Water : Material.Oil);
      world.fillRect(node.x - 21, node.y + 9, 13, 5, mat);
      world.fillRect(node.x + 16, node.y - 6, 5, 10, n % 2 ? Material.Wood : Material.Sand);
      world.fillRect(node.x + 20, node.y + 12, 4, 3, Material.Gold);
    }
    const sideX = Math.min(224, Math.max(28, node.x + (n % 2 ? -58 : 58)));
    if (n > 1) {
      world.fillRect(Math.min(node.x, sideX), node.y - 6, Math.abs(node.x - sideX), 14, Material.Air);
      world.carveCircle(sideX, node.y, 12, 100);
    }
  }
  // A safe, level entrance and readable doorway; no enemy on top of spawn.
  world.fillRect(15, 8, 85, 26, Material.Air);
  world.fillRect(15, 34, 75, 3, Material.Wood);
  world.fillRect(185, 338, 49, 26, Material.Air);
  world.fillRect(181, 364, 57, 4, Material.HardRock);
  const enemies: Spawn[] = nodes.slice(1, 8).map((n, i) => ({ x: n.x + 5, y: n.y - 4, kind: i % 3 === 0 ? 'moth' : i % 3 === 1 ? 'crawler' : 'sentry' }));
  if (level === 2) enemies.push({ x: 205, y: 348, kind: 'warden' });
  return { world, enemies, spawn: { x: 40, y: 27 }, portal: { x: 213, y: 355 }, cache: { x: 105, y: 204 } };
}
