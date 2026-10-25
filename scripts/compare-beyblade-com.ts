/** Reproducible controlled ratchet-only observations of the estimated model, not real-toy rankings. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parts,defaultBuild,profileFor} from '../src/beyblade/data/catalog';
import {createBattle,STEP,stepIsolatedTop,stepBattle,bodyAxis,rotate,setOrientation,kineticEnergy,totalEnergy,integrateFree,resolveContact,launchEnergyAt} from '../src/beyblade/core/physics';
import {principalInertias} from '../src/beyblade/data/assembly-mass';
import type {Profile,Top} from '../src/beyblade/core/types';
const part=(name:string,category:string)=>parts.find(p=>p.canonicalId===name&&p.category===category)!;
const referenceBuild={...defaultBuild,blade:part('ドランソード','blade').id,bit:part('F','bit').id,ratchet:part('3-60','ratchet').id};
const launch={power:.8,angle:0,tilt:8*Math.PI/180};
const snapshot=(t:Top)=>({position:{x:t.x,y:t.y,z:t.z},axis:bodyAxis(t),omega:t.omega,tilt:t.tilt,angularMomentum:{...t.angularMomentum},kineticEnergy:kineticEnergy(t)});
function isolated(profile:Profile,reference:Profile){
  const top=createBattle([profile,reference],[launch,launch]).tops[0],worldCOM=rotate(top.orientation,profile.centerOfMass!);
  // Controlled lab fixture: stem tip initially centered, 2mm above floor, no initial translation.
  top.x=worldCOM.x;top.z=worldCOM.z;top.y=worldCOM.y+.002;top.vx=top.vy=top.vz=0;
  const initial=snapshot(top),trace=[{seconds:0,...initial}];let ticks=0,sumTilt2=0,maxTilt=0,sumCOMRadius2=0,maxCOMRadius=0,sumStemRadius2=0,maxStemRadius=0;
  while(ticks<3/STEP&&!top.eliminated){stepIsolatedTop(top);ticks++;const c=rotate(top.orientation,profile.centerOfMass!),comRadius=Math.hypot(top.x,top.z),stemRadius=Math.hypot(top.x-c.x,top.z-c.z);sumTilt2+=top.tilt**2;maxTilt=Math.max(maxTilt,top.tilt);sumCOMRadius2+=comRadius**2;maxCOMRadius=Math.max(maxCOMRadius,comRadius);sumStemRadius2+=stemRadius**2;maxStemRadius=Math.max(maxStemRadius,stemRadius);if(ticks%60===0)trace.push({seconds:ticks*STEP,...snapshot(top)});}
  return {initial,final:snapshot(top),endpointInterpretation:'final is the sampled endpoint, dependent on precession phase; not a stability ranking',window:{samples:ticks,rmsTiltRadians:Math.sqrt(sumTilt2/ticks),maxTiltRadians:maxTilt,rmsCOMRadiusMetres:Math.sqrt(sumCOMRadius2/ticks),maxCOMRadiusMetres:maxCOMRadius,rmsStemOriginRadiusMetres:Math.sqrt(sumStemRadius2/ticks),maxStemOriginRadiusMetres:maxStemRadius},simulatedSeconds:ticks*STEP,terminal:top.eliminated,trace};
}
function incomingImpact(profile:Profile,reference:Profile){
  const [a,b]=createBattle([profile,reference],[launch,launch]).tops;
  for(const [i,t] of [a,b].entries()){
    setOrientation(t,{x:0,y:0,z:0,w:1});const c=t.profile.centerOfMass!;
    t.x=(i===0?-.04:.04)+c.x;t.y=.01+c.y;t.z=c.z;t.vx=i===0?0:-1;t.vy=t.vz=0;
  }
  const energyBefore=totalEnergy(a)+totalEnergy(b),initialSubject=snapshot(a),initialIncoming=snapshot(b);let impulse=0,ticks=0;
  while(ticks<1200&&!impulse){integrateFree(a,1/6000,false,false);integrateFree(b,1/6000,false,false);impulse=resolveContact(a,b);ticks++;}
  return {seconds:ticks/6000,contact:impulse>0,impulse,energyBefore,energyAfter:totalEnergy(a)+totalEnergy(b),initialSubject,initialIncoming,subject:snapshot(a),incoming:snapshot(b)};
}
function ordinary(profile:Profile,reference:Profile){
  const battle=createBattle([profile,reference],[launch,{power:.76,angle:-.12,tilt:.11}]),initial=snapshot(battle.tops[0]),trace=[{seconds:0,...initial}],events=new Map();
  while(battle.tick<3/STEP&&!battle.result){stepBattle(battle);for(const event of battle.events)events.set(`${event.tick}:${event.kind}:${event.top}`,event);if(battle.tick%60===0)trace.push({seconds:battle.tick*STEP,...snapshot(battle.tops[0])});}
  return {initial,final:snapshot(battle.tops[0]),simulatedSeconds:battle.tick*STEP,result:battle.result,events:[...events.values()],trace};
}
export function compareRatchetCOM(){
  const reference=profileFor(referenceBuild);
  return ['3-60','3-80','1-60','2-60','9-60'].map(name=>{
    const build={...referenceBuild,ratchet:part(name,'ratchet').id},profile=profileFor(build);
    return {ratchet:name,build,mass:profile.mass,centerOfMass:profile.centerOfMass,inertiaTensor:profile.inertiaTensor,principalInertias:principalInertias(profile.inertiaTensor!),massComponents:profile.massComponents,
      isolatedFloor:isolated(profile,reference),commonImpact:incomingImpact(profile,reference),ordinaryArena:ordinary(profile,reference)};
  });
}
if(process.argv[1]?.endsWith('compare-beyblade-com.ts')){
  const sourceSha256=Object.fromEntries(['src/beyblade/core/physics.ts','src/beyblade/core/body-geometry.ts','src/beyblade/core/inertia.ts','src/beyblade/data/physical-estimates.ts','src/beyblade/data/assembly-mass.ts','src/beyblade/data/catalog.ts','scripts/compare-beyblade-com.ts'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const report={status:'uncalibrated geometry-derived mass model; not real-toy measurement or ranking',sourceSha256,launch,deliveredLaunchWork:launchEnergyAt(launch.power),
    fixtures:{isolated:'3s maximum; shared floor solver, tip centered2mm above floor, initial tilt8degrees, initial translation zero; no opponent/rail/cover/result resetting; outer floor is unbounded, radial distances are displacement from fixture origin, not a closed orbit or real-stadium stability ranking',impact:'equal estimated rotational launch work; upright subject and common incoming reference, stems80mm apart at10mm above nominal floor; incoming speed1m/s; no gravity or drag until first real contact',arena:'3s maximum normal two-body arena; actual duration/result recorded'},comparisons:compareRatchetCOM()};
  mkdirSync('docs/beyblade',{recursive:true});writeFileSync('docs/beyblade/com-comparisons.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.comparisons.map(r=>({ratchet:r.ratchet,com:r.centerOfMass,ratchetCOM:r.massComponents?.[1].center,inertia:r.inertiaTensor,floor:r.isolatedFloor.final,impact:r.commonImpact.impulse,arena:r.ordinaryArena.final,duration:r.ordinaryArena.simulatedSeconds,result:r.ordinaryArena.result})),null,2));
}
