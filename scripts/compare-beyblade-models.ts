import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditModels} from '../src/beyblade/data/model-audit';
import {parts,defaultBuild,profileFor} from '../src/beyblade/data/catalog';
import {createBattle,comHeight,stepIsolatedTop,STEP,kineticEnergy,resolveContact,setAngularVelocity,setOrientation,stepBattle,totalEnergy,integrateFree} from '../src/beyblade/core/physics';
import type {Build,Profile} from '../src/beyblade/core/types';
const find=(name:string,category:string)=>parts.find(p=>p.canonicalId===name&&p.category===category)!;
const base={...defaultBuild,blade:find('ドランソード','blade').id,ratchet:find('3-60','ratchet').id,bit:find('F','bit').id};
const launch={power:.8,angle:0,tilt:8*Math.PI/180};
const fixture=(p:Profile)=>createBattle([p,profileFor(base)],[launch,launch]).tops[0];
function spinDown(p:Profile){
  const top=fixture(p);setOrientation(top,{x:0,y:0,z:0,w:1});top.x=top.z=0;top.y=comHeight(p);top.vx=top.vy=top.vz=0;
  const initial=kineticEnergy(top),initialOmega=top.omega;
  for(let i=0;i<3/STEP;i++)stepIsolatedTop(top);
  return {initialOmega,finalOmega:top.omega,retainedEnergy:kineticEnergy(top)/initial,tilt:top.tilt};
}
function impact(p:Profile){
  const a=fixture(p),b=fixture(profileFor(base));
  // Common incoming body at 1 m/s, both upright at fixed height; start separated and integrate to first contact.
  for(const t of [a,b]){setOrientation(t,{x:0,y:0,z:0,w:1});t.y=.04;t.z=0;t.vx=t.vy=t.vz=0;setAngularVelocity(t,{x:0,y:300,z:0});}
  a.x=-.04;b.x=.04;b.vx=-1;
  const before=totalEnergy(a)+totalEnergy(b);let impulse=0,contactTime=0;
  for(let i=0;i<1200&&!impulse;i++){integrateFree(a,1/6000,false,false);integrateFree(b,1/6000,false,false);impulse=resolveContact(a,b);contactTime=(i+1)/6000;}
  return {contactTime,energyChange:totalEnergy(a)+totalEnergy(b)-before,impulse,recoil:{x:a.vx,y:a.vy,z:a.vz},angularMomentum:{...a.angularMomentum}};
}
function orbit(p:Profile){
  const state=createBattle([p,profileFor(base)],[launch,{power:.76,angle:-.12,tilt:.11}]);const events=new Map<string,{kind:string;tick:number;top?:number}>();
  for(let i=0;i<3/STEP&&!state.result;i++){stepBattle(state);for(const e of state.events)events.set(`${e.tick}:${e.kind}:${e.top}`,e);}
  const t=state.tops[0];return {simulatedSeconds:state.tick*STEP,result:state.result,x:t.x,y:t.y,z:t.z,omega:t.omega,firstRail:[...events.values()].find(e=>e.kind==='rail-engage'&&e.top===0)?.tick??null,firstDash:[...events.values()].find(e=>e.kind==='dash'&&e.top===0)?.tick??null};
}
export function modelComparisonCases(){
  const builds:{label:string;build:Build}[]=[{label:'Sword / 3-60 / F',build:base},
    ...['ウィザードロッド','ナイトシールド','ドランバスター'].map(name=>({label:`blade-only: ${name}`,build:{...base,blade:find(name,'blade').id}})),
    ...['3-80','9-60','4-60'].map(name=>({label:`ratchet-only: ${name}`,build:{...base,ratchet:find(name,'ratchet').id}})),
    ...['B','N','R','LF','A'].map(name=>({label:`bit-only: ${name}`,build:{...base,bit:find(name,'bit').id}}))];
  return builds;
}
export function compareModelCase({label,build}:{label:string;build:Build}){const profile=profileFor(build);return {label,build,profile,isolatedSpin:spinDown(profile),incomingImpact:impact(profile),ordinaryLaunch:orbit(profile)};}
export function controlledModelComparisons(){return modelComparisonCases().map(compareModelCase);}

if(process.argv[1]?.endsWith('compare-beyblade-models.ts')){
  const sourceSha256=Object.fromEntries(['src/beyblade/core/physics.ts','src/beyblade/core/body-geometry.ts','src/beyblade/core/inertia.ts','src/beyblade/data/assembly-mass.ts','src/beyblade/data/physical-estimates.ts','src/beyblade/data/independent-masses.ts','src/beyblade/data/shape-facts.ts','src/beyblade/data/expanded-shape-facts.ts','src/beyblade/data/catalog.ts','scripts/compare-beyblade-models.ts'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
  const comparisons=controlledModelComparisons(),audit=auditModels();
  const summary={catalogRows:audit.catalogRows,modeledRows:audit.modeledRows,uniqueMechanicalProfiles:audit.uniqueMechanicalProfiles,equivalentGroups:audit.equivalentGroups,
    sourceInformedBladeRows:audit.rows.filter(r=>r.status==='modeled'&&r.category==='blade'&&r.variants[0].metadata.components[0].shapeStatus==='source-informed').length,
    unmodeledBladeRows:audit.rows.filter(r=>r.status==='modeled'&&r.category==='blade'&&r.variants[0].metadata.components[0].shapeStatus==='unmodeled').length};
  mkdirSync('docs/beyblade',{recursive:true});
  const signatures=new Map<string,number>();let nextGroup=1;
  const compactRows=audit.rows.map(row=>{const part=parts.find(p=>p.id===row.id)!;return{id:row.id,name:row.name,canonicalId:part.canonicalId,category:row.category,source:part.source,status:row.status,
    ...(row.status==='modeled'?{variants:row.variants.map(v=>{if(!signatures.has(v.signature))signatures.set(v.signature,nextGroup++);return{mode:v.build.bladeMode??v.build.bitMode??null,mechanicalGroup:signatures.get(v.signature),shapeStatus:v.metadata.components.find(c=>c.category===row.category)?.shapeStatus??'assembly-only',missing:v.metadata.missingInputs,unsupported:v.metadata.unsupportedMechanisms};})}:{reasons:row.reasons})};});
  writeFileSync('docs/beyblade/model-audit.json',JSON.stringify({sourceSha256,summary,rows:compactRows},null,2)+'\n');

  writeFileSync('docs/beyblade/model-comparisons.json',JSON.stringify({sourceSha256,status:'estimated model comparison; not real-toy validation',fixture:'Equal estimated launch work at 80%; spin-down centered upright with zero translation, 3s floor-only. Impact upright fixed 300rad/s vs common incoming body at1m/s from80mm separation; not a ranking. Orbit up to3s normal full two-body arena; actual duration and terminal result recorded.',summary,comparisons},null,2)+'\n');
  console.log(JSON.stringify({summary,comparisons:comparisons.map(r=>({label:r.label,spin:r.isolatedSpin,impact:r.incomingImpact,orbit:r.ordinaryLaunch}))},null,2));
}
