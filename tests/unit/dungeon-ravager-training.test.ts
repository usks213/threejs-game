import {describe,expect,it} from 'vitest';
import {createActor,DungeonSimulation} from '../../src/dungeon/simulation';
import {activeRavagerSkill,getRavagerTraining,RAVAGER_SKILLS,ravagerIncomingMultiplier,ravagerMeleeMultiplier,ravagerRecoveryRate,ravagerSkillReadyIn,validRavagerSkillState,validRavagerTraining} from '../../src/dungeon/ravager-training';
import {parsePacket,validRaidState} from '../../src/dungeon/protocol';
import {place} from '../../src/dungeon/inventory';
import {attackPose,meleeDefinition} from '../../src/prototype/core/motion';
import type {Action,Actor,Enemy,Item,Profile,RavagerTraining} from '../../src/dungeon/types';

const none:RavagerTraining={skill:null,perk:null};
const send=(sim:DungeonSimulation,p:Profile,action:Action)=>sim.command(p.actor.id,p.lastAction+1,action);
const item=(id:string,kind:Item['kind']):Item=>({id,kind,count:1,quality:0,x:0,y:0,rotated:false,found:false});
function lobby(){const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'A')!,q=sim.join('b'.repeat(64),'B')!;send(sim,p,{kind:'class',classId:'ravager'});return {sim,p,q};}
function game(training:RavagerTraining=none){const {sim,p,q}=lobby();if(training.skill||training.perk)send(sim,p,{kind:'configure-ravager-training',...training});send(sim,p,{kind:'ready'});send(sim,q,{kind:'ready'});send(sim,p,{kind:'start'});sim.state.enemies=[];return {sim,p,q};}
function fireAt(sim:DungeonSimulation,target:Actor,damage=38,magic=true,from={x:0,y:1,z:-1},owner='p2'){
 sim.state.shots.push({id:'test-shot',owner,position:from,velocity:{x:(target.position.x-from.x)*20,y:0,z:(target.position.z-from.z)*20},life:1,damage,magic});sim.step();
}
function melee(training:RavagerTraining=none,{enemy=false,hp=145,heavy=true,guard=false,brace=false,expired=false,pitch=0}={}){
 const {sim,p,q}=game(training);p.actor.hp=hp;p.actor.position={x:0,y:0,z:2};p.actor.yaw=0;p.actor.pitch=pitch;
 if(training.skill)send(sim,p,{kind:'skill'});if(expired)sim.state.elapsed=5;
 let target:Actor=q.actor;target.position={x:0,y:0,z:.6};target.yaw=Math.PI;target.hp=target.maxHp=target.recoverable=1000;
 if(enemy){q.actor.position={x:11,y:0,z:-11};const e:Enemy={...createActor('target','Target'),position:{x:0,y:0,z:.6},yaw:Math.PI,status:'alive',phase:'heal',hp:1000,maxHp:1000,recoverable:1000,team:-1,home:{x:0,y:0,z:.6},alert:0,lootClaimed:false};sim.state.enemies=[e];target=e;}
 if(brace){target.training={skill:'brace',perk:null};target.skillState={skill:'brace',activeUntil:4,readyAt:18};}
 send(sim,p,{kind:'attack',heavy});let hitTick=0;
 for(let i=0;i<40&&!target.damageTaken;i++){if(guard){target.guard=1;target.input.block=true;target.inputAt=sim.state.elapsed;}sim.step();hitTick++;}
 return {sim,p,q,target,damage:target.damageTaken,hitTick};
}

