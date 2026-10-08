import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {DungeonServer,type DungeonCheckpoint} from '../../src/dungeon/server';
import {parsePacket,validRaidState} from '../../src/dungeon/protocol';
import {QUESTS,questDeliveryCount,validQuestJournal} from '../../src/dungeon/quests';
import {place,STASH_HEIGHT} from '../../src/dungeon/inventory';
import type {Action,Item,Profile,QuestProgress} from '../../src/dungeon/types';

const item=(id:string,count=2,kind:Item['kind']='ore',found=true):Item=>({id,kind,count,found,quality:2,x:0,y:0,rotated:false});
const command=(sim:DungeonSimulation,p:Profile,action:Action)=>sim.command(p.actor.id,p.lastAction+1,action);
function setup(){const sim=new DungeonSimulation(),a=sim.join('a'.repeat(64),'A')!;return {sim,a};}
const assets=(p:Profile)=>structuredClone({quests:p.quests,stash:p.stash,bag:p.actor.bag,pending:p.pendingReturn,gold:p.gold,receipt:p.receipt});
const first=(progress=1,claimed=true):QuestProgress=>({id:'first-return',progress,claimed});
const ore=(progress=0,claimed=false):QuestProgress=>({id:'ore-delivery',progress,claimed});
function start(sim:DungeonSimulation,a:Profile){command(sim,a,{kind:'ready'});command(sim,a,{kind:'start'});sim.state.enemies=[];}
function extract(sim:DungeonSimulation,a:Profile){sim.state.elapsed=46;a.actor.position={...sim.state.exits[0].position};expect(command(sim,a,{kind:'interact',target:'exit-west'})).toContain('帰還の光');for(let i=0;i<81;i++)sim.step();expect(a.actor.status).toBe('extracted');}

