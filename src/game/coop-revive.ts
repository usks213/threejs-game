import type { Adventure } from './adventure';
import type { GameSimulation } from '../simulation/game-simulation';
import type { PlayerState } from '../simulation/protocol';
import { skyContext } from './skybound/context';
import { PART_HALF } from './skybound/types';
import { localPoint } from './voxel/model';
export const DOWNED_SECONDS = 20, REVIVE_SECONDS = 3, REVIVE_RANGE = 3;
export interface CoopSnapshot { downedSeconds: number; reviving?: {target: string; seconds: number; required: number}; beingRevived?: {by: string; seconds: number; required: number} }
interface Actor { id: string; player: PlayerState; adventure: Adventure; lastInputTick: number }
interface Hold { target: string; seconds: number; damageRevision: number }
/** One helper owns each hold; holds are transient and are never restored from a save. */
export class ReviveCoordinator {
 private readonly holds = new Map<string, Hold>();
 private valid(helper: Actor, target: Actor, sim: GameSimulation): boolean {
  if (helper === target || helper.adventure.state.health <= 0 || !(target.adventure.state.downed! > 0) || Math.hypot(helper.player.x - target.player.x, helper.player.y - target.player.y, helper.player.z - target.player.z) > REVIVE_RANGE) return false;
  const start = {...helper.player, y: helper.player.y + .8}, end = {...target.player, y: target.player.y + .6};
  const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z), context = skyContext(sim);
  for (let d = .15; d < length - .15; d += .1) {
   const p = {x: start.x + (end.x - start.x) * d / length, y: start.y + (end.y - start.y) * d / length, z: start.z + (end.z - start.z) * d / length};
   if (context.solid(p) || context.occupied?.(p) || sim.skybound.state.parts.some(part => { const q = localPoint(p, part.position, part.rotation), half = PART_HALF[part.kind]; return Math.abs(q.x) < half.x && Math.abs(q.y) < half.y && Math.abs(q.z) < half.z; })) return false;
  }
  return true;
 }
 start(id: string, targetId: string, actors: ReadonlyMap<string, Actor>, sim: GameSimulation): void {
  if (sim.world.generator !== 4) throw new Error('このワールドでは協力蘇生を使えません');
  if (!targetId) { this.cancel(id, actors); return; }
  const helper = actors.get(id), target = actors.get(targetId);
  if (!helper || !target || !this.valid(helper, target, sim)) throw new Error('倒れた仲間の3m以内で、姿が見える場所へ近づいてください');
  if ([...this.holds].some(([owner, hold]) => owner !== id && hold.target === targetId)) throw new Error('別の仲間が救助しています');
  if (this.holds.get(id)?.target === targetId) return;
  this.cancel(id, actors); this.holds.set(id, {target: targetId, seconds: 0, damageRevision: helper.adventure.damageRevision}); this.publish(actors);
 }
 cancelHelper(id: string, actors: ReadonlyMap<string, Actor>): void { this.holds.delete(id); this.publish(actors); }
 cancel(id: string, actors: ReadonlyMap<string, Actor>): void {
  for (const [helper, hold] of this.holds) if (helper === id || hold.target === id) this.holds.delete(helper);
  this.publish(actors);
 }
 step(dt: number, actors: ReadonlyMap<string, Actor>, sim: GameSimulation): void {
  for (const [id, hold] of this.holds) {
   const helper = actors.get(id), target = actors.get(hold.target);
   if (!helper || !target || helper.adventure.damageRevision !== hold.damageRevision || sim.tick - helper.lastInputTick > 15 || !this.valid(helper, target, sim)) { this.holds.delete(id); continue; }
   hold.seconds += dt;
   if (hold.seconds + 1e-8 >= REVIVE_SECONDS) { target.adventure.revive();helper.adventure.progression.record('revive');target.adventure.progression.record('revive'); this.holds.delete(id); }
  }
  this.publish(actors);
 }
 private publish(actors: ReadonlyMap<string, Actor>): void {
  for (const actor of actors.values()) { actor.adventure.helping = undefined; actor.adventure.receivingHelp = undefined; }
  for (const [id, hold] of this.holds) { const helper = actors.get(id), target = actors.get(hold.target); if (helper && target) { helper.adventure.helping = {target: hold.target, seconds: hold.seconds, required: REVIVE_SECONDS}; target.adventure.receivingHelp = {by: id, seconds: hold.seconds, required: REVIVE_SECONDS}; } }
 }
}