describe('optional Ravager training and independent class choices',()=>{
 it('keeps legacy default stats, assets, movement and attacks unchanged',()=>{
  const {sim,p}=game();expect(p.actor.ravagerTraining).toBeUndefined();expect(p.actor.ravagerSkillState).toBeUndefined();expect(getRavagerTraining(p.actor)).toEqual(none);expect([p.actor.hp,p.actor.maxHp,p.actor.recoverable]).toEqual([145,145,145]);
  const x=p.actor.position.x;sim.input(p.actor.id,1,{...p.actor.input,x:1});sim.step();expect(p.actor.position.x-x).toBeCloseTo(2.85*.05);expect(send(sim,p,{kind:'skill'})).toContain('選んで');expect(validRaidState(sim.state)).toBe(true);
  const selected=game({skill:'frenzy',perk:'followthrough'});expect(selected.p.actor.bag).toEqual(p.actor.bag);expect(ravagerMeleeMultiplier(p.actor,0)).toBe(1);expect(ravagerIncomingMultiplier(p.actor,0)).toBe(1);
 });
 it('changes only the owner selection without healing or producing items, currency or progress',()=>{
  const {sim,p,q}=lobby();p.actor.hp=40;p.actor.recoverable=60;p.gold=37;p.quests=[{id:'first-return',progress:0,claimed:false}];const before=structuredClone({hp:p.actor.hp,recoverable:p.actor.recoverable,bag:p.actor.bag,gold:p.gold,stash:p.stash,quests:p.quests,pending:p.pendingReturn,receipt:p.receipt,other:q});
  send(sim,p,{kind:'configure-ravager-training',skill:'frenzy',perk:'laststand'});expect(p.actor.ravagerTraining).toEqual({skill:'frenzy',perk:'laststand'});send(sim,p,{kind:'configure-ravager-training',skill:null,perk:'followthrough'});expect(p.actor.ravagerTraining).toEqual({skill:null,perk:'followthrough'});
  expect({hp:p.actor.hp,recoverable:p.actor.recoverable,bag:p.actor.bag,gold:p.gold,stash:p.stash,quests:p.quests,pending:p.pendingReturn,receipt:p.receipt,other:q}).toEqual(before);expect(validRaidState(sim.state)).toBe(true);
 });
 it('retains both choices across class switches, clears both clocks and resets all HP bounds',()=>{
  const {sim,p}=lobby();send(sim,p,{kind:'configure-ravager-training',skill:'frenzy',perk:'laststand'});p.actor.ravagerSkillState={skill:'frenzy',activeUntil:5,readyAt:18};send(sim,p,{kind:'class',classId:'bastion'});expect(p.actor.ravagerSkillState).toBeUndefined();send(sim,p,{kind:'configure-training',skill:'brace',perk:'vigor'});p.actor.skillState={skill:'brace',activeUntil:4,readyAt:18};p.actor.recoverable=2;
  for(const [classId,hp] of [['ravager',145],['hunter',100],['bastion',135]] as const){send(sim,p,{kind:'class',classId});expect([p.actor.hp,p.actor.maxHp,p.actor.recoverable]).toEqual([hp,hp,hp]);expect(p.actor.skillState).toBeUndefined();expect(p.actor.ravagerSkillState).toBeUndefined();expect(p.actor.training).toEqual({skill:'brace',perk:'vigor'});expect(p.actor.ravagerTraining).toEqual({skill:'frenzy',perk:'laststand'});expect(validRaidState(sim.state)).toBe(true);}
 });
 it('rejects selection for a different class and outside an unready lobby',()=>{
  for(const patch of [{status:'alive'},{status:'dead'},{status:'extracted'},{ready:true}] as Partial<Actor>[]){const {sim,p}=lobby();Object.assign(p.actor,patch);expect(send(sim,p,{kind:'configure-ravager-training',skill:'frenzy',perk:'laststand'})).toContain('準備を解除');expect(p.actor.ravagerTraining).toBeUndefined();}
  const {sim,p,q}=lobby();expect(send(sim,q,{kind:'configure-ravager-training',skill:'frenzy',perk:null})).toContain('荒戦士');sim.state.phase='raid';expect(send(sim,p,{kind:'configure-ravager-training',skill:'frenzy',perk:null})).toContain('準備を解除');
 });
});

