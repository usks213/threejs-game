import {distance,wallRay} from '../../../src/dungeon/world';
import type {Snapshot} from '../../../src/dungeon/types';
import {closeApproachKey} from './dungeon-approach';

/** Both ordinary door controls remain within 2.2m even with .24m settling error.
 * The players stage behind closed doors before either starts the engagement. */
export const CENTRAL_APPROACH = [
  {enemy: 'e0', door: 'door-south', point: {x: -1.4, z: 6.1}, retreat: {x: -2.4, z: 10.5}, reclaim: {x: -2.4, z: 1}},
  {enemy: 'e1', door: 'door-north', point: {x: 1.4, z: -6.1}, retreat: {x: 2.4, z: -10.5}, reclaim: {x: 2.4, z: -1}},
] as const;

/** Freeze this plan once both doors are open. If one opened first, both guards
 * correctly approached its visible explorer. That explorer makes space while
 * the opposite explorer comes closer on its own lateral side. */
export function centralRecoveryPoints(snapshot:Pick<Snapshot,'enemies'>){
 const drift=snapshot.enemies.filter(enemy=>enemy.id==='e0'||enemy.id==='e1').reduce((sum,enemy)=>sum+enemy.position.z,0);
 const early=drift>=0?0:1;
 return CENTRAL_APPROACH.map((approach,index)=>index===early?approach.retreat:approach.reclaim);
}

/** Ordinary local cardinal input; no turn, attack, hidden state or position write. */
export function centralRecoveryKeys(actor:Snapshot['actors'][number],target:{x:number;z:number}){
 const dx=target.x-actor.position.x,dz=target.z-actor.position.z;
 return Math.hypot(dx,dz)<=.2?[]:[closeApproachKey(actor.yaw,dx,dz)];
}

/** Do not begin independent fights until each visible guard prefers its owner
 * and the other guard is outside that owner's six-metre chain-combat radius. */
export function centralGuardsSplit(snapshot:Snapshot,players:readonly string[]){
 return CENTRAL_APPROACH.every((approach,index)=>{
  const actor=snapshot.actors.find(value=>value.id===players[index]);
  const other=snapshot.actors.find(value=>value.id===players[1-index]);
  const guard=snapshot.enemies.find(value=>value.id===approach.enemy);
  const otherGuard=snapshot.enemies.find(value=>value.id===CENTRAL_APPROACH[1-index].enemy);
  return !!actor&&!!other&&!!guard&&!!otherGuard&&actor.status==='alive'&&guard.status==='alive'
   &&distance(actor.position,guard.position)<=8
   &&distance(other.position,guard.position)-distance(actor.position,guard.position)>.35
   &&distance(actor.position,otherGuard.position)>6
   &&!wallRay({...actor.position,y:1.3},{...guard.position,y:1.3},snapshot.seed,snapshot.doors);
 });
}
