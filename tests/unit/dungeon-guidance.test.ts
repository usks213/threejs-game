import {describe,it,expect} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {raidGuidance,raidRoute,guidanceBearing,clearRouteSegment} from '../../src/dungeon/guidance';
import {dungeonTarget} from '../../src/dungeon/interaction';
import {wallRay} from '../../src/dungeon/world';
function raid(){const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'New explorer')!;sim.command(p.actor.id,1,{kind:'ready'});sim.command(p.actor.id,2,{kind:'start'});return sim.snapshot(p.actor.id);}
describe('first raid guidance and interaction',()=>{
 it('starts with the nearby unlocked chest, then gives an extraction goal after taking valuables',()=>{
  const s=raid(),a=s.actors[0];expect(raidGuidance(s)).toMatchObject({goal:'loot',target:'chest0'});
  a.bag.push({id:'loot',kind:'relic',quality:1,count:1,x:4,y:0,rotated:false,found:false});
  expect(raidGuidance(s)).toMatchObject({goal:'return',target:'exit-west',detail:expect.stringContaining('45秒')});
  s.elapsed=45;expect(raidGuidance(s)?.detail).toContain('4秒静止');
 });
 it('does not direct to spent exits, locked treasure or enemies, and guides injured players home',()=>{
  const s=raid();s.actors[0].hp=20;s.exits[0].remaining=0;const guide=raidGuidance(s);expect(guide?.goal).toBe('return');expect(guide?.target).not.toBe('exit-west');expect(guide?.detail).toContain('注意');
  s.actors[0].status='dead';expect(raidGuidance(s)).toBeNull();
 });
 it('routes across the actual central doorway rather than directing straight through a wall',()=>{
  const s=raid(),from={x:-11,y:0,z:11},to={x:-11,y:0,z:-11};
  const path=raidRoute(s,from,to);expect(path.length).toBeGreaterThan(3);expect(path.some(p=>Math.abs(p.x)<3&&p.z===5)).toBe(true);
  const open=s.doors.map(d=>({...d,open:true}));let previous=from;
  for(const p of path){expect(wallRay({...previous,y:1.3},{...p,y:1.3},s.seed,open)).toBeNull();previous=p;}
 });
 it('gives a contextual door action before a closed passage',()=>{
  const s=raid();s.actors[0].position={x:0,y:0,z:6.5};s.actors[0].hp=10;s.exits=s.exits.filter(exit=>exit.id==='exit-north');
  expect(raidGuidance(s)?.detail).toContain('扉');expect(raidGuidance(s)?.waypoint).toEqual(s.doors.find(d=>d.id==='door-south')!.position);
 });
 it('uses the same pickup range for E and opened containers, respecting solid walls',()=>{
  const s=raid(),a=s.actors[0],box=s.containers[0];a.position={x:box.position.x,y:0,z:box.position.z+2.45};box.opened=true;
  expect(dungeonTarget(s,{yaw:0,pitch:0})).toBe(box.id);
  a.position.z=box.position.z+2.55;expect(dungeonTarget(s,{yaw:0,pitch:0})).not.toBe(box.id);
  a.position={x:-12,y:0,z:3};box.position={x:-12,y:0,z:6};expect(dungeonTarget(s,{yaw:Math.PI,pitch:0})).not.toBe(box.id);
 });
 it('prefers an open exit over a nearer portal that stays locked for another minute',()=>{
  const s=raid();s.actors[0].position={x:0,y:0,z:-10};s.actors[0].hp=10;s.elapsed=100;
  expect(raidGuidance(s)?.target).toBe('exit-east');
 });
 it('keeps a valid route when rounding the player would land inside a wall',()=>{
  const s=raid(),from={x:-12,y:0,z:4.6},to={x:-12,y:0,z:7};
  const route=raidRoute(s,from,to);expect(route.length).toBeGreaterThan(0);
  expect(wallRay({...from,y:1.3},{...route[0],y:1.3},s.seed,s.doors.map(d=>({...d,open:true})))).toBeNull();
 });
 it('never smooths the direction through a pillar that would clip the player body',()=>{
  const s=raid();s.doors.forEach(d=>d.open=true);s.actors[0].position={x:-11,y:0,z:11};s.actors[0].hp=10;s.exits=s.exits.filter(e=>e.id==='exit-north');
  const guide=raidGuidance(s)!;expect(clearRouteSegment(s.actors[0].position,guide.waypoint,s.seed,s.doors)).toBe(true);
  expect(clearRouteSegment(s.actors[0].position,{x:-1,y:0,z:8},s.seed,s.doors)).toBe(false);
 });
 it('permits directions away from and along an exactly touching but nonpenetrating wall',()=>{
  const s=raid(),from={x:-12,y:0,z:4.7};
  expect(clearRouteSegment(from,{x:-12,y:0,z:3},s.seed,s.doors)).toBe(true);
  expect(clearRouteSegment(from,{x:-11,y:0,z:4.7},s.seed,s.doors)).toBe(true);
  expect(clearRouteSegment(from,{x:-12,y:0,z:4.8},s.seed,s.doors)).toBe(false);
 });
 it('takes a fresh default explorer through the guided first loot and return without pulling a guard',()=>{
  const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'First raid')!;
  const command=(action:Parameters<typeof sim.command>[2])=>sim.command(p.actor.id,p.lastAction+1,action);
  command({kind:'ready'});command({kind:'start'});
  const step=(x=0,z=0)=>{sim.input(p.actor.id,p.actor.seq+1,{x,z,yaw:0,pitch:0,block:false,crouch:false});sim.step();expect(p.actor.hp).toBe(p.actor.maxHp);expect(sim.state.enemies.every(e=>e.alert===0)).toBe(true);};
  const follow=()=>{
   for(let n=0;n<300;n++){
    const snapshot=sim.snapshot(p.actor.id),guide=raidGuidance(snapshot)!;
    const target=[...snapshot.containers,...snapshot.exits].find(t=>t.id===guide.target)!;
    if(Math.hypot(target.position.x-p.actor.position.x,target.position.z-p.actor.position.z)<2.25)return guide.target;
    const dx=guide.waypoint.x-p.actor.position.x,dz=guide.waypoint.z-p.actor.position.z,length=Math.hypot(dx,dz);
    step(dx/Math.max(1,length),-dz/Math.max(1,length));
   }
   throw Error('First-raid directions did not converge');
  };
  const chestId=follow();step();command({kind:'interact',target:chestId});for(let n=0;n<32;n++)step();
  const chest=sim.state.containers.find(c=>c.id===chestId)!;expect(chest.opened).toBe(true);
  command({kind:'loot',target:chestId,item:chest.items.find(i=>i.kind==='relic')!.id});
  const exitId=follow();step();while(sim.state.elapsed<45)step();command({kind:'interact',target:exitId});for(let n=0;n<82;n++)step();
  expect(p.actor.status).toBe('extracted');expect(p.stash.some(i=>i.kind==='relic')).toBe(true);
 });
 it('keeps bearings relative to the camera without rotating the player',()=>{
  const from={x:0,y:0,z:0};expect(guidanceBearing(from,{x:0,y:0,z:-1},{yaw:0})).toBe('↑');expect(guidanceBearing(from,{x:1,y:0,z:0},{yaw:0})).toBe('→');expect(guidanceBearing(from,{x:0,y:0,z:1},{yaw:0})).toBe('↓');expect(guidanceBearing(from,{x:0,y:0,z:-1},{yaw:Math.PI/2})).toBe('→');
 });
});