describe('authoritative Frenzy activation and lifecycle',()=>{
 it('expires after exactly100 fixed steps and permits reuse after360 despite floating-point accumulation',()=>{
  const {sim,p}=game({skill:'frenzy',perk:null});send(sim,p,{kind:'skill'});for(let i=0;i<99;i++)sim.step();expect(activeRavagerSkill(p.actor,sim.state.elapsed)).toBe('frenzy');sim.step();expect(sim.state.elapsed).toBeCloseTo(RAVAGER_SKILLS.frenzy.duration);expect(activeRavagerSkill(p.actor,sim.state.elapsed)).toBeNull();for(let i=100;i<360;i++)sim.step();expect(ravagerSkillReadyIn(p.actor,sim.state.elapsed)).toBe(0);expect(send(sim,p,{kind:'skill'})).toContain('発動');
 });
 it('uses the server clock, exact expiry/cooldown, replay protection and no free recovery',()=>{
  const {sim,p,q}=game({skill:'frenzy',perk:null});sim.state.elapsed=20;p.actor.hp=41;p.actor.recoverable=60;const before=structuredClone({hp:p.actor.hp,recoverable:p.actor.recoverable,bag:p.actor.bag,other:q,gold:p.gold,stash:p.stash});expect(send(sim,p,{kind:'skill'})).toContain('発動');const sequence=p.lastAction;
  expect(p.actor.ravagerSkillState).toEqual({skill:'frenzy',activeUntil:25,readyAt:38});expect(activeRavagerSkill(p.actor,20)).toBe('frenzy');expect(activeRavagerSkill(p.actor,19.999)).toBeNull();expect(activeRavagerSkill(p.actor,24.999)).toBe('frenzy');expect(activeRavagerSkill(p.actor,25)).toBeNull();expect(ravagerSkillReadyIn(p.actor,20)).toBe(18);expect(ravagerSkillReadyIn(p.actor,38)).toBe(0);
  for(let i=0;i<10;i++)expect(sim.command(p.actor.id,sequence,{kind:'skill'})).toContain('処理済み');expect(send(sim,p,{kind:'skill'})).toContain('再使用待ち');expect(p.actor.ravagerSkillState?.readyAt).toBe(38);expect({hp:p.actor.hp,recoverable:p.actor.recoverable,bag:p.actor.bag,other:q,gold:p.gold,stash:p.stash}).toEqual(before);
  sim.state.elapsed=38;expect(send(sim,p,{kind:'skill'})).toContain('発動');expect(p.actor.ravagerSkillState).toEqual({skill:'frenzy',activeUntil:43,readyAt:56});expect(validRaidState(sim.state)).toBe(true);
 });
 it('requires both equipped and carried greatsword; rejects busy phases without starting cooldown',()=>{
  for(const patch of [{phase:'windup'},{phase:'strike'},{phase:'recover'},{phase:'heal'},{cast:.8},{cast:-.55},{interaction:'chest0'},{extract:.5}] as Partial<Actor>[]){const {sim,p}=game({skill:'frenzy',perk:null});Object.assign(p.actor,patch);expect(send(sim,p,{kind:'skill'})).toContain('終了');expect(p.actor.ravagerSkillState).toBeUndefined();}
  for(const weapon of ['greatsword','sword'] as const){const {sim,p}=game({skill:'frenzy',perk:null});p.actor.weapon=weapon;if(weapon==='greatsword')p.actor.bag=p.actor.bag.filter(i=>i.kind!=='greatsword');expect(send(sim,p,{kind:'skill'})).toContain('大剣');expect(p.actor.ravagerSkillState).toBeUndefined();}
 });
 it('does not activate while dead/extracted/in the lobby or for other classes',()=>{
  for(const patch of [{status:'lobby'},{status:'dead'},{status:'extracted'},{classId:'hunter'},{classId:'bastion'}] as Partial<Actor>[]){const {sim,p}=game({skill:'frenzy',perk:null});Object.assign(p.actor,patch);send(sim,p,{kind:'skill'});expect(p.actor.ravagerSkillState).toBeUndefined();}
 });
 it('retains clocks across reconnects, exposes opponent training but no bag, and suppresses effects after death',()=>{
  const {sim,p,q}=game({skill:'frenzy',perk:'laststand'});send(sim,p,{kind:'skill'});const state=structuredClone(p.actor.ravagerSkillState);sim.disconnect(p.actor.id);sim.join(p.key,'A');expect(p.actor.ravagerSkillState).toEqual(state);const other=sim.snapshot(q.actor.id).actors.find(a=>a.id===p.actor.id)!;expect(other.ravagerTraining).toEqual(p.actor.ravagerTraining);expect(other.ravagerSkillState).toEqual(state);expect(other.bag).toEqual([]);expect(activeRavagerSkill(other,0)).toBe('frenzy');p.actor.status='dead';expect(activeRavagerSkill(p.actor,0)).toBeNull();expect(ravagerIncomingMultiplier(p.actor,0)).toBe(1);
 });
 it('resets disconnected and connected clocks at the next raid while retaining both class selections',()=>{
  const {sim,p,q}=game({skill:'frenzy',perk:'followthrough'});p.actor.training={skill:'rush',perk:'vigor'};send(sim,p,{kind:'skill'});const offline=sim.join('c'.repeat(64),'C')!;offline.actor.classId='bastion';offline.actor.training={skill:'rush',perk:null};offline.actor.skillState={skill:'rush',activeUntil:2.5,readyAt:14};sim.disconnect(offline.actor.id);p.actor.status=q.actor.status='dead';sim.state.phase='finished';send(sim,p,{kind:'return'});send(sim,q,{kind:'return'});sim.disconnect(p.actor.id);send(sim,q,{kind:'ready'});send(sim,q,{kind:'start'});
  expect(sim.state.phase).toBe('raid');expect(p.actor.ravagerSkillState).toBeUndefined();expect(offline.actor.skillState).toBeUndefined();expect(p.actor.ravagerTraining).toEqual({skill:'frenzy',perk:'followthrough'});expect(p.actor.training).toEqual({skill:'rush',perk:'vigor'});expect(validRaidState(sim.state)).toBe(true);
 });
});

