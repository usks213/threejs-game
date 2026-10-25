/** Reproducible normal-input trajectory report. Never edits state to manufacture a dash. */
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { createBattle,stepBattle,STEP,kineticEnergy } from '../src/beyblade/core/physics';
import { parts,defaultBuild,profileFor,buildForBlade } from '../src/beyblade/data/catalog';
import type { Build,Launch } from '../src/beyblade/core/types';
const sourceHashes=Object.fromEntries(['src/beyblade/core/physics.ts','src/beyblade/core/types.ts','src/beyblade/data/catalog.ts','src/beyblade/data/physical-estimates.ts'].map(path=>[path,createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')]));
const id=(name:string,category:string)=>parts.find(p=>p.canonicalId===name&&p.category===category)!.id;
const stock=(blade:string,ratchet:string,bit:string):Build=>({...buildForBlade(id(blade,'blade')),ratchet:id(ratchet,'ratchet'),bit:id(bit,'bit')});
const builds=[stock('ドランソード','3-60','F'),stock('ヘルズサイズ','4-60','T'),stock('ウィザードアロー','4-80','B'),stock('ナイトシールド','3-80','N')];
const cases: {name:string;builds:[Build,Build];launches:[Launch,Launch]}[]=[
  {name:'public-default',builds:[defaultBuild,buildForBlade(id('ドランソード','blade'))],launches:[{power:.6,angle:15*Math.PI/180,tilt:20*Math.PI/180},{power:.76,angle:-.12,tilt:.11}]},
  {name:'previous-default-regression',builds:[defaultBuild,buildForBlade(id('ドランソード','blade'))],launches:[{power:.8,angle:0,tilt:8*Math.PI/180},{power:.76,angle:-.12,tilt:.11}]},
  ...builds.flatMap((build,i)=>[0,.14,.35].map(tilt=>({name:`${i}-${tilt}`,builds:[build,builds[(i+1)%builds.length]] as [Build,Build],launches:[{power:.8,angle:0,tilt},{power:.76,angle:-.12,tilt:.11}] as [Launch,Launch]}))),
];
const reports=cases.map(c=>{
  const battle=createBattle([profileFor(c.builds[0]),profileFor(c.builds[1])],c.launches),start=performance.now();
  const samples:unknown[]=[],events:typeof battle.events=[];let priorTick=-1,maxSpeed=0,maxTilt=0,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<240*40&&!battle.result;i++){
    stepBattle(battle);for(const e of battle.events)if(e.tick>priorTick)events.push(structuredClone(e));priorTick=battle.tick;
    for(const top of battle.tops){maxSpeed=Math.max(maxSpeed,Math.hypot(top.vx,top.vy,top.vz));maxTilt=Math.max(maxTilt,top.tilt);minY=Math.min(minY,top.y);maxY=Math.max(maxY,top.y);}
    if(i%24===0)samples.push({time:battle.tick*STEP,tops:battle.tops.map(t=>({x:t.x,y:t.y,z:t.z,omega:t.omega,tilt:t.tilt,orientation:t.orientation,speed:Math.hypot(t.vx,t.vy,t.vz),kinetic:kineticEnergy(t),rail:t.rail.engaged}))});
  }
  return {name:c.name,builds:c.builds.map(b=>profileFor(b).name),launches:c.launches,computeMs:performance.now()-start,time:battle.tick*STEP,result:battle.result,maxSpeed,maxTilt,minY,maxY,eventCounts:Object.fromEntries(['rail-engage','rail-release','dash','collision','finish'].map(kind=>[kind,events.filter(e=>e.kind===kind).length])),events,samples};
});
const report={status:'uncalibrated-mechanism-validation-not-real-world-equivalence',coreSha256:sourceHashes['src/beyblade/core/physics.ts'],sourceHashes,cases:reports};
const output=JSON.stringify(report,null,2);if(process.argv[2])writeFileSync(process.argv[2],output+'\n');else console.log(output);
console.error(JSON.stringify(reports.map(({name,time,result,eventCounts,computeMs,maxSpeed,maxTilt})=>({name,time,result,eventCounts,computeMs,maxSpeed,maxTilt})),null,2));
