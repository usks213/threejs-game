import {characterHeight} from '../physics/character-shape';
import {migrateCampGear} from '../game/equipment/camp';
import {recoverGearFlights} from '../game/equipment/flights';
import {maximumGearId,maximumCampGearId} from '../game/equipment/validation';
import {validateSharedPins,type SharedPin} from '../game/shared-pins';
import {ensureAdventureSites} from '../game/sites';
import {AdventureCompanions} from '../game/companions';
import {TerrainUndo} from '../game/terrain-undo';
import {keepBodiesOutsideProtected} from '../game/skybound/protection';
import { ensureAdventureTrials } from '../content/adventure-trials';
import { applySkyEffects } from '../game/skybound-effects';
import { SkyboundPowers } from '../game/skybound/powers';
import { skyContext } from '../game/skybound/context';
import { dropItem } from '../game/interaction/drops';
import { migrateMeadows } from '../game/meadows/migration';
import { updateWaterObstacles } from '../game/meadows/water-obstacles';
import { driveRaft } from '../game/meadows/facilities';
import { movementSpeed, payJump } from '../game/meadows/movement';
import { detachedVoxels } from '../world/support';
import { Adventure } from '../game/adventure';
import type { EditKind } from '../world/types';
import { SdfWorld, terrainHeight } from '../world/density';
import { FluidGrid } from '../fluid/fluid';
import { stepSphere, type SphereBody } from '../physics/sphere';
import { CharacterMotor } from '../physics/character';
import { collidePlayerRocks, collideRocks } from '../physics/contacts';
import { insideBounds, finiteVec, type Vec3 } from '../world/types';
import { validateSave, type WorldSave } from '../save/format';
import type { PlayerInput, PlayerState, Tool } from './protocol';
export const TICK_RATE = 30;
export class GameSimulation {
  debugFlightAllowed=true;
  sessionSpawns?: () => readonly Vec3[];
  readonly terrainHistory=new TerrainUndo(this);
  adventure: Adventure;
  readonly skybound: SkyboundPowers;
  readonly companions:AdventureCompanions;
  readonly sharedPins:SharedPin[]=[];
  targets: { player: PlayerState; adventure: Adventure }[] = [];
  readonly world: SdfWorld;
  private readonly character: CharacterMotor;
  readonly fluid: FluidGrid;
  readonly bodies: SphereBody[] = [];
  readonly player: PlayerState = { x: 0, y: terrainHeight(0, 8), z: 8, heading: 0, vy: 0, grounded: true };
  readonly metrics = { tickMs: 0, fluidMs: 0, physicsMs: 0, jumpHeight: 0 };
  tick = 0;
  readonly pendingEdits=new Set<string>();
  private readonly lastActions = new Map<string, number>();
  private nextEntity = 3000001;
  private nextBody = 1;
  private jumpOrigin: number | null = null;
  constructor(save?: WorldSave | null, generator:1|2|3|4 = 4) {
    this.world = new SdfWorld(undefined,save?.generator ?? generator); this.character = new CharacterMotor(this.world); this.fluid = new FluidGrid(this.world,this.world.generator>=3?.5:1);
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
    if(save?.sharedPins)this.sharedPins.push(...validateSharedPins(save.sharedPins));this.nextEntity=Math.max(this.nextEntity,save?.nextEntityId??0,...this.sharedPins.map(p=>p.id+1));
    if(save?.adventure)this.nextEntity=Math.max(this.nextEntity,maximumGearId(save.adventure)+1);for(const member of save?.members??[])this.nextEntity=Math.max(this.nextEntity,maximumGearId(member.adventure)+1);
    if(save?.skybound)this.nextEntity=Math.max(this.nextEntity,maximumCampGearId(save.skybound)+1);
    this.skybound = new SkyboundPowers(save?.skybound);
    for (const entity of [...(save?.adventure?.resources ?? []), ...(save?.adventure?.enemies ?? []), ...(save?.adventure?.buildings ?? [])]) this.nextEntity = Math.max(this.nextEntity, entity.id + 1);
    migrateCampGear(this);
    this.adventure = new Adventure(this, save?.adventure);migrateMeadows(this,this.adventure.state);ensureAdventureTrials(this,this.adventure.state);this.companions=new AdventureCompanions(this,save?.companions);ensureAdventureSites(this,this.adventure.state,!save);
    if(save){recoverGearFlights(this.adventure);if(this.adventure.state.meadows)updateWaterObstacles(this);}
    if(!save){this.player.y=this.groundAt(0,8);for(let x=-49;x<=-16;x+=.5)for(let z=-55;z<=24;z+=.5){const h=this.groundAt(x+.25,z+.25);for(let y=Math.max(-4,Math.ceil(h*2)/2);y<0;y+=.5)this.fluid.add({x,y,z},.95);}}
  }
  allocateEntityId(): number { if(this.nextEntity>=1e12)throw Error('ワールドの識別子が上限に達しました');return this.nextEntity++; }
  /** Candidate IDs remain unconsumed until their enclosing synchronous transaction commits. */
  reserveEntityIds(maximum:number):{allocate:()=>number;commit:()=>void}{
    const base=this.nextEntity;if(!Number.isSafeInteger(maximum)||maximum<0||base>1e12)throw Error('ワールドの識別子が上限に達しました');let used=0,committed=false;
    return {allocate:()=>{if(committed||used>=maximum||base+used>=1e12)throw Error('装備の識別子予約が不足しています');return base+used++;},commit:()=>{if(committed||this.nextEntity!==base)throw Error('識別子が更新されています。再試行してください');this.nextEntity=base+used;committed=true;}};
  }
  forgetActor(id: string): void { this.lastActions.delete(id); }
  step(input: PlayerInput): void {
    const started = performance.now(); this.tick++;
    const dt = 1 / TICK_RATE;
    const ix = Number.isFinite(input.x) ? input.x : 0, iz = Number.isFinite(input.z) ? input.z : 0;
    const length = Math.max(1, Math.hypot(ix, iz));
    const riding=this.companions.drive('host',input,this.player)||this.skybound.drive('host',input,this.player),traversal=this.adventure.traversal.beforeMove(input,dt);
    const wasGrounded=this.player.grounded,impactVy=this.player.vy;
    const immersion = this.fluid.immersion(this.player, characterHeight(this.player)), speed = this.adventure.traversal.debug.active?0:traversal.speed * movementSpeed(this.adventure,!!(ix||iz),immersion,dt);
    const flow = this.fluid.current(this.player);
    const dx = (traversal.wind?.x??0)*dt+ix / length * speed * dt + flow.x * Math.min(1, immersion * 3) * dt, dz = (traversal.wind?.z??0)*dt+iz / length * speed * dt + flow.z * Math.min(1, immersion * 3) * dt;
    const p = this.player;
    if ((dx || dz)&&!this.adventure.guarding&&!this.adventure.attack&&!this.adventure.dodge) p.heading = Math.atan2(dx, dz);
    const beforeJump = p.y;
    if (!riding&&!traversal.handled&&!driveRaft(this.adventure,ix,iz,dt)&&this.character.step(p, dx, dz, payJump(this.adventure,input.jump,p.grounded), dt, immersion)) { this.jumpOrigin = beforeJump; this.metrics.jumpHeight = 0; }
    p.x = Math.max(this.world.bounds.minX + 1, Math.min(this.world.bounds.maxX - 1, p.x));
    p.z = Math.max(this.world.bounds.minZ + 1, Math.min(this.world.bounds.maxZ - 1, p.z));
    if (this.jumpOrigin !== null) { this.metrics.jumpHeight = Math.max(this.metrics.jumpHeight, p.y - this.jumpOrigin); if (p.grounded) this.jumpOrigin = null; }
    if (p.y < this.world.bounds.minY + 1) this.resetPlayer();
    const physics = performance.now();
    const active = this.bodies.filter(b => this.targets.length ? this.targets.some(t => Math.hypot(b.position.x - t.player.x, b.position.z - t.player.z) < 48) : Math.hypot(b.position.x - p.x, b.position.z - p.z) < 48);
    for (const body of active) {
      const water = this.fluid.immersion({ x: body.position.x, y: body.position.y - body.radius, z: body.position.z }, body.radius * 2);
      if (water > 0) { body.sleeping = false; const damping = Math.exp(-water * 3 * dt), current = this.fluid.current({ x: body.position.x, y: body.position.y - body.radius, z: body.position.z }, body.radius * 2); body.velocity.x += (current.x - body.velocity.x) * Math.min(1, water * 12 * dt); body.velocity.z += (current.z - body.velocity.z) * Math.min(1, water * 12 * dt); body.velocity.y = body.velocity.y * damping + (body.kind==='wood'?22:9) * water * dt; }
      stepSphere(body, this.world, dt);
    }
    for (let pass = 0; pass < 2; pass++) {
      collideRocks(active);
      for (const body of active) stepSphere(body, this.world, 0);
    }
    keepBodiesOutsideProtected(this);
    collidePlayerRocks(p, active, dx, dz, dt);
    for (const body of active) stepSphere(body, this.world, 0);
    const ice = this.fluid.iceHeight(p); if (ice !== null && p.vy <= 0 && beforeJump >= ice - 0.1 && p.y <= ice) { p.y = ice; p.vy = 0; p.grounded = true; }
    this.adventure.collidePlayer(beforeJump);
    this.character.reconcile(p);this.applyLanding(wasGrounded,impactVy,immersion);
    for (let i = this.bodies.length - 1; i >= 0; i--) if (!insideBounds(this.bodies[i].position, this.world.bounds, 0.6)) this.bodies.splice(i, 1);
    this.metrics.physicsMs = performance.now() - physics;
    if (this.tick % 3 === 0) { const fluid = performance.now(); if(this.adventure.state.meadows)updateWaterObstacles(this);this.fluid.step(this.targets.length ? this.targets.map(t => t.player) : [this.player]); this.metrics.fluidMs = performance.now() - fluid; }
    this.companions.step(dt);
    applySkyEffects(this,this.skybound.step(dt, skyContext(this)));
    this.adventure.step(dt);
    this.metrics.tickMs = performance.now() - started;
  }
  applyLanding(wasGrounded:boolean,impactVy:number,immersion:number,game=this.adventure):void{if(this.world.generator===4&&!wasGrounded&&this.player.grounded&&immersion<.5&&impactVy< -9)game.hurtPlayer(Math.min(60,(-impactVy-9)*3),'physical',this.player);}
  act(tool: Tool, target: Vec3, actorId = 'host'): { dirty: string[]; message: string } {
    if (tool === 'water') {
      const p = this.player, bounds = this.world.bounds;
      const aimed = target && finiteVec(target) && Math.hypot(target.x-p.x,target.y-p.y,target.z-p.z) <= 8 ? target : { x:p.x+Math.sin(p.heading)*2, y:p.y+0.6, z:p.z+Math.cos(p.heading)*2 };
      const origin = { x: Math.max(bounds.minX+3,Math.min(bounds.maxX-3,aimed.x)), y: Math.max(bounds.minY+1,Math.min(bounds.maxY-3,aimed.y+0.5)), z: Math.max(bounds.minZ+3,Math.min(bounds.maxZ-3,aimed.z)) };
      const direction = { x: origin.x-p.x, z: origin.z-p.z };
      if (Math.hypot(direction.x,direction.z)<0.1) { direction.x=Math.sin(p.heading); direction.z=Math.cos(p.heading); }
      this.fluid.pour(origin, direction);
      return { dirty: [], message: '水を流しました' };
    }
    if (!insideBounds(target, this.world.bounds, 3) || Math.hypot(target.x - this.player.x, target.y - this.player.y - 0.7, target.z - this.player.z) > 7) throw new Error('近くの地面に照準を合わせてください');
    if (this.tick - (this.lastActions.get(actorId) ?? -100) < 8) throw new Error('少し待ってから操作してください');
    this.lastActions.set(actorId, this.tick);
    if (tool === 'dig' || tool === 'add') {
      const cost=this.world.generator===4&&tool==='add'?5:0;if(cost&&(this.adventure.state.inventory.stone??0)<cost)throw Error('地形を盛るには石が5個必要です');
      const before=this.terrainHistory.begin();const dirty = this.changeTerrain(tool,target,1.7);if(cost)this.adventure.state.inventory.stone-=cost;
      for (const body of this.bodies) body.sleeping = false;
      this.adventure.support();if(this.world.generator===4){this.terrainHistory.record(actorId,before,target,cost);if(tool==='dig')this.adventure.progression.record('mine');}
      return { dirty, message: tool === 'dig' ? '地面を掘りました' : '地面を盛りました' };
    }
    if (tool !== 'rock') throw new Error('未知の操作です');
    this.bodies.push({ id: this.nextBody++, position: { x: target.x, y: Math.min(this.world.bounds.maxY - 1, target.y + 4), z: target.z }, velocity: { x: 0, y: 0, z: 0 }, radius: 0.55, sleeping: false });
    return { dirty: [], message: '岩を落としました。歩いて押す・飛び乗る・足元を掘る操作を試せます' };
  }
  groundAt(x: number, z: number, nearY?:number): number {
    if(this.world.generator===4&&nearY===undefined){const surface=this.world.heightAt(x,z);if(Math.abs(this.world.density({x,y:surface,z}))<.02)return surface;return this.groundAt(x,z,surface);}
    if(this.world.generator===4&&nearY!==undefined&&Number.isFinite(nearY)){
      let top=Math.min(this.world.bounds.maxY-1,nearY+1.2),previous=top;
      // Select the supporting surface in this layer, never the unrelated surface heightmap.
      if(this.world.density({x,y:top,z})<=0)return nearY;
      for(let y=top-.25;y>=this.world.bounds.minY;y-=.25){if(this.world.density({x,y,z})<=0){let low=y,high=previous;for(let i=0;i<8;i++){const mid=(low+high)/2;if(this.world.density({x,y:mid,z})<=0)low=mid;else high=mid;}return high;}previous=y;}
      return this.world.bounds.minY;
    }
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
    const yields=kind==='dig'&&this.world.density(position)<radius*.5;
    const dirty=new Set(this.world.apply({id:this.world.edits.length+1,kind,position,radius,material:'stone',tick:this.tick}));
    if(yields)dropItem(this.adventure,'stone',Math.max(1,Math.round(radius**3)),{x:position.x,y:position.y+.3,z:position.z});
    for(const component of detachedVoxels(this.world,position)){
      for(const p of component){
        if(!insideBounds(p,this.world.bounds,0.9))continue;
        for(const id of this.world.apply({id:this.world.edits.length+1,kind:'dig',position:p,radius:0.9,material:'stone',tick:this.tick}))dirty.add(id);
        this.dropDebris(p,'debris');
      }
    }
    return [...dirty];
  }
  resetPlayer(): void { this.adventure.traversal.stop(); this.character.reset(); this.player.x = 0; this.player.z = 8; this.player.y = this.groundAt(0, 8) + 1; this.player.vy = 0; this.player.grounded = false; this.jumpOrigin = null; this.metrics.jumpHeight = 0; }
  save(): WorldSave {
    this.adventure.gear.ensure();migrateCampGear(this);
    if(this.adventure.state.meadows)updateWaterObstacles(this);
    // Persistence needs every cell, but not the derived terrain floors used by rendering.
    // Keep the existing velocity precision without sampling the whole explored ocean.
    const fluids = Array.from(this.fluid.cells.values(), c => ({ x: c.x, y: c.y, z: c.z, size: c.size, volume: c.volume, vx: Math.round((c.vx ?? 0) * 1000) / 1000 || 0, vz: Math.round((c.vz ?? 0) * 1000) / 1000 || 0 }));
    const savedPlayer=this.adventure.traversal.debug.active?this.adventure.traversal.debug.savedPosition():this.player;
    return { version: 2,nextEntityId:this.nextEntity,sharedPins:this.sharedPins.map(p=>({...p,position:{...p.position}})), companions:this.companions.save(),skybound: this.skybound.save(), adventure: this.adventure.save(), generator: this.world.generator, seed: this.world.bounds.seed, player: { x: savedPlayer.x, y: savedPlayer.y, z: savedPlayer.z,...(this.player.crouching?{crouching:true}:{}) }, edits: this.world.edits.map(e => ({ ...e, position: { ...e.position } })), fluids, bodies: this.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
  }
}