describe('Ravager damage and perk boundaries',()=>{
 it.each([
  ['body',-1.2,78,98,112,false],['head',.2,105,132,151,false],
  ['AI body',-1.2,78,98,112,true],['AI head',.2,105,132,151,true]
 ] as const)('uses exact golden damage for aimed %s contacts',(_zone,pitch,baseDamage,frenzyDamage,combinedDamage,enemy)=>{
  // Downward aim reaches the torso; the raised aim first meets the head-only
  // capsule. Assert fixed goldens rather than inferring the zone from baseline.
  const base=melee(none,{pitch,enemy}),frenzy=melee({skill:'frenzy',perk:null},{pitch,enemy}),combined=melee({skill:'frenzy',perk:'laststand'},{pitch,enemy,hp:50.75});
  expect(base.damage).toBe(baseDamage);expect(frenzy.damage).toBe(frenzyDamage);expect(combined.damage).toBe(combinedDamage);expect(combined.p.actor.hit).toContain(combined.target.id);expect(frenzy.hitTick).toBe(base.hitTick);expect(combined.hitTick).toBe(base.hitTick);
 });
 it('applies laststand at the exact 35% boundary and removes it immediately after healing',()=>{
  const {sim,p}=game({skill:'frenzy',perk:'laststand'});send(sim,p,{kind:'skill'});p.actor.hp=50.75;expect(ravagerMeleeMultiplier(p.actor,0)).toBe(1.25*1.15);p.actor.hp=50.750001;expect(ravagerMeleeMultiplier(p.actor,0)).toBe(1.25);p.actor.hp=50.75;send(sim,p,{kind:'heal'});expect(p.actor.hp).toBe(85.75);expect(ravagerMeleeMultiplier(p.actor,0)).toBe(1.25);
  for(const hp of [0,-1,NaN,Infinity]){p.actor.hp=hp;expect(ravagerMeleeMultiplier(p.actor,5)).toBe(1);}
 });
 it('limits frenzy to greatsword melee and laststand to actual melee weapons without cross-class effects',()=>{
  const {sim,p}=game({skill:'frenzy',perk:'laststand'});send(sim,p,{kind:'skill'});p.actor.hp=40;
  for(const [weapon,multiplier] of [['greatsword',1.25*1.15],['sword',1.15],['dagger',1.15],['bow',1],['staff',1]] as const){p.actor.weapon=weapon;expect(ravagerMeleeMultiplier(p.actor,0)).toBe(multiplier);expect(ravagerIncomingMultiplier(p.actor,0)).toBe(1.2);}
  for(const classId of ['bastion','shade','hunter','arcanist','keeper'] as const){p.actor.classId=classId;p.actor.weapon='greatsword';expect(ravagerMeleeMultiplier(p.actor,0)).toBe(1);expect(ravagerIncomingMultiplier(p.actor,0)).toBe(1);expect(ravagerSkillReadyIn(p.actor,0)).toBe(0);}
 });
 it.each([false,true])('uses actual blade contact and the same combined damage against enemy=%s',enemy=>{
  const base=melee(none,{enemy}),frenzy=melee({skill:'frenzy',perk:null},{enemy}),combined=melee({skill:'frenzy',perk:'laststand'},{enemy,hp:50.75}),expired=melee({skill:'frenzy',perk:null},{enemy,expired:true});
  expect(base.damage).toBeGreaterThan(0);const head=base.damage===Math.round(78*1.35)?1.35:1;expect(base.damage).toBe(Math.round(78*head));expect(frenzy.damage).toBe(Math.round(78*head*1.25));expect(combined.damage).toBe(Math.round(78*head*1.25*1.15));expect(expired.damage).toBe(base.damage);expect([frenzy.hitTick,combined.hitTick,expired.hitTick]).toEqual([base.hitTick,base.hitTick,base.hitTick]);const after=combined.target.hp;for(let i=0;i<30;i++)combined.sim.step();expect(combined.target.hp).toBe(after);
 });
 it('applies shield and active Bastion brace reduction after outgoing bonuses',()=>{
  const source=melee({skill:'frenzy',perk:'laststand'},{hp:50.75}),shield=melee({skill:'frenzy',perk:'laststand'},{hp:50.75,guard:true}),brace=melee({skill:'frenzy',perk:'laststand'},{hp:50.75,guard:true,brace:true});expect(shield.damage).toBe(Math.round(source.damage*.12));expect(brace.damage).toBe(Math.round(source.damage*.06));
 });
 it.each([false,true])('takes Frenzy risk from projectile magic=%s and reduces it before guard rounding',magic=>{
  for(const [guard,yaw,expected] of [[false,0,46],[true,0,5],[true,Math.PI,46]] as const){const {sim,p}=game({skill:'frenzy',perk:null});send(sim,p,{kind:'skill'});p.actor.position={x:0,y:0,z:0};p.actor.yaw=yaw;p.actor.guard=guard?1:0;p.actor.input.block=guard;p.actor.inputAt=sim.state.elapsed;if(guard)expect(place(p.actor.bag,item('shield','shield'))).toBe(true);fireAt(sim,p.actor,38,magic);expect(p.actor.damageTaken).toBe(expected);expect(validRaidState(sim.state)).toBe(true);}
 });
 it('takes the same risk from actual AI melee and keeps risk after a weapon change until expiry',()=>{
  function attacked(active:boolean){const {sim,p,q}=game({skill:'frenzy',perk:null});p.actor.position={x:0,y:0,z:.6};q.actor.position={x:11,y:0,z:-11};if(active)send(sim,p,{kind:'skill'});p.actor.weapon='sword';const e:Enemy={...createActor('enemy','Enemy'),position:{x:0,y:0,z:2},status:'alive',team:-1,home:{x:0,y:0,z:2},alert:0,lootClaimed:false};sim.state.enemies=[e];for(let i=0;i<40&&!p.actor.damageTaken;i++)sim.step();return p.actor.damageTaken;}
  const base=attacked(false);expect(base).toBeGreaterThan(0);expect(attacked(true)).toBe(Math.round(base*1.2));
  const {sim,p}=game({skill:'frenzy',perk:null});send(sim,p,{kind:'skill'});p.actor.position={x:0,y:0,z:0};p.actor.weapon='dagger';sim.state.elapsed=4.95;fireAt(sim,p.actor);expect(p.actor.damageTaken).toBe(38);expect(ravagerIncomingMultiplier(p.actor,5)).toBe(1);
 });
 it.each([false,true])('does not multiply outgoing ranged damage magic=%s',magic=>{
  const {sim,p}=game({skill:'frenzy',perk:'laststand'});send(sim,p,{kind:'skill'});p.actor.hp=40;p.actor.weapon=magic?'staff':'bow';p.actor.spells=1;send(sim,p,{kind:magic?'cast':'shoot'});for(let i=0;i<20&&!sim.state.shots.length;i++)sim.step();expect(sim.state.shots[0]?.damage).toBe(magic?38:28);
 });
});

