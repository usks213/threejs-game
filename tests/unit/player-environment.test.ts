import {describe,it,expect,vi} from 'vitest';
import {ElementSystem} from '../../src/prototype/core/elements';
import {VoxelField,key,type Vec3} from '../../src/prototype/core/voxel';
import {VoxelWater} from '../../src/prototype/core/water';
import {clonePlayerEnvironmentState,createPlayerEnvironmentState,PLAYER_ENVIRONMENT_RULES,stepPlayerEnvironment,validPlayerEnvironmentState,type PlayerEnvironmentContext,type PlayerArmorMaterial} from '../../src/prototype/core/player-environment';

function make(position:Vec3={x:0,y:0,z:0}){
 const field=new VoxelField(),water=new VoxelWater(field);water.volume.fill(0);
 const context:PlayerEnvironmentContext={position,field,water,elements:new ElementSystem(field,water)};
 return {state:createPlayerEnvironmentState(),context};
}
function wall(context:PlayerEnvironmentContext,material:number,x=.5,object='hazard'){
 context.field.box({x,y:0,z:-.5},{x:x+.25,y:1.75,z:.5},material,object);
 const hit=context.field.ray({x:0,y:.875,z:.125},{x:1,y:0,z:0},2)!;
 return hit;
}
function activate(context:PlayerEnvironmentContext,kind:'fire'|'wet'|'charge',value=1){
 for(const cell of context.field.cells.values())if(cell.distance<0&&cell.object==='hazard'){
  context.elements.states.set(key(cell.x,cell.y,cell.z),{position:{x:(cell.x+.5)*.25,y:(cell.y+.5)*.25,z:(cell.z+.5)*.25},fire:kind==='fire'?value:0,wet:kind==='wet'?value:0,charge:kind==='charge'?value:0});
 }
}
const advance=(state:ReturnType<typeof createPlayerEnvironmentState>,context:PlayerEnvironmentContext,seconds:number)=>{let damage=0;for(let t=0;t<seconds-1e-9;t+=.1)damage+=stepPlayerEnvironment(state,Math.min(.1,seconds-t),context).damage;return damage;};

describe('bounded player contact with shared terrain elements',()=>{
 it('leaves clean players and world resources untouched',()=>{
  const {state,context}=make(),before=context.field.exportState(),water=context.water.total();
  expect(stepPlayerEnvironment(state,.1,context)).toMatchObject({damage:0,contactRays:0,skyRays:0});
  expect(state).toEqual(createPlayerEnvironmentState());expect(context.elements.drainDrops()).toEqual([]);expect(context.field.exportState()).toEqual(before);expect(context.water.total()).toBe(water);
 });
 it('an actual terrain fire threatens an adjacent player but not one farther away',()=>{
  const {state,context}=make();const hit=wall(context,4);context.elements.cast('fire',hit,{x:1,y:0,z:0});
  const near=stepPlayerEnvironment(state,.1,context);expect(near.ignited).toBe(true);expect(near.damage).toBeCloseTo(.6);expect(state.burning).toBeCloseTo(1.9);
  const distant=createPlayerEnvironmentState();expect(stepPlayerEnvironment(distant,.1,{...context,position:{x:-1,y:0,z:0}}).damage).toBe(0);
 });
 it('a stone wall blocks nearby fire and charge, including a wall sharing the hazard object name',()=>{
  for(const material of [4,6]){
   const {state,context}=make({x:.2,y:0,z:0});wall(context,material,.75);activate(context,material===4?'fire':'charge');
   context.field.box({x:.5,y:0,z:-1},{x:.75,y:2,z:1},3,'hazard');
   expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);expect(state.burning).toBe(0);expect(state.shock).toBe(0);
  }
 });
 it('checks at most 12 contact rays and one roof ray in each fixed step',()=>{
  const {state,context}=make();context.rain=true;context.field.box({x:.5,y:0,z:-1},{x:.75,y:2,z:1},4,'hazard');activate(context,'fire');
  for(let i=context.elements.states.size;i<400;i++)context.elements.states.set('invalid:'+i,{position:{x:.6,y:.8,z:0},fire:1,wet:0,charge:0});
  const ray=vi.spyOn(context.field,'ray'),out=stepPlayerEnvironment(state,.5,context);
  expect(out.contactRays).toBeLessThanOrEqual(12*5);expect(out.skyRays).toBe(5);expect(ray.mock.calls.length).toBe(out.contactRays+out.skyRays);expect(out.damage).toBe(0);
 });
 it('ignores stale states with no occupied material and nonconductive fabricated charge',()=>{
  const {state,context}=make({x:.2,y:0,z:0});wall(context,4);activate(context,'charge');expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);
  activate(context,'fire');context.field.removeObject('hazard');expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);
 });
 it('respects protection on quest-object fire without modifying it',()=>{
  const {state,context}=make();wall(context,4);activate(context,'fire');context.elements.protectedObjects.add('hazard');
  const before=context.field.exportState();expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);expect(context.field.exportState()).toEqual(before);
 });
});

