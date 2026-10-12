import { Material, MATERIALS } from './materials';
import type { CellWorld } from './materials';
import type { GraphicsQuality } from './lighting';
import type { Input, Particle, Player, Projectile, Run } from './simulation';
import type { TerrainViewport } from './terrain-window';
import { SPELLS } from './wands';
import { pixelLine } from './pixel-actors';

export const PIXEL_EFFECT_BUDGETS = Object.freeze({
  low: { anchors: 72, step: 4, interval: 1 / 6 },
  balanced: { anchors: 144, step: 3, interval: 1 / 10 },
  high: { anchors: 216, step: 2, interval: 1 / 12 },
});
const snap = (n: number) => Math.round(n * 2) / 2;
function pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillRect(snap(x), snap(y), Math.max(0.5, snap(width)), Math.max(0.5, snap(height)));
}
const noise = (x: number, y: number) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0);
const visible = (x: number, y: number, view: TerrainViewport, margin = 8) => x >= view.x - margin && y >= view.y - margin && x <= view.x + view.width + margin && y <= view.y + view.height + margin;

/** Flame tongues/embers are cosmetic. All drawn lengths are strictly bounded. */
export function drawPixelFlame(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, size = 1, smoke = true) {
  const beat = Math.floor(time * 12 + x * 0.7), sway = Math.sin(time * 9 + x) * 0.5;
  // Three uneven stepped tongues with dark orange edges and pale short cores.
  for (let i = -1; i <= 1; i++) {
    const tall = (2 + (beat + i * i + 6) % 3) * size, xx = snap(x + i * 0.75 * size);
    ctx.fillStyle = '#c55837'; pixelRect(ctx, xx - 0.5, snap(y - tall + 1), size, tall);
    ctx.fillStyle = i ? '#f9a44f' : '#ffcb70'; pixelRect(ctx, xx, snap(y - tall + 0.5), 0.5 * size, Math.max(0.5, tall - 0.5));
    pixelRect(ctx, snap(xx + sway), snap(y - tall), 0.5, 0.5);
  }
  ctx.fillStyle = '#ffefb1'; pixelRect(ctx, snap(x), snap(y - 1.5 * size), 0.5 * size, 1.5 * size);
  const age = (time * 2.4 + x * 0.37) % 1;
  ctx.fillStyle = age < 0.5 ? '#efb771' : '#a16d57'; pixelRect(ctx, snap(x + Math.sin(x + age * 5) * 1.5), snap(y - 4 * size - age * 5), 0.5, 0.5);
  if (smoke) {
    ctx.globalAlpha = (1 - age) * 0.26;
    ctx.fillStyle = '#8b828b'; pixelRect(ctx, snap(x + Math.sin(age * 6 + x) * 2), snap(y - 6 * size - age * 6), 1.5, 0.5);
    pixelRect(ctx, snap(x + 0.5 + Math.sin(age * 6 + x) * 2), snap(y - 6 * size - age * 6 - 0.5), 0.5, 0.5);
    ctx.globalAlpha = 1;
  }
}

/** Fixed-capacity, viewport-only read-only accents. Never creates simulation
 * water, fire, particles, lights, or RNG calls, and never touches dirty chunks. */