describe('followthrough uses the same authored recovery clock',()=>{
 it('shortens only greatsword heavy recovery by20%, leaving windup, strike and hit timing identical',()=>{
  function timeline(training:RavagerTraining){const {sim,p}=game(training);send(sim,p,{kind:'attack',heavy:true});const phases:{phase:Actor['phase'];time:number;tick:number}[]=[];for(let i=0;i<70&&p.actor.phase!=='idle';i++){sim.step();const visible=sim.snapshot(p.actor.id).actors.find(a=>a.id===p.actor.id)!;expect(visible.time).toBe(p.actor.time);expect(attackPose(visible.kind,visible.phase,visible.time,1,'greatsword')).toEqual(attackPose(p.actor.kind,p.actor.phase,p.actor.time,1,'greatsword'));phases.push({phase:p.actor.phase,time:p.actor.time,tick:sim.state.tick});}return phases;}
  const base=timeline(none),fast=timeline({skill:null,perk:'followthrough'});expect(fast.filter(p=>p.phase==='windup'||p.phase==='strike')).toEqual(base.filter(p=>p.phase==='windup'||p.phase==='strike'));expect(base.filter(p=>p.phase==='recover')).toHaveLength(20);expect(fast.filter(p=>p.phase==='recover')).toHaveLength(16);expect(fast.filter(p=>p.phase==='recover')[1].time).toBe(.0625);expect(base.filter(p=>p.phase==='recover')[1].time).toBe(.05);expect(fast.at(-1)!.tick).toBe(base.at(-1)!.tick-4);
  expect(melee({skill:null,perk:'followthrough'}).hitTick).toBe(melee().hitTick);expect(melee({skill:null,perk:'followthrough'}).damage).toBe(melee().damage);
 });
 it('never modifies other classes, perks, weapons, swing kinds or phases',()=>{
  const actor=createActor('a','A','ravager');Object.assign(actor,{status:'alive',phase:'recover',kind:'overhead',ravagerTraining:{skill:null,perk:'followthrough'}});expect(ravagerRecoveryRate(actor)).toBe(1.25);
  for(const patch of [{classId:'bastion'},{weapon:'sword'},{weapon:'dagger'},{kind:'slash'},{kind:'return'},{phase:'windup'},{phase:'strike'},{phase:'idle'},{phase:'heal'},{status:'dead'},{ravagerTraining:none},{ravagerTraining:{skill:null,perk:'laststand'}}] as Partial<Actor>[]){expect(ravagerRecoveryRate({...actor,...patch})).toBe(1);}
  expect(meleeDefinition('overhead','greatsword').recover).toBe(.96);
 });
});

