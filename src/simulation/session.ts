import { driveRaft } from '../game/meadows/facilities';
import { movementSpeed, payJump } from '../game/meadows/movement';
import { newMeadows } from '../game/meadows/state';
import { GameSimulation, TICK_RATE } from './game-simulation';
import { CharacterMotor } from '../physics/character';
import { collidePlayerRocks } from '../physics/contacts';
import { Adventure } from '../game/adventure';
import type { WorldSave } from '../save/format';
import type { AdventureSave } from '../game/types';
import type { ClientMessage, PlayerInput, PlayerState } from './protocol';
import { finiteVec } from '../world/types';
const idle: PlayerInput = { x: 0, z: 0, jump: false };
export interface SessionActor { id: string; player: PlayerState; adventure: Adventure; input: PlayerInput; motor: CharacterMotor; sequence: number; lastAction: number }
export class SessionAuthority {
 readonly sim: GameSimulation;
 private readonly dormant = new Map<string, { player: PlayerState; adventure: AdventureSave }>();
 readonly actors = new Map<string, SessionActor>();
 constructor(save?: WorldSave | null, readonly dedicated = false) { this.sim = new GameSimulation(save); this.actors.set('host', { id: 'host', player: this.sim.player, adventure: this.sim.adventure, input: { ...idle }, motor: new CharacterMotor(this.sim.world), sequence: 0, lastAction: -100 }); for (const member of save?.members ?? []) this.dormant.set(member.id, { player: { ...member.player, heading: 0, vy: 0, grounded: false }, adventure: member.adventure }); this.syncTargets(); }
 join(id: string): SessionActor {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid peer');
  const existing = this.actors.get(id); if (existing) return existing;
  if (this.actors.size >= (this.dedicated ? 9 : 8)) throw new Error('セッションは8人までです');
  const saved = this.sim.save().adventure!;
  const stored = this.dormant.get(id);
  const personal: AdventureSave = stored?.adventure ?? { ...saved, inventory: { berry: 3 }, equipment: 'hands', ...(saved.meadows?{meadows:newMeadows()}:{}), health: saved.meadows?25:100, stamina: saved.meadows?50:100, mana: 70, food: 0, rested: 0, spawn: null, death: null };
  const p = this.sim.player;
  const actor = { id, player: stored?.player ?? { ...p, x: p.x + this.actors.size * 0.8, grounded: false }, adventure: new Adventure(this.sim, personal), input: { ...idle }, motor: new CharacterMotor(this.sim.world), sequence: 0, lastAction: -100 };
  actor.adventure.owner = id; actor.adventure.projectiles = this.sim.adventure.projectiles;
  this.actors.set(id, actor); this.syncTargets(); return actor;
 }
 leave(id: string): void { const actor = this.actors.get(id); if (id !== 'host' && actor) { this.dormant.set(id, { player: { ...actor.player }, adventure: actor.adventure.save() }); this.actors.delete(id); this.sim.forgetActor(id); } this.syncTargets(); }
 private syncTargets(): void { this.sim.targets = [...this.actors.values()].filter(a => !this.dedicated || a.id !== 'host').map(a => ({ player: a.player, adventure: a.adventure })); }
 input(id: string, input: PlayerInput, sequence: number): void {
  const actor = this.actors.get(id); if (!actor || !Number.isSafeInteger(sequence) || sequence <= actor.sequence || !input || !Number.isFinite(input.x) || !Number.isFinite(input.z) || Math.abs(input.x) > 1 || Math.abs(input.z) > 1 || typeof input.jump !== 'boolean') return;
  actor.sequence = sequence; actor.input = { ...input, jump: actor.input.jump || input.jump };
 }
 private withActor<T>(actor: SessionActor, callback: () => T): T {
  if (actor.id === 'host') return callback();
  const mainPlayer = { ...this.sim.player }, mainAdventure = this.sim.adventure, state = actor.adventure.state, shared = mainAdventure.state;
  state.seconds = shared.seconds; state.unlocked = shared.unlocked; state.defeated = shared.defeated; state.resources = shared.resources; state.enemies = shared.enemies; state.buildings = shared.buildings;
  Object.assign(this.sim.player, actor.player); this.sim.adventure = actor.adventure;
  try { return callback(); } finally { Object.assign(actor.player, this.sim.player); shared.unlocked = state.unlocked; shared.defeated = state.defeated; shared.buildings = state.buildings; Object.assign(this.sim.player, mainPlayer); this.sim.adventure = mainAdventure; }
 }
 action(id: string, message: ClientMessage): { dirty: string[]; message: string } {
  const actor = this.actors.get(id); if (!actor) throw new Error('Unknown peer');
  const waterAction = message.type === 'action' && message.tool === 'water';
  if (!waterAction && this.sim.tick - actor.lastAction < 4) throw new Error('操作の間隔を空けてください');
  if (message.type !== 'action' && message.type !== 'game-action') throw new Error('この操作は許可されていません');
  if (message.type === 'game-action' && (!finiteVec(message.aim) || Math.hypot(message.aim.x, message.aim.y, message.aim.z) > 1.5)) throw new Error('照準データが不正です');
  if (!waterAction) actor.lastAction = this.sim.tick;
  return this.withActor(actor, () => message.type === 'action' ? this.sim.act(message.tool, message.target, actor.id) : this.sim.adventure.action(message.action, message.id, message.target, message.aim));
 }
 step(hostInput?: PlayerInput): void {
  const started = performance.now();
  const host = this.actors.get('host')!; this.sim.step(hostInput ?? host.input); host.input.jump = false;
  for (const actor of this.actors.values()) if (actor.id !== 'host') this.withActor(actor, () => {
   const input = actor.input, p = this.sim.player, dt = 1 / TICK_RATE, length = Math.max(1, Math.hypot(input.x, input.z)), water = this.sim.fluid.immersion(p, 1.45), speed = movementSpeed(actor.adventure,!!(input.x||input.z),water,dt);
   const flow = this.sim.fluid.current(p);
   const beforeY = p.y, dx = input.x / length * speed * dt + flow.x * Math.min(1, water * 3) * dt, dz = input.z / length * speed * dt + flow.z * Math.min(1, water * 3) * dt;
   if(!driveRaft(actor.adventure,input.x,input.z,dt))actor.motor.step(p, dx, dz, payJump(actor.adventure,input.jump,p.grounded), dt, water); input.jump = false;
   if (dx || dz) p.heading = Math.atan2(dx, dz);
   collidePlayerRocks(p, this.sim.bodies, dx, dz, dt);
   const ice = this.sim.fluid.iceHeight(p); if (ice !== null && p.vy <= 0 && beforeY >= ice - 0.1 && p.y <= ice) { p.y = ice; p.vy = 0; p.grounded = true; }
   actor.adventure.collidePlayer(beforeY); actor.motor.reconcile(p);
   p.x = Math.max(-999, Math.min(999, p.x)); p.z = Math.max(-999, Math.min(999, p.z));
   actor.adventure.stepPersonal(dt); if (p.y < -15) this.sim.resetPlayer();
  });
  this.sim.metrics.tickMs = performance.now() - started;
 }
 save(): WorldSave {
  const members = new Map(this.dormant);
  for (const actor of this.actors.values()) if (actor.id !== 'host') members.set(actor.id, { player: { ...actor.player }, adventure: actor.adventure.save() });
  return { ...this.sim.save(), members: [...members].map(([id, member]) => ({ id, player: member.player, adventure: member.adventure })) };
 }
 view(id: string) { const actor = this.actors.get(id); if (!actor) throw new Error('Unknown peer'); return this.withActor(actor, () => ({ player: { ...this.sim.player }, adventure: this.sim.adventure.snapshot(), peers: [...this.actors.values()].filter(a => a.id !== id && (!this.dedicated || a.id !== 'host')).map(a => ({ id: a.id, player: { ...a.player }, appearance: { equipment: a.adventure.state.equipment, attack: a.adventure.attack, guarding: a.adventure.guarding, dodging: a.adventure.dodge > 0, shield: !!a.adventure.state.inventory.shield } })) })); }
}