export class PixelMaterialEffects {
  private readonly xs = new Int16Array(216);
  private readonly ys = new Int16Array(216);
  private readonly kinds = new Uint8Array(216);
  private readonly forms = new Uint8Array(216);
  private world: CellWorld | null = null;
  private lastTime = -Infinity;
  private cameraX = Infinity; private cameraY = Infinity;
  private lastQuality: GraphicsQuality = 'balanced';
  count = 0; cellsScanned = 0;
  update(world: CellWorld, view: TerrainViewport, time: number, quality: GraphicsQuality) {
    const budget = PIXEL_EFFECT_BUDGETS[quality];
    if (world === this.world && time >= this.lastTime && time - this.lastTime < budget.interval && quality === this.lastQuality && Math.abs(view.x - this.cameraX) < 8 && Math.abs(view.y - this.cameraY) < 8) return;
    this.world = world; this.lastTime = time; this.cameraX = view.x; this.cameraY = view.y; this.lastQuality = quality;
    this.count = this.cellsScanned = 0;
    const left = Math.max(0, Math.floor(view.x)), right = Math.min(world.width, Math.ceil(view.x + Math.min(320, view.width)));
    const top = Math.max(0, Math.floor(view.y)), bottom = Math.min(world.height, Math.ceil(view.y + Math.min(512, view.height)));
    for (let y = top; y < bottom; y++) for (let x = left + ((y & 1) ? 1 : 0); x < right; x += budget.step) {
      this.cellsScanned++;
      const m = world.cells[y * world.width + x];
      if (m < Material.Water || m > Material.Steam || this.count >= budget.anchors) continue;
      const above = world.get(x, y - 1), hash = noise(x, y);
      let form = 0;
      if (m <= Material.Lava) {
        if (above !== m && !MATERIALS[above].solid) form = 1;
        else if (m === Material.Water && hash % 9 === 0 && (world.get(x - 1, y) === Material.Air || world.get(x + 1, y) === Material.Air)) form = 2;
        else if (m === Material.Lava && hash % 19 === 0) form = 3;
      } else if (m === Material.Fire) { if (hash % 3 === 0 && !MATERIALS[above].solid) form = 4; }
      else if (hash % 17 === 0) form = 5;
      if (!form) continue;
      this.xs[this.count] = x; this.ys[this.count] = y; this.kinds[this.count] = m; this.forms[this.count] = form; this.count++;
    }
  }
  draw(ctx: CanvasRenderingContext2D, world: CellWorld, time: number) {
    for (let i = 0; i < this.count; i++) {
      const x = this.xs[i], y = this.ys[i], m = this.kinds[i], form = this.forms[i];
      if (world.get(x, y) !== m) continue;
      const phase = time * (m === Material.Lava ? 2 : 4) + (noise(x, y) % 23);
      if (form === 1) {
        const bright = Math.sin(phase) > 0.2;
        ctx.fillStyle = m === Material.Water ? (bright ? '#b2d5d6' : '#669daf') : m === Material.Oil ? (bright ? '#bda477' : '#766878') : m === Material.Toxic ? (bright ? '#d4de91' : '#85a870') : (bright ? '#ffe8a0' : '#eb8a49');
        const length = bright ? 2.5 : 1;
        for (let xx = 0; xx < length; xx += 0.5) if (world.get(x + xx, y) === m && world.get(x + xx, y - 1) !== m) pixelRect(ctx, x + xx, y + (bright ? 0 : 0.5), 0.5, 0.5);
        // Subsurface reflected bands travel horizontally without moving a cell.
        if (bright && world.get(x + 1, y + 2) === m) { ctx.fillStyle = m === Material.Water ? '#4c91ad' : m === Material.Toxic ? '#9cbd78' : m === Material.Oil ? '#8c8066' : '#efb35c'; pixelRect(ctx, x + 0.5, y + 2.5, 1.5, 0.5); }
      } else if (form === 2) {
        const offset = Math.floor(time * 9 + x) % 3;
        ctx.fillStyle = '#91cbd2'; for (let yy = 0; yy < 2; yy += 0.5) if (world.get(x, y + offset + yy) === m) pixelRect(ctx, x + 0.5, y + offset + yy, 0.5, 0.5);
      } else if (form === 3) {
        ctx.fillStyle = Math.sin(phase) > 0 ? '#ffd17d' : '#b95d44'; pixelRect(ctx, x, y, 1, 0.5);
      } else if (form === 4) {
        // One-cell fire accents stay in empty/gas cells; no tongues through rock.
        ctx.fillStyle = '#ffdd91'; pixelRect(ctx, x, y, 0.5, 0.5);
        for (let yy = 1; yy < 3; yy++) { const xx = x + (Math.floor(phase) + yy) % 2 * 0.5, target = world.get(xx, y - yy); if (target !== Material.Air && target !== Material.Fire && target !== Material.Smoke) break; ctx.fillStyle = yy === 1 ? '#ef9d58' : '#bd7052'; pixelRect(ctx, xx, y - yy, 0.5, 0.5); }
      } else {
        const xx = x + (Math.floor(time * 4) + i) % 2 * 0.5;
        ctx.globalAlpha = 0.25; ctx.fillStyle = m === Material.Steam ? '#d1dfd5' : '#aea1a3'; pixelRect(ctx, xx, y, 1.5, 0.5); pixelRect(ctx, xx + 0.5, y - 0.5, 0.5, 0.5); ctx.globalAlpha = 1;
      }
    }
  }
}

/** Holds only weak projectile references. New runs/time rewinds reset recoil. */
export class PixelCastFeedback {
  private seen = new WeakSet<Projectile>();
  private run: Run | null = null;
  private lastTime = -Infinity;
  castUntil = -Infinity;
  update(run: Run) {
    if (this.run !== run || run.time < this.lastTime) { this.seen = new WeakSet(); this.castUntil = -Infinity; this.run = run; }
    this.lastTime = run.time;
    for (const shot of run.projectiles) if (!this.seen.has(shot)) {
      this.seen.add(shot);
      if (!shot.enemy && Math.hypot(shot.x - run.player.x, shot.y - run.player.y) < 24) this.castUntil = run.time + 0.12;
    }
  }
}