describe('finite supplier quest rules',()=>{
 it('requires explicit acceptance before actual extraction, then an explicit reward claim before the second contract',()=>{
  const {sim,a}=setup();expect(command(sim,a,{kind:'accept-quest',quest:'ore-delivery'})).toContain('先の依頼');expect(a.quests).toBeUndefined();
  start(sim,a);extract(sim,a);expect(a.quests).toBeUndefined();command(sim,a,{kind:'return'});
  expect(command(sim,a,{kind:'accept-quest',quest:'first-return'})).toContain('受注しました');expect(a.quests).toEqual([first(0,false)]);
  command(sim,a,{kind:'claim-quest',quest:'first-return'});expect(a.gold).toBe(0);
  command(sim,a,{kind:'return'});sim.join(a.key,'A');expect(a.quests).toEqual([first(0,false)]);
  start(sim,a);extract(sim,a);expect(a.quests).toEqual([first(1,false)]);expect(a.gold).toBe(0);expect(a.receipt).toEqual([]);
  command(sim,a,{kind:'claim-quest',quest:'first-return'});expect(a.gold).toBe(0);command(sim,a,{kind:'return'});
  command(sim,a,{kind:'accept-quest',quest:'ore-delivery'});expect(a.quests).toHaveLength(1);
  expect(command(sim,a,{kind:'claim-quest',quest:'first-return'})).toContain('+20');expect(a.gold).toBe(20);
  command(sim,a,{kind:'accept-quest',quest:'ore-delivery'});expect(a.quests).toEqual([first(),ore()]);expect(validRaidState(sim.state)).toBe(true);
 });
 it('gives no progress for an interrupted extraction, a closed/used exit, or death',()=>{
  for(const reason of ['interrupted','closed','used','death']){
   const {sim,a}=setup();command(sim,a,{kind:'accept-quest',quest:'first-return'});start(sim,a);
   a.actor.position={...sim.state.exits[0].position};sim.state.elapsed=reason==='closed'?0:46;if(reason==='used')sim.state.exits[0].remaining=0;
   command(sim,a,{kind:'interact',target:'exit-west'});
   if(reason==='interrupted'){sim.step();sim.input(a.actor.id,1,{x:1,z:0,yaw:0,pitch:0,block:false,crouch:false});}
   if(reason==='death')sim.state.elapsed=479.98;
   for(let i=0;i<81;i++)sim.step();expect(a.quests).toEqual([first(0,false)]);expect(a.gold).toBe(0);
  }
 });
 it('counts only the winner of the last extraction slot',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;
  for(const p of [a,b]){command(sim,p,{kind:'accept-quest',quest:'first-return'});command(sim,p,{kind:'ready'});}
  command(sim,a,{kind:'start'});sim.state.enemies=[];sim.state.elapsed=46;sim.state.exits[0].remaining=1;
  for(const p of [a,b]){p.actor.position={...sim.state.exits[0].position};command(sim,p,{kind:'interact',target:'exit-west'});}
  for(let i=0;i<81;i++)sim.step();expect(a.quests).toEqual([first(1,false)]);expect(b.quests).toEqual([first(0,false)]);
 });
 it('consumes only two identified found ore units, preserving stack ID, quality, layout and other goods',()=>{
  const {sim,a}=setup();a.quests=[first(),ore()];a.gold=20;place(a.stash,item('selected',7),STASH_HEIGHT);place(a.stash,item('untouched',4),STASH_HEIGHT);
  const before=structuredClone(a.stash);expect(questDeliveryCount(a.quests[1],a.stash[0])).toBe(2);
  expect(command(sim,a,{kind:'deliver-quest',quest:'ore-delivery',item:'selected'})).toContain('2個');
  expect(a.stash).toEqual([{...before[0],count:5},before[1]]);expect(a.quests).toEqual([first(),ore(2)]);expect(a.gold).toBe(20);expect(a.receipt).toEqual([]);
  expect(command(sim,a,{kind:'claim-quest',quest:'ore-delivery'})).toContain('+30');expect(a.gold).toBe(50);expect(a.quests).toEqual([first(),ore(2,true)]);expect(validRaidState(sim.state)).toBe(true);
 });
 it('supports two explicit one-unit deliveries and removes exhausted stacks only',()=>{
  const {sim,a}=setup();a.quests=[first(),ore()];place(a.stash,item('one',1),STASH_HEIGHT);place(a.stash,item('two',3),STASH_HEIGHT);
  command(sim,a,{kind:'deliver-quest',quest:'ore-delivery',item:'one'});expect(a.quests![1].progress).toBe(1);expect(a.stash.map(i=>i.id)).toEqual(['two']);
  command(sim,a,{kind:'claim-quest',quest:'ore-delivery'});expect(a.gold).toBe(0);
  command(sim,a,{kind:'deliver-quest',quest:'ore-delivery',item:'two'});expect(a.quests![1].progress).toBe(2);expect(a.stash[0].count).toBe(2);
 });
 it('cannot consume another owner, bag, pending, missing, unextracted or wrong-kind stack',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.quests=[first(),ore()];b.stash=[item('other')];a.actor.bag=[item('bag')];a.pendingReturn=[item('pending')];
  place(a.stash,item('free',2,'ore',false),STASH_HEIGHT);place(a.stash,item('wrong',1,'relic'),STASH_HEIGHT);const before=assets(a),other=assets(b);
  for(const id of ['other','bag','pending','missing','free','wrong'])command(sim,a,{kind:'deliver-quest',quest:'ore-delivery',item:id});
  expect(assets(a)).toEqual(before);expect(assets(b)).toEqual(other);
 });
 it.each(['ready','raid','alive','dead','extracted'] as const)('rejects all quest changes in %s state atomically',state=>{
  const {sim,a}=setup();a.quests=[first(1,false)];a.stash=[item('ore')];
  if(state==='ready')a.actor.ready=true;else if(state==='raid')sim.state.phase='raid';else a.actor.status=state;
  const before=assets(a);for(const action of [{kind:'accept-quest',quest:'ore-delivery'},{kind:'claim-quest',quest:'first-return'},{kind:'deliver-quest',quest:'first-return',item:'ore'}] as Action[])expect(command(sim,a,action)).toContain('補給所');expect(assets(a)).toEqual(before);
  a.quests=[first(),ore()];const beforeOre=assets(a);command(sim,a,{kind:'deliver-quest',quest:'ore-delivery',item:'ore'});expect(assets(a)).toEqual(beforeOre);
 });
 it('rejects replay and fresh repeats of acceptance, delivery and rewards without duplication',()=>{
  const {sim,a}=setup();const accept:Action={kind:'accept-quest',quest:'first-return'};command(sim,a,accept);const accepted=assets(a);command(sim,a,accept);expect(assets(a)).toEqual(accepted);
  a.quests=[first(),ore()];a.stash=[item('ore',5)];a.gold=20;
  const deliver:Action={kind:'deliver-quest',quest:'ore-delivery',item:'ore'};command(sim,a,deliver);const sequence=a.lastAction,delivered=assets(a);
  for(let i=0;i<100;i++)sim.command(a.actor.id,sequence,deliver);command(sim,a,deliver);expect(assets(a)).toEqual(delivered);
  const claim:Action={kind:'claim-quest',quest:'ore-delivery'};command(sim,a,claim);const claimed=assets(a),claimSequence=a.lastAction;
  for(let i=0;i<100;i++)sim.command(a.actor.id,claimSequence,claim);command(sim,a,claim);command(sim,a,{kind:'accept-quest',quest:'ore-delivery'});expect(assets(a)).toEqual(claimed);expect(a.gold).toBe(50);expect(a.receipt).toHaveLength(1);
 });
 it('refuses gold overflow without marking claimed, then allows an exact-cap claim and bounded private receipt',()=>{
  const {sim,a}=setup();a.quests=[first(1,false)];a.gold=1e9-19;const before=assets(a);command(sim,a,{kind:'claim-quest',quest:'first-return'});expect(assets(a)).toEqual(before);
  a.gold=1e9-20;a.receipt=Array.from({length:128},(_,i)=>`old${i}`);command(sim,a,{kind:'claim-quest',quest:'first-return'});
  expect(a.gold).toBe(1e9);expect(a.quests![0].claimed).toBe(true);expect(a.receipt).toHaveLength(128);expect(a.receipt[0]).toBe('old1');expect(a.receipt.at(-1)).toContain('初めての生還');expect(validRaidState(sim.state)).toBe(true);
 });
 it('keeps copied owner journals and reward receipts out of peers and shared events',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.quests=[first(1,false)];command(sim,a,{kind:'claim-quest',quest:'first-return'});
  const own=sim.snapshot(a.actor.id),peer=sim.snapshot(b.actor.id);expect(own.quests).toEqual([first()]);expect(peer.quests).toEqual([]);expect(peer.trades).toEqual([]);expect(peer.gold).toBe(0);expect(JSON.stringify(peer)).not.toContain('first-return');expect(peer.events).toEqual([]);
  own.quests![0].progress=0;expect(a.quests[0].progress).toBe(1);expect(JSON.stringify(own)).not.toContain(a.key);
 });
});

