import {describe,it,expect} from 'vitest';
import {attackPose,bladeWorld} from '../../src/prototype/core/motion';
import {dungeonBlade} from '../../src/dungeon/view';
import {dungeonTarget} from '../../src/dungeon/app';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import type {Snapshot} from '../../src/dungeon/types';
function raid(){const sim=new DungeonSimulation();const profile=sim.join('b'.repeat(64),'Player')!;sim.command(profile.actor.id,1,{kind:'ready'});sim.command(profile.actor.id,2,{kind:'start'});return sim.snapshot(profile.actor.id);}
function actor(snapshot:Snapshot){return snapshot.actors.find(a=>a.id===snapshot.you)!;}
describe('shared first-person blade and interaction focus',()=>{
 it.each(['sword','greatsword','dagger'] as const)('draws the same %s endpoints as the server sweep at every attack phase',weapon=>{const snapshot=raid(),own=actor(snapshot);own.weapon=weapon;own.position={x:2,y:0,z:3};own.yaw=.7;own.pitch=.4;for(const kind of ['slash','return','overhead']as const)for(const phase of ['idle','windup','strike','recover']as const){own.kind=kind;own.phase=phase;own.time=phase==='idle'?0:.1;const expected=bladeWorld(attackPose(kind,phase,own.time,1,weapon),own.position,own.yaw,own.pitch);expect(dungeonBlade(own)).toEqual(expected);}});
 it('caps visual pose advancement to bounded snapshot age',()=>{const own=actor(raid());own.phase='strike';own.time=.02;expect(dungeonBlade(own,own.yaw,own.pitch,9)).toEqual(dungeonBlade(own,own.yaw,own.pitch,.1));});
 it('focuses only nearby targets in front and refuses targets behind walls',()=>{const snapshot=raid(),own=actor(snapshot);snapshot.doors=[];snapshot.exits=[];snapshot.containers=[{id:'near',name:'box',kind:'chest',position:{x:0,y:0,z:0},opened:false,locked:false,items:[]}];own.position={x:0,y:0,z:2};expect(dungeonTarget(snapshot,{yaw:0,pitch:0})).toBe('near');expect(dungeonTarget(snapshot,{yaw:Math.PI,pitch:0})).toBeNull();own.position.z=3;expect(dungeonTarget(snapshot,{yaw:0,pitch:0})).toBeNull();own.position={x:-8,y:0,z:-4};snapshot.containers[0].position={x:-8,y:0,z:-6};expect(dungeonTarget(snapshot,{yaw:0,pitch:0})).toBeNull();});
 it('allows a closed door itself to be focused without permitting interaction through another door',()=>{const snapshot=raid(),own=actor(snapshot);snapshot.containers=[];snapshot.exits=[];own.position={x:0,y:0,z:-2.8};expect(dungeonTarget(snapshot,{yaw:0,pitch:0})).toBe('door-north');own.status='dead';expect(dungeonTarget(snapshot,{yaw:0,pitch:0})).toBeNull();});
});