describe('water, exposed rain and armor materials',()=>{
 it('actual ankle water extinguishes immediately and keeps the actor wet after leaving',()=>{
  const {state,context}=make({x:5,y:-.3,z:-4});state.burning=4;
  const x=Math.floor((5-context.water.origin.x)/.125),y=Math.floor((-.22-context.water.origin.y)/.125),z=Math.floor((-4-context.water.origin.z)/.125);context.water.add(x,y,z,1);
  expect(stepPlayerEnvironment(state,.1,context)).toMatchObject({damage:0,extinguished:true});expect(state.wet).toBe(5);expect(state.burning).toBe(0);
  context.position.x=0;stepPlayerEnvironment(state,.1,context);expect(state.wet).toBeCloseTo(4.9);advance(state,context,5);expect(state.wet).toBe(0);
 });
 it('does not wet a player below overhead basin water or below a regional lake bottom',()=>{
  const {state,context}=make({x:5,y:-.3,z:-4});context.water.add(8,7,8,1);
  expect(context.water.surface(5,-4)).toBeGreaterThan(context.position.y);stepPlayerEnvironment(state,.1,context);expect(state.wet).toBe(0);
  context.regionalWater={min:{x:4,y:0,z:-5},max:{x:6,y:1,z:-3},surfaceY:1};stepPlayerEnvironment(state,.1,context);expect(state.wet).toBe(0);
  context.position.y=.1;stepPlayerEnvironment(state,.1,context);expect(state.wet).toBe(5);
 });
 it('rain extinguishes outside but an SDF roof protects dry indoor actors',()=>{
  const {state,context}=make();context.rain=true;state.burning=2;
  expect(stepPlayerEnvironment(state,.1,context)).toMatchObject({damage:0,extinguished:true,skyRays:1});expect(state.wet).toBe(2);
  context.field.box({x:-1,y:2,z:-1},{x:1,y:2.25,z:1},4,'roof');const inside=createPlayerEnvironmentState();inside.burning=2;
  expect(stepPlayerEnvironment(inside,.1,context).fireDamage).toBeCloseTo(.6);expect(inside.wet).toBe(0);
 });
 it('requires physical contact for a wet surface while nearby fire can radiate heat',()=>{
  const {state,context}=make();wall(context,4);activate(context,'wet',5);state.burning=2;
  stepPlayerEnvironment(state,.1,context);expect(state.wet).toBe(0);expect(state.burning).toBeGreaterThan(0);
  context.position.x=.2;expect(stepPlayerEnvironment(state,.1,context).extinguished).toBe(true);expect(state.wet).toBe(5);
 });
 it('wetness prevents re-ignition and cloth carries a longer finite burn than metal',()=>{
  const cases:Record<PlayerArmorMaterial,number>={0:1.9,6:1.4,10:3.9};
  for(const material of [0,6,10] as const){const {state,context}=make();context.armorMaterial=material;wall(context,4);activate(context,'fire');stepPlayerEnvironment(state,.1,context);expect(state.burning).toBeCloseTo(cases[material]);context.elements.states.clear();expect(advance(state,context,5)).toBeGreaterThan(0);expect(state.burning).toBe(0);}
  const {state,context}=make();wall(context,4);activate(context,'fire');state.wet=1;expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);expect(state.burning).toBe(0);
 });
});

