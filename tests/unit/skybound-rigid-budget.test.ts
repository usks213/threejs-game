import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import type { SkyContext,SkyPart } from '../../src/game/skybound/types';
import { RIGID_BUDGET } from '../../src/game/skybound/rigid';
import { WORLD } from '../../src/world/types';
it('records fixed-budget angular workloads without confusing Node simulation measurements with device FPS',()=>{
 const report:{assemblies:number;parts:number;water:boolean;p50Ms:number;p95Ms:number;maxMs:number;maxContacts:number;maxHistoryFrames:number;snapshotBytes:number}[]=[];
 for(const [assemblies,total] of [[1,16],[4,32],[16,64]])for(const water of [false,true]){
  const per=total/assemblies,parts:SkyPart[]=[];
  for(let group=0;group<assemblies;group++)for(let j=0;j<per;j++){const id=group*per+j+1;parts.push({id,kind:'block',material:'wood',mass:6,position:{x:(group%4)*8-12+(j%4)*1.05,y:3,z:Math.floor(group/4)*8-12+Math.floor(j/4)*1.05},velocity:{x:0,y:0,z:0},rotation:0,links:j?[group*per+1]:Array.from({length:per-1},(_,k)=>group*per+k+2),epoch:0});}
  const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{},actors:[{id:'observer',position:{x:0,y:0,z:0}}],solid:p=>p.y<0,immersion:()=>water?.5:0};
  const elapsed:number[]=[];let maxContacts=0,maxHistoryFrames=0;
  for(let tick=0;tick<150;tick++){context.tick++;if(tick%15===0)for(let group=0;group<assemblies;group++)powers.applyImpulse(group*per+1,{x:.4,y:0,z:.2});const start=performance.now();powers.step(1/30,context);elapsed.push(performance.now()-start);const metrics=powers.snapshot('observer').physics!;maxContacts=Math.max(maxContacts,metrics.contacts);maxHistoryFrames=Math.max(maxHistoryFrames,metrics.historyFrames);}
  elapsed.sort((a,b)=>a-b);expect(powers.state.parts).toHaveLength(total);expect(maxContacts).toBeLessThanOrEqual(assemblies*RIGID_BUDGET.contacts*RIGID_BUDGET.substeps);expect(maxHistoryFrames).toBeLessThanOrEqual(total*121);expect(powers.state.parts.every(p=>p.q&&[p.q.x,p.q.y,p.q.z,p.q.w,p.position.x,p.position.y,p.position.z].every(Number.isFinite))).toBe(true);
  report.push({assemblies,parts:total,water,p50Ms:elapsed[75],p95Ms:elapsed[142],maxMs:elapsed[149],maxContacts,maxHistoryFrames,snapshotBytes:JSON.stringify(powers.snapshot('observer')).length});
 }
 writeFileSync('/tmp/voxel-rigid-budget.json',JSON.stringify({scope:'Node, synthetic flat terrain, 150 ticks/case, periodic impulses; excludes browser GPU/network/real terrain cache. No measured device FPS.',budget:RIGID_BUDGET,report},null,2));
},20000);
