import {describe,it,expect} from 'vitest';
import {VoxelField} from '../../src/prototype/core/voxel';
import {REGIONAL_ENEMIES,type RegionalTactic} from '../../src/prototype/core/regions';
import {createEnemyTacticState,resetEnemyTacticState,stepEnemyTactic,enemyCanSee,createCombatFocus,gainCombatFocus,spendCombatFocus,type EnemyTacticInput,type EnemyTacticEvent} from '../../src/prototype/core/enemy-tactics';
const open={ray:()=>null};
const setup=(tactic:RegionalTactic='archer',distance=5)=>{
 const definition=REGIONAL_ENEMIES.find(e=>e.tactic===tactic)!;
 const state=createEnemyTacticState(definition),position={...definition.position};
 const input:EnemyTacticInput={definition,position,targetPosition:{x:position.x,y:position.y,z:position.z+distance},hp:definition.hp,targetAlive:true,field:open,dt:1/60};
 return{state,input};
};
const advance=(state:ReturnType<typeof createEnemyTacticState>,input:EnemyTacticInput,seconds:number,hz=60)=>{const out:EnemyTacticEvent[]=[];for(let i=0;i<Math.round(seconds*hz);i++)out.push(...stepEnemyTactic(state,{...input,dt:1/hz}).events);return out;};

