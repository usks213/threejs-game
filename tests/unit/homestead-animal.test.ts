import {describe,expect,it,vi} from 'vitest';
import {HomesteadSystem,ANIMAL_SECONDS,type HomesteadContext} from '../../src/prototype/core/homestead';
import {HomesteadAnimal,HOMESTEAD_ANIMAL_HOME,HOMESTEAD_ANIMAL_ID,HOMESTEAD_ANIMAL_RULES,createHomesteadAnimalState,validHomesteadAnimalState} from '../../src/prototype/core/homestead-animal';
import {VoxelField,key,type Vec3} from '../../src/prototype/core/voxel';
import {ElementSystem} from '../../src/prototype/core/elements';
import {VoxelWater} from '../../src/prototype/core/water';
import {createArena} from '../../src/prototype/core/world';
import {extendCampaignArena} from '../../src/prototype/core/campaign-world';

const home=HOMESTEAD_ANIMAL_HOME,r=HOMESTEAD_ANIMAL_RULES;
function ground(){const field=new VoxelField();field.box({x:home.x-3,y:-.5,z:home.z-3},{x:home.x+3,y:.25,z:home.z+3},2);return field;}
function setup(field=ground()) {const h=new HomesteadSystem({2:30,3:30,4:30,7:100,10:30},{herbs:6}),animal=new HomesteadAnimal(h);return {h,animal,field};}
const context=(animal:HomesteadAnimal,overrides:Partial<HomesteadContext>={}):HomesteadContext=>({position:{...animal.position,x:animal.position.x+.9},basePosition:{x:-3,y:.25,z:4},baseActive:true,artisanRescued:true,animalPosition:{...animal.position},animalVisible:true,...overrides});
const advance=(animal:HomesteadAnimal,field:VoxelField,seconds:number)=>{for(let i=0;i<Math.ceil(seconds*60);i++)animal.tick(1/60,{field});};
function nearestTriangle(positions:readonly number[],origin:Vec3,direction:Vec3){
 const subtract=(a:Vec3,b:Vec3)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a:Vec3,b:Vec3)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;let nearest=Infinity;
 for(let i=0;i<positions.length;i+=9){const a={x:positions[i],y:positions[i+1],z:positions[i+2]},b={x:positions[i+3],y:positions[i+4],z:positions[i+5]},c={x:positions[i+6],y:positions[i+7],z:positions[i+8]},ab=subtract(b,a),ac=subtract(c,a),p=cross(direction,ac),det=dot(ab,p);if(Math.abs(det)<1e-10)continue;const t=subtract(origin,a),u=dot(t,p)/det;if(u<0||u>1)continue;const q=cross(t,ab),v=dot(direction,q)/det;if(v<0||u+v>1)continue;const d=dot(ac,q)/det;if(d>=0)nearest=Math.min(nearest,d);}return nearest;
}