describe('quest wire protocol and durable journal validation',()=>{
 it('accepts exactly the three bounded command shapes',()=>{
  for(const action of [{kind:'accept-quest',quest:'first-return'},{kind:'deliver-quest',quest:'ore-delivery',item:'owned-id'},{kind:'claim-quest',quest:'first-return'}])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action}))).not.toBeNull();
 });
 it.each([
  {kind:'accept-quest',quest:'unknown'},{kind:'accept-quest',quest:'toString'},{kind:'accept-quest',quest:'first-return',progress:1},
  {kind:'claim-quest',quest:'first-return',reward:1000},{kind:'claim-quest',quest:'first-return',owner:'p2'},
  {kind:'deliver-quest',quest:'ore-delivery'},{kind:'deliver-quest',quest:'ore-delivery',item:'ore',count:100},
  {kind:'deliver-quest',quest:'ore-delivery',item:'ore',found:true},{kind:'deliver-quest',quest:'ore-delivery',item:[]},
 ])('rejects client-forged quest payload %j',action=>{expect(parsePacket(JSON.stringify({type:'action',sequence:1,action}))).toBeNull();});
 it('keeps old journals optional without losing legacy stash, gold or pending goods',()=>{
  const {sim,a}=setup();a.gold=123;a.stash=[item('legacy')];a.pendingReturn=[item('pending')];expect(validRaidState(sim.state)).toBe(true);
  const restored=new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state});expect(restored.sim.snapshot(a.actor.id).quests).toEqual([]);expect(assets(restored.sim.state.profiles[0])).toEqual(assets(a));
 });
 it.each([
  undefined,null,{},[null],[3],[{}],[{id:'unknown',progress:0,claimed:false}],[{id:'toString',progress:0,claimed:false}],
  [{id:'first-return',progress:1}],[{...first(),extra:1}],[first(),first()],[first(),ore(),ore()],
  [first(-1,false)],[first(.5,false)],[first(2,false)],[first(NaN,false)],[first(Infinity,false)],[first(0,true)],
  [{...first(),claimed:'true'}],[ore()],[first(0,false),ore()],[first(1,false),ore()],[first(),ore(3)],[first(),ore(1,true)],
 ].map(quests=>[quests]))('fails closed on malformed journal %j',quests=>{
  const {sim,a}=setup();Object.assign(a,{quests});expect(()=>validRaidState(sim.state)).not.toThrow();expect(validRaidState(sim.state)).toBe(false);expect(validQuestJournal(quests)).toBe(false);
  expect(()=>new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state})).toThrow('refusing reset');
 });
 it('accepts coherent partial and completed journals regardless of storage order',()=>{
  for(const quests of [[],[first(0,false)],[first(1,false)],[first()],[first(),ore(1)],[ore(2,true),first()]])expect(validQuestJournal(quests)).toBe(true);
  expect(QUESTS['first-return'].reward+QUESTS['ore-delivery'].reward).toBe(50);
 });
});
