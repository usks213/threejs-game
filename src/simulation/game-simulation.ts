import { detachedVoxels } from '../world/support';
import { Adventure } from '../game/adventure';
import type { EditKind } from '../world/types';
import { SdfWorld, terrainHeight } from '../world/density';
import { FluidGrid } from '../fluid/fluid';
import { stepSphere, type SphereBody } from '../physics/sphere';
import { CharacterMotor } from '../physics/character';
import { collidePlayerRocks, collideRocks } from '../physics/contacts';
import { insideBounds, type Vec3 } from '../world/types';
import { validateSave, type WorldSave } from '../save/format';
import type { PlayerInput, PlayerState, Tool } from './protocol';
export const TICK_RATE = 30;
export class GameSimulation {
  adventure: Adventure;
  targets: { player: PlayerState; adventure: Adventure }[] = [];
  readonly world: SdfWorld;
  private readonly character: CharacterMotor;
  readonly fluid: FluidGrid;
  readonly bodies: SphereBody[] = [];
  readonly player: PlayerState = { x: 0, y: terrainHeight(0, 8), z: 8, heading: 0, vy: 0, grounded: true };
  readonly metrics = { tickMs: 0, fluidMs: 0, physicsMs: 0, jumpHeight: 0 };
  tick = 0;
  private lastAction = -100;
  private nextBody = 1;
  private jumpOrigin: number | null = null;
  constructor(save?: WorldSave | null) {
    this.world = new SdfWorld(undefined,save?.generator ?? 2); this.character = new CharacterMotor(this.world); this.fluid = new FluidGrid(this.world);
    if (save) {
      const valid = validateSave(save);
      for (const e of valid.edits) this.world.apply(e);
      Object.assign(this.player, valid.player);
      this.player.grounded = false;
      this.fluid.restore(valid.fluids);
      this.bodies.push(...valid.bodies);
      this.nextBody = Math.max(0, ...this.bodies.map(b => b.id)) + 1;
      this.tick = Math.max(0, ...valid.edits.map(e => e.tick));
    }
    this.adventure = new Adventure(this, save?.adventure);
  }
  step(input: PlayerInput): void {
    const started = performance.now(); this.tick++;
    const dt = 1 / TICK_RATE;
    const ix = Number.isFinite(input.x) ? input.x : 0, iz = Number.isFinite(input.z) ? input.z : 0;
    const length = Math.max(1, Math.hypot(ix, iz));
    const immersion = this.fluid.immersion(this.player, 1.45), speed = this.adventure.state.health <= 0 ? 0 : this.adventure.guarding ? 2 : 4 * (1 - immersion * 0.45) * (this.adventure.state.chill ? 0.65 : 1);
    const flow = this.fluid.current(this.player);
    const dx = ix / length * speed * dt + flow.x * immersion * dt, dz = iz / length * speed * dt + flow.z * immersion * dt;
    const p = this.player;
    if (dx || dz) p.heading = Math.atan2(dx, dz);
    const beforeJump = p.y;
    if (this.character.step(p, dx, dz, input.jump, dt, immersion)) { this.jumpOrigin = beforeJump; this.metrics.jumpHeight = 0; }
    p.x = Math.max(this.world.bounds.minX + 1, Math.min(this.world.bounds.maxX - 1, p.x));
    p.z = Math.max(this.world.bounds.minZ + 1, Math.min(this.world.bounds.maxZ - 1, p.z));
    if (this.jumpOrigin !== null) { this.metrics.jumpHeight = Math.max(this.metrics.jumpHeight, p.y - this.jumpOrigin); if (p.grounded) this.jumpOrigin = null; }
    if (p.y < this.world.bounds.minY + 1) this.resetPlayer();
    const physics = performance.now();
    const active = this.bodies.filter(b => Math.hypot(b.position.x - p.x, b.position.z - p.z) < 48);
    for (const body of active) {
      const water = this.fluid.immersion({ x: body.position.x, y: body.position.y - body.radius, z: body.position.z }, body.radius * 2);
      if (water > 0) { body.sleeping = false; const damping = Math.exp(-water * 3 * dt), current = this.fluid.current(body.position); body.velocity.x = (body.velocity.x + current.x * water * dt) * damping; body.velocity.z = (body.velocity.z + current.z * water * dt) * damping; body.velocity.y = body.velocity.y * damping + (body.kind==='wood'?22:9) * water * dt; }
      stepSphere(body, this.world, dt);
    }
    for (let pass = 0; pass < 2; pass++) {
      collideRocks(active);
      for (const body of active) stepSphere(body, this.world, 0);
    }
    collidePlayerRocks(p, active, dx, dz, dt);
    for (const body of active) stepSphere(body, this.world, 0);
    const ice = this.fluid.iceHeight(p); if (ice !== null && p.vy <= 0 && beforeJump >= ice - 0.1 && p.y <= ice) { p.y = ice; p.vy = 0; p.grounded = true; }
    this.adventure.collidePlayer(beforeJump);
    this.character.reconcile(p);
    for (let i = this.bodies.length - 1; i >= 0; i--) if (!insideBounds(this.bodies[i].position, this.world.bounds, 0.6)) this.bodies.splice(i, 1);
    this.metrics.physicsMs = performance.now() - physics;
    if (this.tick % 3 === 0) { const fluid = performance.now(); this.fluid.step(); this.metrics.fluidMs = performance.now() - fluid; }
    this.adventure.step(dt);
    this.metrics.tickMs = performance.now() - started;
  }
  act(tool: Tool, target: Vec3): { dirty: string[]; message: string } {
    if (!insideBounds(target, this.world.bounds, 3) || Math.hypot(target.x - this.player.x, target.y - this.player.y - 0.7, target.z - this.player.z) > 7) throw new Error('近くの地面に照準を合わせてください');
    if (this.tick - this.lastAction < 8) throw new Error('少し待ってから操作してください');
    this.lastAction = this.tick;
    if (tool === 'dig' || tool === 'add') {
      const dirty = this.changeTerrain(tool,target,1.7);
      for (const body of this.bodies) body.sleeping = false;
      this.adventure.support();
      return { dirty, message: tool === 'dig' ? '地面を掘りました' : '地面を盛りました' };
    }
    if (tool === 'water') {
      let volume = 0;
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 1; y <= 3; y++) volume += this.fluid.add({ x: target.x + x, y: target.y + y, z: target.z + z });
      return { dirty: [], message: volume ? '水を流しました' : '水の上限、または地形で塞がれています' };
    }
    if (tool !== 'rock') throw new Error('未知の操作です');
    this.bodies.push({ id: this.nextBody++, position: { x: target.x, y: Math.min(this.world.bounds.maxY - 1, target.y + 4), z: target.z }, velocity: { x: 0, y: 0, z: 0 }, radius: 0.55, sleeping: false });
    return { dirty: [], message: '岩を落としました。歩いて押す・飛び乗る・足元を掘る操作を試せます' };
  }
  groundAt(x: number, z: number): number {
    let y = this.world.heightAt(x, z); const point = { x, y, z };
    for (let i = 0; i < 12; i++) { point.y = y; const d = this.world.density(point); if (Math.abs(d) < 0.02) break; y -= Math.max(-1, Math.min(1, d)); }
    return y;
  }
  movePlayer(dx: number, dz: number): void { this.character.step(this.player, dx, dz, false, 0); }
  editGround(kind: EditKind, position: Vec3, radius: number): string[] {
    if (Math.hypot(position.x - this.player.x, position.y - this.player.y, position.z - this.player.z) > 7) throw new Error('近くの地面に照準を合わせてください');
    const dirty = this.changeTerrain(kind,position,radius);
    for (const body of this.bodies) body.sleeping = false;
    this.adventure.support(); return dirty;
  }
  dropDebris(position:Vec3,kind:'wood'|'debris',count=1):void {
    for(let i=0;i<count;i++)this.bodies.push({id:this.nextBody++,position:{x:position.x+(i-count/2)*0.5,y:Math.min(this.world.bounds.maxY-1,position.y+i*0.3),z:position.z},velocity:{x:0,y:0,z:0},radius:0.55,sleeping:false,kind});
  }
  private changeTerrain(kind:EditKind,position:Vec3,radius:number):string[]{
    const dirty=new Set(this.world.apply({id:this.world.edits.length+1,kind,position,radius,material:'stone',tick:this.tick}));
    for(const component of detachedVoxels(this.world,position)){
      for(const p of component){
        if(!insideBounds(p,this.world.bounds,0.9))continue;
        for(const id of this.world.apply({id:this.world.edits.length+1,kind:'dig',position:p,radius:0.9,material:'stone',tick:this.tick}))dirty.add(id);
        this.dropDebris(p,'debris');
      }
    }
    return [...dirty];
  }
  resetPlayer(): void { this.character.reset(); this.player.x = 0; this.player.z = 8; this.player.y = terrainHeight(0, 8) + 3; this.player.vy = 0; this.player.grounded = false; this.jumpOrigin = null; this.metrics.jumpHeight = 0; }
  save(): WorldSave {
    return { version: 2, adventure: this.adventure.save(), generator: this.world.generator, seed: this.world.bounds.seed, player: { x: this.player.x, y: this.player.y, z: this.player.z }, edits: this.world.edits.map(e => ({ ...e, position: { ...e.position } })), fluids: this.fluid.snapshot().map(c => ({ x: c.x, y: c.y, z: c.z, volume: c.volume })), bodies: this.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
  }
}