describe('strict additive Ravager protocol and save compatibility',()=>{
 it('accepts old saves and exact new action payloads only',()=>{
  expect(validRaidState(game().sim.state)).toBe(true);for(const skill of [null,'frenzy'])for(const perk of [null,'laststand','followthrough'])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action:{kind:'configure-ravager-training',skill,perk}}))).not.toBeNull();
  for(const action of [{kind:'configure-ravager-training',skill:'rush',perk:null},{kind:'configure-ravager-training',skill:'frenzy',perk:'vigor'},{kind:'configure-ravager-training',skill:'frenzy'},{kind:'configure-ravager-training',skill:'frenzy',perk:null,actor:'p2'},{kind:'skill',duration:1000},{kind:'skill',classId:'ravager'}])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action}))).toBeNull();
 });
 it('rejects missing subfields, cross-class ids, nonfinite/fabricated clocks and extra properties',()=>{
  for(const value of [null,{},[],{skill:'frenzy'},{skill:'frenzy',perk:'stride'},{skill:'rush',perk:'laststand'},{...none,extra:true}])expect(validRavagerTraining(value)).toBe(false);
  for(const value of [null,{},[],{skill:'rush',activeUntil:5,readyAt:18},{skill:'frenzy',activeUntil:NaN,readyAt:18},{skill:'frenzy',activeUntil:5,readyAt:Infinity},{skill:'frenzy',activeUntil:5,readyAt:19},{skill:'frenzy',activeUntil:4,readyAt:17},{skill:'frenzy',activeUntil:5,readyAt:18,extra:true}])expect(validRavagerSkillState(value)).toBe(false);
 });
 it('rejects present-invalid fields, cross-class active state, impossible stats and future activations',()=>{
  const {sim,p}=game({skill:'frenzy',perk:null});send(sim,p,{kind:'skill'});expect(validRaidState(sim.state)).toBe(true);
  for(const patch of [{maxHp:999},{ravagerTraining:undefined},{ravagerTraining:null},{ravagerSkillState:undefined},{ravagerSkillState:null},{classId:'bastion'},{ravagerTraining:none},{ravagerSkillState:{skill:'frenzy',activeUntil:6,readyAt:19}},{skillState:{skill:'brace',activeUntil:4,readyAt:18},training:{skill:'brace',perk:null}}]){const saved=structuredClone(sim.state);Object.assign(saved.profiles[0].actor,patch);expect(validRaidState(saved),JSON.stringify(patch)).toBe(false);}
  for(const time of [NaN,Infinity,-1]){expect(activeRavagerSkill(p.actor,time)).toBeNull();expect(ravagerSkillReadyIn(p.actor,time)).toBe(0);}
 });
});
