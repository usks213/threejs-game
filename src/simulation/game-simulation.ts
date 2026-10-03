import { SdfWorld, terrainHeight } from '../world/density';
import { FluidGrid } from '../fluid/fluid';
import { stepSphere, type SphereBody } from '../physics/sphere';
import { insideBounds, type Vec3 } from '../world/types';
import { validateSave, type WorldSave } from '../save/format';
import type { PlayerInput, PlayerState, Tool } from './protocol';
export const TICK_RATE = 30;
export class GameSimulation {
  readonly world = new SdfWorld();
  readonly fluid = new FluidGrid(this.world);
  readonly bodies: SphereBody[] = [];
  readonly player: PlayerState = { x: 0, y: terrainHeight(0, 8), z: 8, heading: 0, vy: 0, grounded: true };
  readonly metrics = { tickMs: 0, fluidMs: 0, physicsMs: 0 };
  tick = 0;
  private lastAction = -100;
  private nextBody = 1;
  constructor(save?: WorldSave | null) {
    if (save) {
      const valid = validateSave(save);
      for (const e of valid.edits) this.world.apply(e);
      Object.assign(this.player, valid.player);
      for (const c of valid.fluids) this.fluid.add(c, c.volume);
      this.bodies.push(...valid.bodies);
      this.nextBody = Math.max(0, ...this.bodies.map(b => b.id)) + 1;
      this.tick = Math.max(0, ...valid.edits.map(e => e.tick));
    }
  }
  step(input: PlayerInput): void {
    const started = performance.now(); this.tick++;
    const dt = 1 / TICK_RATE;
    const ix = Number.isFinite(input.x) ? input.x : 0, iz = Number.isFinite(input.z) ? input.z : 0;
    const length = Math.max(1, Math.hypot(ix, iz));
    const dx = ix / length * 4 * dt, dz = iz / length * 4 * dt;
    const p = this.player, oldX = p.x, oldZ = p.z;
    p.x = Math.max(this.world.bounds.minX + 1, Math.min(this.world.bounds.maxX - 1, p.x + dx));
    p.z = Math.max(this.world.bounds.minZ + 1, Math.min(this.world.bounds.maxZ - 1, p.z + dz));
    if (dx || dz) p.heading = Math.atan2(dx, dz);
    // A small automatic step, then body/head collision. No height-map dependency.
    if (this.world.density({ x: p.x, y: p.y + 0.3, z: p.z }) < 0.25) {
      if (p.grounded && this.world.density({ x: p.x, y: p.y + 0.8, z: p.z }) > 0.28) p.y += 0.35;
      else { p.x = oldX; p.z = oldZ; }
    }
    if (this.world.density({ x: p.x, y: p.y + 1.15, z: p.z }) < 0.25) { p.x = oldX; p.z = oldZ; }
    if (input.jump && p.grounded) { p.vy = 6; p.grounded = false; }
    p.vy = Math.max(-12, p.vy - 14 * dt); p.y += p.vy * dt; p.grounded = false;
    const foot = { x: p.x, y: p.y + 0.3, z: p.z };
    const d = this.world.density(foot);
    if (d < 0.3) {
      const n = this.world.normal(foot, { x: 0, y: 0, z: 0 });
      if (n.y > 0.45 && p.vy <= 0) { p.y += Math.min(0.8, (0.3 - d) / n.y); p.vy = 0; p.grounded = true; }
    }
    if (p.vy > 0 && this.world.density({ x: p.x, y: p.y + 1.4, z: p.z }) < 0.25) { p.y -= p.vy * dt; p.vy = 0; }
    if (p.y < this.world.bounds.minY + 1) this.resetPlayer();
    const physics = performance.now();
    for (const body of this.bodies) stepSphere(body, this.world, dt);
    for (let i = this.bodies.length - 1; i >= 0; i--) if (!insideBounds(this.bodies[i].position, this.world.bounds, 0.6)) this.bodies.splice(i, 1);
    this.metrics.physicsMs = performance.now() - physics;
    if (this.tick % 3 === 0) { const fluid = performance.now(); this.fluid.step(); this.metrics.fluidMs = performance.now() - fluid; }
    this.metrics.tickMs = performance.now() - started;
  }
  act(tool: Tool, target: Vec3): { dirty: string[]; message: string } {
    if (!insideBounds(target, this.world.bounds, 3) || Math.hypot(target.x - this.player.x, target.y - this.player.y - 0.7, target.z - this.player.z) > 7) throw new Error('近くの地面に照準を合わせてください');
    if (this.tick - this.lastAction < 8) throw new Error('少し待ってから操作してください');
    this.lastAction = this.tick;
    if (tool === 'dig' || tool === 'add') {
      const dirty = this.world.apply({ id: this.world.edits.length + 1, kind: tool, position: target, radius: 1.7, material: 'stone', tick: this.tick });
      for (const body of this.bodies) body.sleeping = false;
      return { dirty, message: tool === 'dig' ? '地面を掘りました' : '地面を盛りました' };
    }
    if (tool === 'water') {
      let volume = 0;
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 1; y <= 3; y++) volume += this.fluid.add({ x: target.x + x, y: target.y + y, z: target.z + z });
      return { dirty: [], message: volume ? '水を流しました' : '水の上限、または地形で塞がれています' };
    }
    if (tool !== 'rock') throw new Error('未知の操作です');
    if (this.bodies.length >= 12) throw new Error('岩は最大12個です');
    this.bodies.push({ id: this.nextBody++, position: { x: target.x, y: Math.min(this.world.bounds.maxY - 1, target.y + 4), z: target.z }, velocity: { x: 0, y: 0, z: 0 }, radius: 0.55, sleeping: false });
    return { dirty: [], message: '岩を落としました。地面を掘ると再び落ちます' };
  }
  resetPlayer(): void { this.player.x = 0; this.player.z = 8; this.player.y = terrainHeight(0, 8) + 3; this.player.vy = 0; this.player.grounded = false; }
  save(): WorldSave {
    return { version: 1, generator: 1, seed: this.world.bounds.seed, player: { x: this.player.x, y: this.player.y, z: this.player.z }, edits: this.world.edits.map(e => ({ ...e, position: { ...e.position } })), fluids: this.fluid.snapshot(), bodies: this.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
  }
}