describe('protected physical homestead animal',()=>{
 it('extracts one immutable sampled body used by transformed world ray hits',()=>{
  const {animal,field}=setup(),body=animal.bodySurface;expect(Object.isFrozen(body)).toBe(true);expect(Object.isFrozen(body.positions)).toBe(true);expect(body.positions.length).toBeGreaterThan(300);expect(body.positions.length).toBe(body.normals.length);
  const origin={x:0,y:.61,z:2},direction={x:0,y:0,z:-1},meshDistance=nearestTriangle(body.positions,origin,direction),hit=animal.ray({x:animal.position.x,y:animal.position.y+origin.y,z:animal.position.z+2},direction,3);
  expect(hit).not.toBeNull();expect(hit!.cell.object).toBe(HOMESTEAD_ANIMAL_ID);expect(hit!.distance).toBeCloseTo(meshDistance,2);
  animal.state.yaw=Math.PI/2;const rotated=animal.ray({x:animal.position.x+2,y:animal.position.y+origin.y,z:animal.position.z},{x:-1,y:0,z:0},3);expect(rotated!.distance).toBeCloseTo(meshDistance,2);
  const revision=field.revision;field.dirty.clear();animal.cast('earth',{x:1,y:0,z:0});animal.cast('fire',{x:0,y:1,z:0});advance(animal,field,.5);expect(animal.bodySurface).toBe(body);expect(field.revision).toBe(revision);expect(field.dirty.size).toBe(0);expect(new HomesteadAnimal(new HomesteadSystem({})).bodySurface).toBe(body);
 });
 it('rejects distant or off-axis body rays before any sampled field traversal',()=>{
  const {animal,field}=setup(),spy=vi.spyOn(VoxelField.prototype,'ray');
  try {for(let i=0;i<50;i++){expect(animal.ray({x:home.x+80,y:home.y+.65,z:home.z},{x:-1,y:0,z:0},7,field)).toBeNull();expect(animal.ray({x:home.x,y:home.y+.65,z:home.z+4},{x:1,y:0,z:0},7,field)).toBeNull();}expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
 });
 it('falls under gravity, settles on actual terrain and bounds dt/invalid input',()=>{
  const {animal,field}=setup();animal.state.position.y=3;const before=JSON.stringify(animal.state);for(const dt of [0,-1,NaN,Infinity])animal.tick(dt,{field});expect(JSON.stringify(animal.state)).toBe(before);
  animal.tick(1e9,{field});expect(animal.position.y).toBeGreaterThan(1);expect(animal.state.velocity.y).toBeLessThan(0);advance(animal,field,1);expect(animal.state.grounded).toBe(true);expect(animal.position.y).toBeCloseTo(.25,2);expect(animal.overlapsTerrain(field)).toBe(false);expect(validHomesteadAnimalState(animal.state)).toBe(true);
 });
 it('sweeps finite wind momentum into a thin wall instead of tunnelling or teleporting',()=>{
  const {animal,field}=setup();advance(animal,field,.5);const wallX=home.x+.55;field.box({x:wallX,y:.25,z:home.z-2},{x:wallX+.3,y:3,z:home.z+2},3,'test-wall');
  animal.cast('wind',{x:1,y:.3,z:0});let furthest=animal.position.x,highest=animal.position.y;
  for(let i=0;i<120;i++){if(i<45)animal.impulse({x:1,y:0,z:0},.3);animal.tick(1/60,{field});furthest=Math.max(furthest,animal.position.x);highest=Math.max(highest,animal.position.y);expect(animal.overlapsTerrain(field)).toBe(false);expect(validHomesteadAnimalState(animal.state)).toBe(true);}
  expect(furthest).toBeGreaterThan(home.x+.02);expect(furthest).toBeLessThanOrEqual(wallX-.295);expect(highest).toBeGreaterThan(.26);expect(Math.abs(animal.state.velocity.x)).toBeLessThan(1);
 });
 it('yields to other actors and exposes the same conservative solid envelope',()=>{
  const {animal,field}=setup();advance(animal,field,.5);const blocker={x:home.x+1.05,y:.25,z:home.z};expect(animal.overlaps(blocker)).toBe(false);expect(animal.overlaps({...blocker,x:home.x+.2})).toBe(true);expect(animal.overlaps({...blocker,x:home.x,y:3})).toBe(false);
  animal.nudge({x:1,y:0,z:0},2);for(let i=0;i<60;i++)animal.tick(1/60,{field,blockers:[blocker]});expect(animal.position.x).toBeLessThanOrEqual(blocker.x-.925);expect(animal.overlaps(blocker)).toBe(false);
 });
 it('returns within its yard while roaming and never interferes with first-chapter harvest lane',()=>{
  const {animal,field}=setup();let moved=0;for(let i=0;i<60*40;i++){animal.tick(1/60,{field,wind:{x:2.5,y:0,z:0}});moved=Math.max(moved,Math.hypot(animal.position.x-home.x,animal.position.z-home.z));expect(moved).toBeLessThanOrEqual(r.roamRadius+1e-8);expect(animal.overlaps({x:-3.45,y:.25,z:5.25})).toBe(false);expect(animal.overlaps({x:-.55,y:.25,z:6.15})).toBe(false);}expect(moved).toBeGreaterThan(.3);expect(validHomesteadAnimalState(animal.state)).toBe(true);
 });
 it('settles in the authored camp without overlapping terrain or the NormalPlayer route',()=>{
  const arena=extendCampaignArena(createArena()),{animal}=setup(arena.field);advance(animal,arena.field,.8);expect(animal.state.grounded).toBe(true);expect(animal.overlapsTerrain(arena.field)).toBe(false);expect(animal.position.y).toBeGreaterThan(.23);
  for(const [x,z] of [[-.55,6.15],[-.55,5.25],[-3.45,5.25],[-3.45,6.35],[-3.45,6.65],[-3.5,5.3],[0,3.2]])expect(animal.overlaps({x,y:.25,z})).toBe(false);
 });
 it('shares body occlusion for targeting, visibility, and canonical feed/milk transactions',()=>{
  const {h,animal,field}=setup();advance(animal,field,.5);const eye={x:home.x+2,y:animal.position.y+.65,z:home.z},dir={x:-1,y:0,z:0};expect(animal.ray(eye,dir,3,field)).not.toBeNull();expect(animal.visibleFrom(eye,field)).toBe(true);
  const blocked={...context(animal),animalVisible:false};expect(h.tame(blocked).ok).toBe(false);expect(h.materials[7]).toBe(100);
  field.box({x:home.x+.8,y:.25,z:home.z-.6},{x:home.x+1.15,y:2,z:home.z+.6},3);expect(animal.ray(eye,dir,3,field)).toBeNull();expect(animal.visibleFrom(eye,field)).toBe(false);
  const missing=context(animal);delete missing.animalPosition;delete missing.animalVisible;expect(h.animalInteractionStatus(missing).ok).toBe(false);expect(h.tame(missing).ok).toBe(false);expect(h.materials[7]).toBe(100);
  expect(h.animalInteractionStatus(context(animal,{position:{x:home.x+2.751,y:animal.position.y,z:home.z}})).message).toContain('2.75');
  expect(h.animalInteractionStatus(context(animal,{animalPosition:{...animal.position,x:animal.position.x+.1}})).ok).toBe(false);
 });
 it('requires exact existing costs/time and never awards materials from damage or spells',()=>{
  const {h,animal,field}=setup();advance(animal,field,.5);const ctx=()=>context(animal);expect(animal.interact(ctx()).ok).toBe(true);expect(h.materials[7]).toBe(92);expect(animal.interact(ctx()).ok).toBe(true);expect(h.materials[7]).toBe(90);expect(animal.interact(ctx()).ok).toBe(false);
  const materials={...h.materials};for(const element of ['fire','water','wind','earth','lightning'] as const){animal.cast(element,{x:1,y:0,z:0});animal.nudge({x:0,y:0,z:1},.5);}expect(h.materials).toEqual(materials);expect(h.items.milk??0).toBe(0);expect(h.state.animal.remaining).toBe(ANIMAL_SECONDS);
  expect(animal.interact(ctx()).ok).toBe(false);advance(animal,field,6);for(let i=0;i<ANIMAL_SECONDS-1;i++)h.tick(1);expect(h.claimAnimal(ctx()).ok).toBe(false);h.tick(1);expect(animal.interact(ctx()).ok).toBe(true);expect(h.items.milk).toBe(1);expect(h.claimAnimal(ctx()).ok).toBe(false);expect(h.materials).toEqual(materials);
 });
 it('water extinguishes protected fire fright; shock cooldown and all exposure decay finitely',()=>{
  const {animal,field}=setup();animal.cast('fire',{x:0,y:0,z:-1});expect(animal.state.burning).toBe(r.burning);expect(animal.state.fright).toBe(r.fright);animal.cast('water',{x:0,y:0,z:0});expect(animal.state.burning).toBe(0);expect(animal.state.wet).toBe(r.wet);animal.cast('fire',{x:1,y:0,z:0});expect(animal.state.burning).toBe(0);
  animal.cast('lightning',{x:1,y:0,z:0});expect(animal.state.shock).toBe(r.shock);animal.tick(.2,{field});const shock=animal.state.shock;animal.cast('lightning',{x:1,y:0,z:0});expect(animal.state.shock).toBe(shock);advance(animal,field,6);for(const id of ['wet','burning','fright','shock','shockCooldown'] as const)expect(animal.state[id]).toBe(0);
 });
 it('samples real nearby burning terrain with bounded first-surface rays, and respects shelter',()=>{
  const {animal,field}=setup();advance(animal,field,.5);field.box({x:home.x+.45,y:.25,z:home.z-.3},{x:home.x+.7,y:1.2,z:home.z+.3},4,'fire-source');const water=new VoxelWater(field),elements=new ElementSystem(field,water),eye={x:home.x,y:animal.position.y+.55,z:home.z},hit=field.ray(eye,{x:1,y:0,z:0},1)!;expect(hit).not.toBeNull();elements.cast('fire',hit,{x:1,y:0,z:0});const out=animal.tick(.1,{field,elements});expect(out.contactRays).toBeLessThanOrEqual(r.maxContactRays);expect(animal.state.burning).toBeGreaterThan(0);
  animal.cast('water',{x:0,y:0,z:0});expect(animal.state.burning).toBe(0);animal.state.wet=0;field.box({x:home.x-1,y:2,z:home.z-1},{x:home.x+1,y:2.2,z:home.z+1},3,'roof');animal.tick(.1,{field,rain:true});expect(animal.state.wet).toBe(0);field.removeObject('roof');animal.tick(.1,{field,rain:true});expect(animal.state.wet).toBeGreaterThan(0);
 });
 it('does not transmit fire through a separating cold first surface',()=>{
  const {animal,field}=setup();advance(animal,field,.5);field.box({x:home.x+.55,y:.25,z:home.z-.4},{x:home.x+.85,y:1.4,z:home.z+.4},4,'hot');const water=new VoxelWater(field),elements=new ElementSystem(field,water),hit=field.ray({x:home.x,y:animal.position.y+.6,z:home.z},{x:1,y:0,z:0},1)!;elements.cast('fire',hit,{x:1,y:0,z:0});field.box({x:home.x+.30,y:.25,z:home.z-.55},{x:home.x+.55,y:1.5,z:home.z+.55},3,'cold-wall');animal.tick(.2,{field,elements});expect(animal.state.burning).toBe(0);expect(animal.state.fright).toBe(0);
 });
 it('treats continuous charged contact as one finite shock, not an indefinite stun',()=>{
  const {animal,field}=setup();advance(animal,field,.5);field.box({x:home.x+.30,y:.25,z:home.z-.4},{x:home.x+.60,y:1.3,z:home.z+.4},6,'charged');const water=new VoxelWater(field),elements=new ElementSystem(field,water);const hit=field.ray({x:home.x,y:animal.position.y+.55,z:home.z},{x:1,y:0,z:0},1)!;elements.states.set(key(hit.cell.x,hit.cell.y,hit.cell.z),{position:{x:(hit.cell.x+.5)*field.size,y:(hit.cell.y+.5)*field.size,z:(hit.cell.z+.5)*field.size},fire:0,wet:0,charge:1});
  animal.tick(.1,{field,elements});expect(animal.state.shock,JSON.stringify({hit,state:animal.state,sources:[...elements.states.values()]})).toBeGreaterThan(0);for(let i=0;i<30;i++)animal.tick(.1,{field,elements});expect(animal.state.shock).toBe(0);expect(animal.state.chargeContact).toBe(true);
 });
 it('recovers only from a void fall onto verified clear support with no rewards',()=>{
  const empty=new VoxelField(),{animal,h}=setup(empty);const ledger={...h.materials};advance(animal,empty,3);expect(animal.state.recovering).toBe(true);expect(animal.state.recoveryReason).toBe('void');expect(animal.visible).toBe(false);expect(animal.position.y).toBe(-8);expect(h.tame(context(animal)).ok).toBe(false);
  const field=ground();let recovered=false;for(let i=0;i<120;i++)recovered=animal.tick(1/60,{field}).recovered||recovered;expect(recovered).toBe(true);expect(animal.visible).toBe(true);expect(animal.overlapsTerrain(field)).toBe(false);expect(h.materials).toEqual(ledger);expect(h.items.milk??0).toBe(0);
 });
});

describe('animal save boundary and canonical home ledger',()=>{
 it('restores movement/exposure detached and preserves legacy jobs/storage/feed time',()=>{
  const {h,animal,field}=setup();h.startProcessing('weave',context(animal));h.deposit(4,3,context(animal));animal.interact(context(animal));animal.interact(context(animal));h.tick(1);animal.cast('water',{x:0,y:0,z:0});animal.cast('wind',{x:0,y:.1,z:1});animal.tick(.213,{field});const snapshot=h.snapshot(),restored=new HomesteadSystem({...h.materials},{...h.items});expect(validHomesteadAnimalState(snapshot.animal.physical)).toBe(true);expect(restored.restore(snapshot)).toBe(true);expect(restored.snapshot()).toEqual(snapshot);snapshot.animal.physical!.position.x+=.1;expect(restored.state.animal.physical!.position.x).not.toBe(snapshot.animal.physical!.position.x);
  const legacy=h.snapshot();delete legacy.animal.physical;const before=JSON.stringify(legacy);expect(restored.restore(legacy)).toBe(true);expect(JSON.stringify(legacy)).toBe(before);expect(restored.state.storage).toEqual(legacy.storage);expect(restored.state.jobs).toEqual(legacy.jobs);expect(restored.state.animal.remaining).toBe(44);expect(restored.state.animal.tamed).toBe(true);expect(restored.state.animal.physical).toEqual(createHomesteadAnimalState());
 });
 it('rejects malformed optional physics atomically without erasing any ledger/job',()=>{
  const {h,animal}=setup();h.deposit(4,3,context(animal));h.startProcessing('weave',context(animal));const before=h.snapshot(),materials={...h.materials},physical=createHomesteadAnimalState();
  const invalid:unknown[]=[null,{}, {...physical,extra:true},{...physical,wet:Infinity},{...physical,wet:6},{...physical,burning:-1},{...physical,wet:1,burning:1},{...physical,shock:1},{...physical,fright:5},{...physical,phase:36},{...physical,accumulator:r.step},{...physical,contactAccumulator:r.contactStep},{...physical,rescueWait:2},{...physical,yaw:10},{...physical,position:{x:0,y:.25,z:0}},{...physical,position:{...home,y:-9}},{...physical,position:{...home,extra:1}},{...physical,velocity:{x:4,y:0,z:4}},{...physical,velocity:{x:0,y:5,z:0}},{...physical,grounded:1},{...physical,recoveryReason:'overlap'},{...physical,recovering:true,recoveryReason:'unknown'},{...physical,recovering:true,recoveryReason:'void'},{...physical,recovering:true,recoveryReason:'overlap',grounded:true},{...physical,recovering:true,recoveryReason:'overlap',velocity:{x:1,y:0,z:0}}];
  for(const value of invalid){expect(validHomesteadAnimalState(value),JSON.stringify(value)).toBe(false);expect(h.restore({...before,animal:{...before.animal,physical:value}})).toBe(false);expect(h.snapshot()).toEqual(before);expect(h.materials).toEqual(materials);}
 });
});


describe('loaded animal placement reconciliation without world edits',()=>{
 function legacyWithContents(){const {h,animal}=setup();h.startProcessing('weave',context(animal));h.deposit(4,3,context(animal));h.tame(context(animal));h.feed(context(animal));h.tick(1);const legacy=h.snapshot();delete legacy.animal.physical;return {legacy,h};}
 it('relocates a legacy default embedded in an old yard build without altering builds or jobs',()=>{
  const {legacy,h}=legacyWithContents(),field=ground();field.box({x:home.x-.30,y:.25,z:home.z-.45},{x:home.x+.30,y:2.3,z:home.z+.45},4,'build:legacy-pillar');expect(h.restore(legacy)).toBe(true);const animal=new HomesteadAnimal(h),terrain=JSON.stringify(field.exportState()),ledger=h.snapshot(),revision=field.revision;field.dirty.clear();expect(animal.overlapsTerrain(field)).toBe(true);
  expect(animal.reconcileTerrain({field})).toBe(true);expect(animal.visible).toBe(true);expect(animal.overlapsTerrain(field)).toBe(false);expect(Math.hypot(animal.position.x-home.x,animal.position.z-home.z)).toBeLessThanOrEqual(r.roamRadius);expect(animal.position.y).toBeLessThan(1.5);expect(JSON.stringify(field.exportState())).toBe(terrain);expect(field.revision).toBe(revision);expect(field.dirty.size).toBe(0);expect(h.state.storage).toEqual(ledger.storage);expect(h.state.jobs).toEqual(ledger.jobs);expect(h.state.animal.remaining).toBe(44);expect(h.state.animal.tamed).toBe(true);expect(h.items.milk??0).toBe(0);expect(validHomesteadAnimalState(animal.state)).toBe(true);
 });
 it('waits hidden with a saved overlap reason when the bounded yard has no safe space',()=>{
  const {legacy,h}=legacyWithContents(),field=ground();field.box({x:home.x-2,y:.25,z:home.z-2},{x:home.x+2,y:2.5,z:home.z+2},4,'build:legacy-filled-yard');expect(h.restore(legacy)).toBe(true);const animal=new HomesteadAnimal(h),terrain=JSON.stringify(field.exportState());expect(animal.reconcileTerrain({field})).toBe(false);expect(animal.state.recoveryReason).toBe('overlap');expect(animal.state.recovering).toBe(true);expect(animal.visible).toBe(false);expect(animal.overlaps(animal.position)).toBe(false);expect(animal.ray({x:home.x,y:2,z:home.z+2},{x:0,y:0,z:-1},4)).toBeNull();expect(h.feed(context(animal)).ok).toBe(false);expect(h.animalInteractionStatus(context(animal)).message).toContain('庭に空き');advance(animal,field,2.5);expect(animal.state.recoveryReason).toBe('overlap');expect(JSON.stringify(field.exportState())).toBe(terrain);expect(h.state.animal.remaining).toBe(44);
  const saved=h.snapshot(),restored=new HomesteadSystem({...h.materials},{...h.items});expect(restored.restore(saved)).toBe(true);expect(restored.snapshot()).toEqual(saved);expect(validHomesteadAnimalState(restored.state.animal.physical)).toBe(true);
 });
 it('bounds the pending search to 24 yard rays per second and accepts legacy void saves',()=>{
  const {h,animal,field}=setup();field.box({x:home.x-2,y:.25,z:home.z-2},{x:home.x+2,y:2.5,z:home.z+2},4,'filled-yard');const spy=vi.spyOn(field,'ray');
  try {animal.reconcileTerrain({field});expect(spy.mock.calls.length).toBe(24);advance(animal,field,.9);expect(spy.mock.calls.length).toBe(24);advance(animal,field,.2);expect(spy.mock.calls.length).toBe(48);}finally{spy.mockRestore();}
  const old=h.snapshot();old.animal.physical={...createHomesteadAnimalState(),position:{...home,y:-8},recovering:true};expect(validHomesteadAnimalState(old.animal.physical)).toBe(true);expect(h.restore(old)).toBe(true);expect(h.state.animal.physical!.recoveryReason).toBeUndefined();expect(h.state.animal.physical!.recovering).toBe(true);
 });
 it('eventually recovers after space is cleared, preserving the pending ledger and never changing terrain itself',()=>{
  const {h,animal,field}=setup();h.tame(context(animal));h.feed(context(animal));field.box({x:home.x-2,y:.25,z:home.z-2},{x:home.x+2,y:2.5,z:home.z+2},4,'build:filled-yard');animal.reconcileTerrain({field});expect(animal.visible).toBe(false);advance(animal,field,.5);field.removeObject('build:filled-yard');const terrain=JSON.stringify(field.exportState()),materials={...h.materials};let recovered=false;for(let i=0;i<90;i++)recovered=animal.tick(1/60,{field}).recovered||recovered;expect(recovered).toBe(true);expect(animal.visible).toBe(true);expect(animal.state.recoveryReason).toBeUndefined();expect(animal.overlapsTerrain(field)).toBe(false);expect(h.state.animal.remaining).toBe(ANIMAL_SECONDS);expect(h.materials).toEqual(materials);expect(h.items.milk??0).toBe(0);expect(JSON.stringify(field.exportState())).toBe(terrain);
 });
 it('does not relocate a clear animal enclosed by walls, including after a physical-save restore',()=>{
  const {h,animal,field}=setup();advance(animal,field,.5);
  field.box({x:home.x-.95,y:.25,z:home.z-1.05},{x:home.x-.65,y:2.5,z:home.z+1.05},3,'pen-left');field.box({x:home.x+.65,y:.25,z:home.z-1.05},{x:home.x+.95,y:2.5,z:home.z+1.05},3,'pen-right');field.box({x:home.x-.95,y:.25,z:home.z-1.05},{x:home.x+.95,y:2.5,z:home.z-.75},3,'pen-front');field.box({x:home.x-.95,y:.25,z:home.z+.75},{x:home.x+.95,y:2.5,z:home.z+1.05},3,'pen-back');expect(animal.overlapsTerrain(field)).toBe(false);
  const saved=h.snapshot();expect(h.restore(saved)).toBe(true);const before={...animal.position};expect(animal.reconcileTerrain({field})).toBe(false);expect(animal.position).toEqual(before);const terrain=JSON.stringify(field.exportState());for(let i=0;i<600;i++){const result=animal.tick(1/60,{field});expect(result.recovered).toBe(false);expect(animal.state.recovering).toBe(false);expect(animal.state.recoveryReason).toBeUndefined();expect(Math.abs(animal.position.x-home.x)).toBeLessThan(.65);expect(Math.abs(animal.position.z-home.z)).toBeLessThan(.75);}expect(JSON.stringify(field.exportState())).toBe(terrain);
 });
 it('rechecks each restored body identity but does not use normal actor blockers as relocation authority',()=>{
  const {h,animal,field}=setup();animal.reconcileTerrain({field});const before={...animal.position};expect(animal.reconcileTerrain({field,blockers:[{...before}]})).toBe(false);expect(animal.position).toEqual(before);expect(animal.state.recovering).toBe(false);
  field.box({x:home.x-.3,y:.25,z:home.z-.4},{x:home.x+.3,y:2.3,z:home.z+.4},4,'loaded-build');const saved=h.snapshot();expect(h.restore(saved)).toBe(true);animal.tick(1/60,{field});expect(animal.overlapsTerrain(field)).toBe(false);expect(animal.visible).toBe(true);
 });
});
