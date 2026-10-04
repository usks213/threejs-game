import type { Adventure } from '../adventure';
import { meadowEnemy } from './world';
/** Host-owned events: progression gates, occupied-base check and timed waves. */
export function stepRaids(game:Adventure,dt:number):void{
 const s=game.state,m=s.meadows!,p=game.sim.player;
 if(s.seconds>=m.raidAt&&m.raid<=0){
  const check=Math.floor(s.seconds/2760);m.raidAt=s.seconds+2760;
  const roll=((Math.imul(check+7319,374761393)>>>0)%100)/100;
  const base=s.buildings.filter(b=>['bed','fire','bench','chest','standingTorch'].includes(b.definition)&&Math.hypot(b.x-p.x,b.z-p.z)<40);
  if(roll<.2&&base.length>=3){m.raidKind=s.defeated.includes('stormstag')?'forest':'animals';m.raid=m.raidKind==='forest'?120:90;m.raidCenter={x:p.x,z:p.z};m.raidSpawn=0;}
 }
 if(!m.raid||!m.raidCenter)return;
 const c=m.raidCenter,near=(game.sim.targets.length?game.sim.targets.map(t=>t.player):[p]).some(a=>Math.hypot(a.x-c.x,a.z-c.z)<64);if(!near)return;
 m.raid=Math.max(0,m.raid-dt);m.raidSpawn=Math.max(0,(m.raidSpawn??0)-dt);
 const pool=m.raidKind==='forest'?['greydwarf','greydwarf','greydwarfBrute','greydwarfShaman']:['boar','neck'];
 if(!m.raidSpawn&&s.enemies.filter(e=>e.health>0&&pool.includes(e.definition)&&Math.hypot(e.x-c.x,e.z-c.z)<40).length<6){m.raidSpawn=10;const angle=s.seconds*2.4,x=c.x+Math.sin(angle)*24,z=c.z+Math.cos(angle)*24,e=meadowEnemy(game.sim,pool[Math.floor(s.seconds/10)%pool.length],x,z);e.alerted=40;s.enemies.push(e);}
}