describe('deterministic regional enemy controllers',()=>{
 it('uses the actual SDF ray for occlusion and a finite awareness range',()=>{
  const field=new VoxelField(),{input}=setup();input.position={x:0,y:.25,z:0};input.targetPosition={x:0,y:.25,z:5};input.field=field;
  expect(enemyCanSee(input)).toBe(true);field.box({x:-1,y:0,z:2},{x:1,y:3,z:2.5},3);expect(enemyCanSee(input)).toBe(false);
  expect(enemyCanSee({...input,field:open,targetPosition:{x:0,y:.25,z:15}})).toBe(false);
  expect(enemyCanSee({...input,field:open,forward:{x:0,y:0,z:-1}})).toBe(false);
  expect(enemyCanSee({...input,field:open,targetAlive:false})).toBe(false);
 });
 it('patrols unseen, alerts before attacking, and never applies damage in a tell',()=>{
  const {state,input}=setup();const hidden={...input,field:{ray:()=>({distance:1})}};
  const patrol=stepEnemyTactic(state,hidden);expect(patrol.awareness).toBe('patrol');expect(Math.hypot(patrol.velocity.x,patrol.velocity.z)).toBeGreaterThan(0);
  const early=advance(state,input,.4);expect(state.awareness).toBe('alert');expect(early).toHaveLength(0);
  const tell=advance(state,input,.2);expect(tell.map(e=>e.type)).toEqual(['tell']);expect(tell[0]).not.toHaveProperty('damage');
  const beforeRelease=advance(state,input,.6);expect(beforeRelease).toHaveLength(0);
  const release=advance(state,input,.2);expect(release.filter(e=>e.type==='projectile')).toHaveLength(1);
 });
 it.each(['archer','caster'] as const)('%s emits one projectile per completed telegraph with a locked target',tactic=>{
  const {state,input}=setup(tactic);const tell=advance(state,input,.6).find(e=>e.type==='tell')!;expect(tell.type).toBe('tell');
  const original={...input.targetPosition};input.targetPosition.x+=2;
  const events=advance(state,input,1.2);const shots=events.filter(e=>e.type==='projectile');expect(shots).toHaveLength(1);
  const shot=shots[0];expect(shot.target.x).toBe(original.x);expect(shot.at-tell.at).toBeGreaterThanOrEqual((tell.type==='tell'?tell.duration:0)-.0001);
  expect(Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)).toBeGreaterThan(0);
  expect(new Set(events.map(e=>e.eventId)).size).toBe(events.length);
 });
 it.each(['charge','flier','spear','melee'] as const)('%s releases its own attack after a visible windup',tactic=>{
  const {state,input}=setup(tactic,tactic==='spear'||tactic==='melee'?1.5:4);const events=advance(state,input,2);
  expect(events[0].type).toBe('tell');expect(events.some(e=>e.type===(tactic==='charge'||tactic==='flier'?'lunge':'melee'))).toBe(true);
 });
 it('searches the last seen position and returns home after losing sight',()=>{
  const {state,input}=setup();advance(state,input,.6);const last={...state.lastSeen};
  input.field={ray:()=>({distance:1})};input.position.x+=5;advance(state,input,1.3);
  expect(state.awareness).toBe('search');expect(state.lastSeen).toEqual(last);
  advance(state,input,3.2);expect(state.awareness).toBe('return');
  input.position={...state.home};stepEnemyTactic(state,input);expect(state.awareness).toBe('patrol');
 });
 it('cancels an in-progress attack on death, does not resurrect implicitly, and resets explicitly',()=>{
  const {state,input}=setup();advance(state,input,.6);expect(state.attack).not.toBeNull();
  const dead=stepEnemyTactic(state,{...input,hp:0,dt:2});expect(dead.events.map(e=>e.type)).toEqual(['cancel']);expect(dead.awareness).toBe('dead');
  expect(stepEnemyTactic(state,{...input,hp:0,dt:2}).events).toHaveLength(0);
  expect(stepEnemyTactic(state,{...input,hp:100,dt:2}).awareness).toBe('dead');
  resetEnemyTacticState(state,input.definition);expect(state.alive).toBe(true);expect(state.serial).toBe(0);expect(state.attack).toBeNull();expect(state.phase).toBe(1);expect(state.generation).toBe(1);
 });
 it('cancels attacks when the target dies or the enemy exceeds its leash',()=>{
  for(const reason of ['target','leash']){const {state,input}=setup();advance(state,input,.6);
   if(reason==='target')input.targetAlive=false;else input.position.x+=25;
   const out=stepEnemyTactic(state,input);expect(out.events.some(e=>e.type==='cancel')).toBe(true);expect(out.awareness).toBe('return');expect(state.attack).toBeNull();
  }
 });
 it('caps living summons at three and can replace reported defeated minions',()=>{
  const {state,input}=setup('summoner');const events=advance(state,input,22);
  const summons=events.filter(e=>e.type==='summon');expect(summons.reduce((sum,e)=>sum+e.count,0)).toBe(3);
  expect(summons.every(e=>e.maxAlive===3&&e.positions.length===e.count)).toBe(true);
  input.liveSummons=2;const next=advance(state,input,10).filter(e=>e.type==='summon');
  expect(next.length).toBeGreaterThan(0);expect(next.every(e=>e.count===1)).toBe(true);
 });
 it('changes boss phase and preserves distinct radial and combined attacks',()=>{
  const ice=setup('shockwave',4);const phase1=advance(ice.state,ice.input,2).find(e=>e.type==='burst')!;expect(phase1.type).toBe('burst');
  resetEnemyTacticState(ice.state,ice.input.definition);ice.input.hp=ice.input.definition.hp*.4;const phase2=advance(ice.state,ice.input,2).find(e=>e.type==='burst')!;
  expect(phase2.phase).toBe(2);if(phase1.type==='burst'&&phase2.type==='burst')expect(phase2.radius).toBeGreaterThan(phase1.radius);
  const tide=setup('tidal-combo',4);tide.input.hp=tide.input.definition.hp*.4;const combo=advance(tide.state,tide.input,8);
  expect(combo.map(e=>e.type)).toEqual(expect.arrayContaining(['lunge','burst','projectile']));
  for(const burst of combo.filter(e=>e.type==='burst'))expect(combo.some(e=>e.type==='tell'&&e.kind==='burst'&&e.at<burst.at)).toBe(true);
 });
 it('keeps 30 Hz and 120 Hz event sequences and timings equivalent',()=>{
  const run=(hz:number)=>{const {state,input}=setup('tidal-combo',4);input.hp=100;return advance(state,input,10,hz);};
  const a=run(30),b=run(120);expect(a.map(e=>e.type)).toEqual(b.map(e=>e.type));expect(a.map(e=>e.eventId)).toEqual(b.map(e=>e.eventId));
  for(let i=0;i<a.length;i++)expect(a[i].at).toBeCloseTo(b[i].at,6);
 });
 it('is JSON serializable and rejects a mismatched enemy identity',()=>{
  const {state,input}=setup();advance(state,input,.6);expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  expect(()=>stepEnemyTactic(state,{...input,definition:{...input.definition,id:999}})).toThrow();
  expect(stepEnemyTactic(state,{...input,dt:NaN}).events).toHaveLength(0);
 });
});
describe('confirmed-hit focus',()=>{
 it('caps focus at 100 and prevents duplicate hit awards and duplicate skill spending',()=>{
  const focus=createCombatFocus();expect(gainCombatFocus(focus,'hit-1',30)).toBe(true);expect(gainCombatFocus(focus,'hit-1',30)).toBe(false);expect(focus.value).toBe(30);
  expect(spendCombatFocus(focus,'ultimate')).toBe(false);gainCombatFocus(focus,'hit-2',80);expect(focus.value).toBe(100);
  expect(spendCombatFocus(focus,'ultimate')).toBe(true);expect(focus.value).toBe(0);gainCombatFocus(focus,'hit-3',100);expect(spendCombatFocus(focus,'ultimate')).toBe(false);expect(focus.value).toBe(100);
  expect(gainCombatFocus(focus,'invalid',NaN)).toBe(false);expect(spendCombatFocus(focus,'invalid',-1)).toBe(false);
 });
});