export function drawPixelProjectiles(ctx: CanvasRenderingContext2D, shots: readonly Projectile[], particles: readonly Particle[], time: number, view: TerrainViewport, quality: GraphicsQuality) {
  const detailed = quality !== 'low';
  for (const shot of shots) {
    if (!visible(shot.x, shot.y, view)) continue;
    const x = snap(shot.x), y = snap(shot.y), color = shot.enemy ? '#e992a0' : SPELLS[shot.spell].color;
    const speed = Math.max(1, Math.hypot(shot.vx, shot.vy)), dx = shot.vx / speed, dy = shot.vy / speed;
    const trail = Math.min(8, Math.max(2, speed * 0.024));
    ctx.globalAlpha = 0.32; pixelLine(ctx, x - dx * 1.5, y - dy * 1.5, x - dx * trail, y - dy * trail, color, 0.5); ctx.globalAlpha = 1;
    if (shot.spell === 'bomb' && !shot.enemy) {
      ctx.fillStyle = '#3b383d'; pixelRect(ctx, x - 1.5, y - 1, 3, 2.5); pixelRect(ctx, x - 1, y - 1.5, 2, 0.5);
      ctx.fillStyle = '#bc9158'; pixelRect(ctx, x - 1, y - 1, 1, 0.5); ctx.fillStyle = '#f6d88b'; pixelRect(ctx, x + 0.5, y - 2, 0.5, 0.5);
    } else {
      pixelLine(ctx, x - dx * Math.min(2.5, shot.radius), y - dy * Math.min(2.5, shot.radius), x, y, color, shot.radius > 2 ? 1 : 0.5);
      ctx.fillStyle = shot.enemy ? '#ffedc6' : '#f0ffe0'; pixelRect(ctx, x, y, 0.5, 0.5);
      if (detailed && shot.fire) { ctx.fillStyle = '#edb476'; pixelRect(ctx, snap(x - dx * 3 + Math.sin(time * 20) * 0.5), snap(y - dy * 3 + 0.5), 0.5, 0.5); }
    }
  }
  // Reuse authoritative impact debris, emphasizing fresh hot cores and tails.
  for (let i = 0; i < particles.length; i++) {
    const pt = particles[i]; if (!visible(pt.x, pt.y, view) || (quality === 'low' && i % 2)) continue;
    ctx.globalAlpha = Math.min(1, pt.life * 3);
    if (detailed && pt.life > 0.25) pixelLine(ctx, pt.x, pt.y, pt.x - pt.vx * 0.045, pt.y - pt.vy * 0.045, pt.color);
    ctx.fillStyle = pt.life > 0.42 ? '#fff0c5' : pt.color; pixelRect(ctx, snap(pt.x), snap(pt.y), pt.life > 0.4 ? 1 : 0.5, 0.5);
  }
  ctx.globalAlpha = 1;
}

/** A world-space aim hint which terminates at the first solid cell. */
export function wandAimTarget(world: CellWorld, p: Pick<Player, 'x' | 'y'>, input: Pick<Input, 'aimX' | 'aimY'>) {
  const length = Math.hypot(input.aimX, input.aimY), dx = length > 0 ? input.aimX / length : 1, dy = length > 0 ? input.aimY / length : 0;
  let distance = 24;
  for (let d = 1; d <= 24; d += 0.5) if (MATERIALS[world.get(p.x + dx * d, p.y - 1 + dy * d)].solid) { distance = Math.max(0, d - 0.5); break; }
  return { x: snap(p.x + dx * distance), y: snap(p.y - 1 + dy * distance), distance, dx, dy };
}
export function drawWandAim(ctx: CanvasRenderingContext2D, world: CellWorld, p: Readonly<Player>, input: Readonly<Input>, cameraX: number, cameraY: number) {
  const target = wandAimTarget(world, p, input), x = target.x - cameraX, y = target.y - cameraY;
  if (target.distance < 8) return;
  // Four small corner notches leave the target cell and the opponent visible.
  ctx.fillStyle = input.fire ? '#e6e4b4' : '#91b7a8';
  for (const side of [-1, 1]) { pixelRect(ctx, x + side * 2, y - 0.5, 0.5, 1.5); pixelRect(ctx, x - 0.5, y + side * 2, 1.5, 0.5); }
  ctx.globalAlpha = 0.55;
  for (let d = 11; d < target.distance - 3; d += 6) pixelRect(ctx, snap(p.x + target.dx * d - cameraX), snap(p.y - 1 + target.dy * d - cameraY), 0.5, 0.5);
  ctx.globalAlpha = 1;
}