describe('finite conductive contact pulses',()=>{
 it.each([{wet:false,armor:0,damage:12},{wet:false,armor:10,damage:12},{wet:false,armor:6,damage:18},{wet:true,armor:0,damage:24},{wet:true,armor:6,damage:30}])('scales contact shock by wetness and actual armor material: %j',test=>{
  const {state,context}=make({x:.2,y:0,z:0});context.armorMaterial=test.armor as PlayerArmorMaterial;wall(context,6);activate(context,'charge');if(test.wet)state.wet=5;
  const out=stepPlayerEnvironment(state,.1,context);expect(out.shockDamage).toBe(test.damage);expect(out.shocked).toBe(true);expect(state.shock).toBe(.55);
 });
 it('requires touch rather than a radius-based lightning strike',()=>{
  const {state,context}=make();wall(context,6);activate(context,'charge');state.wet=5;context.armorMaterial=6;
  expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);expect(state.chargeContact).toBe(false);
 });
 it('cannot repeat a shock while one contact remains charged, even beyond the cooldown',()=>{
  const {state,context}=make({x:.2,y:0,z:0});wall(context,6);activate(context,'charge');
  expect(advance(state,context,8)).toBe(12);expect(state.chargeContact).toBe(true);expect(state.shockCooldown).toBe(0);
  activate(context,'charge',0);stepPlayerEnvironment(state,.1,context);expect(state.chargeContact).toBe(false);
  activate(context,'charge');expect(stepPlayerEnvironment(state,.1,context).damage).toBe(12);
 });
 it('one actual metal cast decays and a save/restored contact latch cannot duplicate its damage',()=>{
  const {state,context}=make({x:.2,y:0,z:0}),hit=wall(context,6);context.elements.cast('lightning',hit,{x:1,y:0,z:0});
  const initial=stepPlayerEnvironment(state,.1,context);expect(initial.shockDamage).toBeGreaterThan(0);
  const saved=JSON.parse(JSON.stringify(state));expect(validPlayerEnvironmentState(saved)).toBe(true);
  const loaded=clonePlayerEnvironmentState(saved);let extra=0;for(let i=0;i<8;i++){context.elements.tick(.1);extra+=stepPlayerEnvironment(loaded,.1,context).damage;}
  expect(extra).toBe(0);expect(loaded.chargeContact).toBe(false);expect([...context.elements.states.values()].some(s=>s.charge>0)).toBe(false);
  expect(context.elements.drainDrops()).toEqual([]);
 });
 it('indirect shared terrain can hurt caster and companion with isolated exposure state',()=>{
  const {state,context}=make(),companion=createPlayerEnvironmentState();wall(context,4);activate(context,'fire');companion.wet=5;
  expect(stepPlayerEnvironment(state,.1,context).ignited).toBe(true);expect(stepPlayerEnvironment(companion,.1,context).damage).toBe(0);
  expect(state.wet).toBe(0);expect(companion.burning).toBe(0);expect(context.elements.drainDrops()).toEqual([]);
 });
 it('leaving and returning before charge decay cannot hit twice, and a later new pulse can',()=>{
  const {state,context}=make({x:.2,y:0,z:0});wall(context,6);activate(context,'charge');expect(stepPlayerEnvironment(state,.1,context).damage).toBe(12);
  context.position.x=-1;stepPlayerEnvironment(state,.1,context);expect(state.chargeContact).toBe(false);context.position.x=.2;expect(stepPlayerEnvironment(state,.1,context).damage).toBe(0);
  context.elements.states.clear();advance(state,context,2);activate(context,'charge');expect(stepPlayerEnvironment(state,.1,context).damage).toBe(12);
 });
});

describe('deterministic bounded time and serializable actor isolation',()=>{
 it('matches fine steps, a clamped long step, and a restored fractional step',()=>{
  const {state,context}=make();state.burning=4;const fine=clonePlayerEnvironmentState(state),restored=clonePlayerEnvironmentState(state);
  const damage=stepPlayerEnvironment(state,8,context).damage;let fineDamage=0;for(let i=0;i<30;i++)fineDamage+=stepPlayerEnvironment(fine,1/60,context).damage;
  expect(fineDamage).toBeCloseTo(damage);expect(fine).toEqual(state);expect(state.burning).toBeCloseTo(3.5);
  stepPlayerEnvironment(restored,.03,context);const snapshot=JSON.parse(JSON.stringify(restored));expect(validPlayerEnvironmentState(snapshot)).toBe(true);const resumed=clonePlayerEnvironmentState(snapshot);stepPlayerEnvironment(resumed,.47,context);expect(resumed).toEqual(state);
 });
 it('finite statuses expire exactly at their fixed-step boundary without epsilon immunity',()=>{
  const {state,context}=make();state.wet=5;state.burning=0;advance(state,context,5);expect(state.wet).toBe(0);
  state.burning=4;expect(advance(state,context,4)).toBeCloseTo(24);expect(state.burning).toBe(0);expect(advance(state,context,.1)).toBe(0);
 });
 it.each([0,-1,NaN,Infinity,-Infinity])('rejects invalid/nonpositive dt %s without state changes',dt=>{
  const {state,context}=make();state.burning=3;const before=clonePlayerEnvironmentState(state);expect(stepPlayerEnvironment(state,dt,context).damage).toBe(0);expect(state).toEqual(before);
 });
 it('validates exact bounded fields and never aliases different actors',()=>{
  const state=createPlayerEnvironmentState();expect(validPlayerEnvironmentState(state)).toBe(true);
  const companion=clonePlayerEnvironmentState(state);companion.wet=5;expect(state.wet).toBe(0);
  for(const invalid of [null,{}, {...state,extra:true},{...state,wet:6},{...state,burning:Infinity},{...state,shock:-1},{...state,shockCooldown:2},{...state,chargeContact:1},{...state,accumulator:.1},{...state,version:2}])expect(validPlayerEnvironmentState(invalid)).toBe(false);
  expect(PLAYER_ENVIRONMENT_RULES.maxDt).toBe(.5);
 });
});
