import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {DungeonServer,type DungeonCheckpoint} from '../../src/dungeon/server';
import {isSnapshot} from '../../src/dungeon/client';
import {parsePacket,validRaidState} from '../../src/dungeon/protocol';
import {BAG_HEIGHT,BAG_WIDTH,place,STASH_HEIGHT,validInventory} from '../../src/dungeon/inventory';
import type {Action,Item,Profile} from '../../src/dungeon/types';

const item=(id:string,kind:Item['kind']='ore',count=1,found=true):Item=>({id,kind,count,found,quality:1,x:0,y:0,rotated:false});
const command=(sim:DungeonSimulation,profile:Profile,action:Action)=>sim.command(profile.actor.id,profile.lastAction+1,action);
const ticks=(sim:DungeonSimulation,count:number)=>{for(let i=0;i<count;i++)sim.step();};
function setup(){const sim=new DungeonSimulation(),a=sim.join('a'.repeat(64),'A')!;return {sim,a};}
function packed(prefix:string,height:number):Item[]{return Array.from({length:BAG_WIDTH*height},(_,i)=>({...item(prefix+i,'ore',i%10+1),x:i%BAG_WIDTH,y:Math.floor(i/BAG_WIDTH)}));}
function raiding(){const s=setup();command(s.sim,s.a,{kind:'ready'});command(s.sim,s.a,{kind:'start'});s.sim.state.enemies=[];s.sim.state.elapsed=46;s.a.actor.position={...s.sim.state.exits[0].position};return s;}
function extract(sim:DungeonSimulation,a:Profile){expect(command(sim,a,{kind:'interact',target:'exit-west'})).toContain('帰還の光');ticks(sim,81);}
const assets=(sim:DungeonSimulation,p:Profile)=>structuredClone({bag:p.actor.bag,stash:p.stash,pending:p.pendingReturn,gold:p.gold,receipt:p.receipt,shop:sim.state.shop,serial:sim.state.serial});
const allOwned=(sim:DungeonSimulation)=>sim.state.profiles.flatMap(p=>[...p.stash,...p.actor.bag,...(p.pendingReturn??[])]).concat(sim.state.enemies.flatMap(e=>e.bag),sim.state.containers.flatMap(c=>c.items));

describe('bounded full-stash extraction',()=>{
 it('escapes with a full 100-cell stash and a full 50-cell bag, retaining every UUID, stack and original pending position exactly once',()=>{
  const {sim,a}=raiding();a.stash=packed('banked-',STASH_HEIGHT);a.actor.bag=packed('return-',BAG_HEIGHT).map(i=>({...i,found:false}));
  const stash=structuredClone(a.stash),carried=structuredClone(a.actor.bag),beforeExit=sim.state.exits[0].remaining,beforeXp=a.actor.xp;
  expect(validRaidState(sim.state)).toBe(true);extract(sim,a);
  expect(a.actor.status).toBe('extracted');expect(a.actor.bag).toEqual([]);expect(a.stash).toEqual(stash);
  expect(a.pendingReturn).toEqual(carried.map(i=>({...i,found:true})));expect(validInventory(a.pendingReturn)).toBe(true);
  expect(sim.state.exits[0].remaining).toBe(beforeExit-1);expect(a.actor.xp).toBe(beforeXp+50);
  expect(a.result).toBe('帰還成功。0品を倉庫へ保存、50品は帰還品として保管');expect(validRaidState(sim.state)).toBe(true);
  const after=assets(sim,a);command(sim,a,{kind:'interact',target:'exit-west'});ticks(sim,100);
  expect(assets(sim,a)).toEqual(after);expect(sim.state.exits[0].remaining).toBe(beforeExit-1);
  expect(new Set(allOwned(sim).map(i=>i.id)).size).toBe(allOwned(sim).length);
 });
 it('handles fragmented space using dimensions, banks later small items after a large-item miss, and leaves only the remainder in one valid batch',()=>{
  const {sim,a}=raiding();a.stash=packed('fragment-',STASH_HEIGHT).filter(i=>(i.x+i.y)%2===0);a.actor.bag=[];
  for(const value of [item('large-relic','relic',1,false),{...item('wide-sword','sword',1,false),rotated:true},item('small-ore','ore',10,false),item('small-potion','potion',3,false)])expect(place(a.actor.bag,value)).toBe(true);
  const originals=structuredClone(a.actor.bag),stash=structuredClone(a.stash);extract(sim,a);
  expect(a.actor.status).toBe('extracted');expect(a.stash.slice(0,stash.length)).toEqual(stash);
  expect(a.stash.slice(stash.length).map(i=>[i.id,i.count,i.found])).toEqual([['small-ore',10,true],['small-potion',3,true]]);
  expect(a.pendingReturn).toEqual(originals.slice(0,2).map(i=>({...i,found:true})));
  expect(a.result).toBe('帰還成功。2品を倉庫へ保存、2品は帰還品として保管');expect(validRaidState(sim.state)).toBe(true);
 });
 it('does not merge stacks or change IDs when only some carried items fit',()=>{
  const {sim,a}=raiding();a.stash=packed('old-',STASH_HEIGHT).slice(0,99);a.actor.bag=[];
  place(a.actor.bag,item('first-stack','ore',7,false));place(a.actor.bag,item('second-stack','ore',3,false));extract(sim,a);
  expect(a.stash.at(-1)).toMatchObject({id:'first-stack',count:7,found:true});expect(a.pendingReturn).toEqual([{...item('second-stack','ore',3),x:1}]);
  expect(a.stash).toHaveLength(100);expect(a.actor.bag).toHaveLength(0);expect(validRaidState(sim.state)).toBe(true);
 });
 it('reports zero pending when all carried items fit without counting older stash contents',()=>{
  const {sim,a}=raiding();place(a.stash,item('old-stash'),STASH_HEIGHT);const count=a.actor.bag.length;extract(sim,a);
  expect(a.result).toBe(`帰還成功。${count}品を倉庫へ保存、0品は帰還品として保管`);expect(a.pendingReturn).toEqual([]);expect(a.stash).toHaveLength(count+1);
 });
 it('gives the last exit slot to only one channel without losing the other explorer’s unreturned bag',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;command(sim,a,{kind:'ready'});command(sim,b,{kind:'ready'});command(sim,a,{kind:'start'});
  sim.state.enemies=[];sim.state.elapsed=46;sim.state.exits[0].remaining=1;
  for(const p of [a,b]){p.stash=packed(`${p.actor.id}-stash-`,STASH_HEIGHT);p.actor.position={...sim.state.exits[0].position};command(sim,p,{kind:'interact',target:'exit-west'});}
  const carriedA=structuredClone(a.actor.bag),carriedB=structuredClone(b.actor.bag);ticks(sim,81);
  expect(a.actor.status).toBe('extracted');expect(a.pendingReturn).toEqual(carriedA.map(i=>({...i,found:true})));
  expect(b.actor.status).toBe('alive');expect(b.actor.bag).toEqual(carriedB);expect(b.pendingReturn).toEqual([]);expect(sim.state.exits[0].remaining).toBe(0);expect(validRaidState(sim.state)).toBe(true);
 });
 it('requires the entire batch to be received before another raid and cannot accumulate overflow across raids',()=>{
  const {sim,a}=raiding();a.stash=packed('old-bank-',STASH_HEIGHT);const ids=a.actor.bag.map(i=>i.id);extract(sim,a);command(sim,a,{kind:'return'});
  expect(command(sim,a,{kind:'ready'})).toContain('帰還品');expect(command(sim,a,{kind:'start'})).toContain('帰還品');
  for(const value of [...a.pendingReturn!])expect(command(sim,a,{kind:'claim-return',item:value.id,to:'bag'})).toContain('受け取りました');
  expect(a.pendingReturn).toEqual([]);expect(command(sim,a,{kind:'ready'})).toBe('準備完了');expect(command(sim,a,{kind:'start'})).toBe('遠征を開始しました');
  expect(a.actor.bag.map(i=>i.id)).toEqual(ids);sim.state.enemies=[];sim.state.elapsed=46;a.actor.position={...sim.state.exits[0].position};extract(sim,a);
  expect(a.pendingReturn!.map(i=>i.id)).toEqual(ids);expect(a.pendingReturn).toHaveLength(ids.length);expect(allOwned(sim).filter(i=>ids.includes(i.id))).toHaveLength(ids.length);expect(validRaidState(sim.state)).toBe(true);
 });
 it('still requires the full uninterrupted extraction channel when the stash is full',()=>{
  const {sim,a}=raiding();a.stash=packed('full-',STASH_HEIGHT);const before=assets(sim,a),slots=sim.state.exits[0].remaining;
  command(sim,a,{kind:'interact',target:'exit-west'});ticks(sim,20);sim.input(a.actor.id,1,{x:1,z:0,yaw:0,pitch:0,block:false,crouch:false});ticks(sim,70);
  expect(a.actor.status).toBe('alive');expect(a.actor.interaction).toBeNull();expect(assets(sim,a)).toEqual(before);expect(sim.state.exits[0].remaining).toBe(slots);
 });
});

describe('owner-only atomic pending claims and preparation gates',()=>{
 it('claims into the chosen bag or stash, keeps quantities, quality and rotation, and permits readiness only after the last claim',()=>{
  const {sim,a}=setup();a.pendingReturn=[];place(a.pendingReturn,{...item('sword','sword'),quality:5,rotated:true});place(a.pendingReturn,item('ore','ore',8));
  expect(command(sim,a,{kind:'ready'})).toContain('帰還品');expect(a.actor.ready).toBe(false);
  expect(command(sim,a,{kind:'claim-return',item:'sword',to:'bag'})).toContain('受け取りました');expect(a.actor.bag[0]).toMatchObject({id:'sword',quality:5,rotated:true,found:true});
  expect(a.pendingReturn).toHaveLength(1);expect(command(sim,a,{kind:'ready'})).toContain('帰還品');
  expect(command(sim,a,{kind:'claim-return',item:'ore',to:'stash'})).toContain('受け取りました');expect(a.stash[0]).toMatchObject({id:'ore',count:8,found:true});
  expect(a.pendingReturn).toEqual([]);expect(command(sim,a,{kind:'ready'})).toBe('準備完了');expect(validRaidState(sim.state)).toBe(true);
 });
 it.each(['bag','stash'] as const)('leaves the entire ownership state unchanged when claiming into a full %s',to=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting')];if(to==='bag')a.actor.bag=packed('bag-',BAG_HEIGHT);else a.stash=packed('stash-',STASH_HEIGHT);
  const before=assets(sim,a);expect(command(sim,a,{kind:'claim-return',item:'waiting',to})).toContain('空き');expect(assets(sim,a)).toEqual(before);expect(validRaidState(sim.state)).toBe(true);
 });
 it('rejects a geometrically fragmented destination even with many empty cells',()=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting-relic','relic')];a.stash=packed('fragment-',STASH_HEIGHT).filter(i=>(i.x+i.y)%2===0);
  const before=assets(sim,a);command(sim,a,{kind:'claim-return',item:'waiting-relic',to:'stash'});expect(assets(sim,a)).toEqual(before);
 });
 it('rejects old sequence numbers and fresh repeated UUIDs without duplicating claims',()=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting','ore',9)];command(sim,a,{kind:'claim-return',item:'waiting',to:'stash'});const after=assets(sim,a),sequence=a.lastAction;
  for(let i=0;i<100;i++)sim.command(a.actor.id,sequence,{kind:'claim-return',item:'waiting',to:'bag'});
  command(sim,a,{kind:'claim-return',item:'waiting',to:'bag'});expect(assets(sim,a)).toEqual(after);expect(a.stash).toHaveLength(1);expect(a.actor.bag).toEqual([]);
 });
 it.each(['ready','raid','alive','extracted','dead'] as const)('refuses claims in %s state without moving any assets',state=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting')];
  if(state==='ready')a.actor.ready=true;else if(state==='raid')sim.state.phase='raid';else a.actor.status=state;
  const before=assets(sim,a);expect(command(sim,a,{kind:'claim-return',item:'waiting',to:'stash'})).toContain('補給所');expect(assets(sim,a)).toEqual(before);
 });
 it('cannot claim other owners’ pending returns or use the claim action to take banked/carried goods',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('a-pending')];b.pendingReturn=[item('b-private')];place(a.stash,item('banked'),STASH_HEIGHT);place(a.actor.bag,item('carried'));
  const beforeA=assets(sim,a),beforeB=assets(sim,b);
  for(const id of ['b-private','banked','carried','missing'])command(sim,a,{kind:'claim-return',item:id,to:'stash'});
  expect(assets(sim,a)).toEqual(beforeA);expect(assets(sim,b)).toEqual(beforeB);
 });
 it('exposes only the owner’s copied pending batch and never secrets or another player’s return IDs',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('a-return')];b.pendingReturn=[item('b-private')];
  const sa=sim.snapshot(a.actor.id),sb=sim.snapshot(b.actor.id);expect(sa.pendingReturn).toEqual(a.pendingReturn);expect(sb.pendingReturn).toEqual(b.pendingReturn);
  expect(JSON.stringify(sa)).not.toContain('b-private');expect(JSON.stringify(sb)).not.toContain('a-return');expect(JSON.stringify(sa)).not.toContain(a.key);
  sa.pendingReturn![0].count=9;expect(a.pendingReturn[0].count).toBe(1);
 });
 it('blocks purchases and raid starts while pending, even if a readiness flag is forced',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('waiting')];a.gold=100;
  const before=assets(sim,a);expect(command(sim,a,{kind:'buy-supply',supply:'potion'})).toContain('帰還品');expect(assets(sim,a)).toEqual(before);
  command(sim,b,{kind:'ready'});expect(command(sim,b,{kind:'start'})).toContain('帰還品');expect(sim.state.phase).toBe('lobby');
  a.actor.ready=true;expect(command(sim,b,{kind:'start'})).toContain('帰還品');expect(sim.state.raid).toBe(0);expect(a.pendingReturn).toHaveLength(1);
 });
 it('allows banked treasure sales and normal transfers to free room, without selling or transferring pending items directly',()=>{
  const {sim,a}=setup();a.stash=packed('banked-',STASH_HEIGHT);a.pendingReturn=[item('waiting','ore',10)];
  const before=assets(sim,a);command(sim,a,{kind:'sell-treasure',item:'waiting'});command(sim,a,{kind:'transfer',item:'waiting',to:'bag'});expect(assets(sim,a)).toEqual(before);
  expect(command(sim,a,{kind:'sell-treasure',item:'banked-0'})).toContain('売却しました');expect(a.gold).toBeGreaterThan(0);
  expect(command(sim,a,{kind:'transfer',item:'banked-1',to:'bag'})).toContain('移しました');
  expect(command(sim,a,{kind:'transfer',item:'banked-1',to:'stash'})).toContain('移しました');
  expect(command(sim,a,{kind:'claim-return',item:'waiting',to:'stash'})).toContain('受け取りました');expect(a.pendingReturn).toEqual([]);expect(validRaidState(sim.state)).toBe(true);
 });
 it('keeps a disconnected pending owner out of a later raid and forbids claims while that room’s raid is active',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('waiting')];sim.disconnect(a.actor.id);command(sim,b,{kind:'ready'});command(sim,b,{kind:'start'});
  expect(sim.state.phase).toBe('raid');expect(a.actor.status).toBe('lobby');expect(a.pendingReturn).toEqual([item('waiting')]);expect(validRaidState(sim.state)).toBe(true);
  sim.join(a.key,'A');const before=assets(sim,a);command(sim,a,{kind:'claim-return',item:'waiting',to:'stash'});expect(assets(sim,a)).toEqual(before);
 });
 it('checks pending ownership when allocating supply IDs for another player',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;b.pendingReturn=[item('r0-i1')];a.gold=100;
  const before=assets(sim,a);expect(command(sim,a,{kind:'buy-supply',supply:'potion'})).toContain('重複');expect(assets(sim,a)).toEqual(before);expect(b.pendingReturn).toHaveLength(1);
 });
});

describe('pending-return protocol and durable validation',()=>{
 it('accepts legacy missing batches as empty and preserves old banked items through restart',()=>{
  const {sim,a}=setup();delete a.pendingReturn;place(a.stash,item('old-bank'),STASH_HEIGHT);expect(validRaidState(sim.state)).toBe(true);
  const server=new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state});
  expect(server.sim.snapshot(a.actor.id).pendingReturn).toEqual([]);expect(server.sim.state.profiles[0].stash).toEqual(a.stash);
  expect(command(server.sim,server.sim.state.profiles[0],{kind:'claim-return',item:'missing',to:'stash'})).toContain('帰還品がない');
 });
 it.each([
  ['null',null],['object',{}],['primitive member',[3]],['missing dimensions',[{id:'bad'}]],
  ['unknown item after valid item',[item('valid'),{...item('bad'),kind:'unknown'}]],['null after valid item',[item('valid'),null]],
  ['unfound',[item('unfound','ore',1,false)]],['overlap',[item('one'),item('two')]],
  ['duplicate local ID',[item('same'),{...item('same'),x:1}]],['outside bag height',[{...item('high'),y:5}]],
  ['outside bag width',[{...item('wide'),x:10}]],['oversized batch',packed('huge-',STASH_HEIGHT)],
  ['bad quantity',[item('quantity','ore',11)]],['bad quality',[{...item('quality'),quality:8}]],
 ] as const)('rejects corrupt pending data: %s',(_name,pending)=>{
  const {sim,a}=setup();Object.assign(a,{pendingReturn:pending});expect(()=>validRaidState(sim.state)).not.toThrow();expect(validRaidState(sim.state)).toBe(false);
  expect(()=>new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state})).toThrow('refusing reset');
 });
 it.each(['stash','bag','other-pending','other-stash','enemy','container'] as const)('rejects a pending UUID duplicated in %s',target=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('duplicate')];
  if(target==='stash')a.stash=[item('duplicate')];else if(target==='bag')a.actor.bag=[item('duplicate')];
  else if(target==='other-pending')b.pendingReturn=[item('duplicate')];else if(target==='other-stash')b.stash=[item('duplicate')];
  else if(target==='enemy')sim.state.enemies=[{...structuredClone(b.actor),id:'enemy',bag:[item('duplicate')],home:{x:0,y:0,z:0},alert:0,lootClaimed:false}];
  else sim.state.containers=[{id:'box',name:'Box',position:{x:0,y:0,z:0},items:[item('duplicate')],opened:false,locked:false,kind:'chest'}];
  expect(validRaidState(sim.state)).toBe(false);
 });
 it('rejects a disconnected owner’s future return ID before another player can start and mint the same ID',()=>{
  const {sim,a}=setup(),b=sim.join('b'.repeat(64),'B')!;a.pendingReturn=[item('r1-i1')];sim.disconnect(a.actor.id);command(sim,b,{kind:'ready'});
  expect(sim.state.raid).toBe(0);expect(sim.state.serial).toBe(0);expect(a.actor.connected).toBe(false);expect(b.actor.ready).toBe(true);
  expect(validRaidState(sim.state)).toBe(false);expect(()=>new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state})).toThrow('refusing reset');
 });
 it.each(['stash','bag','pending','enemy','container'] as const)('rejects future generated IDs and serials beyond the saved counter in %s',target=>{
  for(const id of ['r3-i1','r2-i11','r1-i11','r999999999999999999999-i1','r1-i999999999999999999999']){
   const {sim,a}=setup();sim.state.raid=2;sim.state.serial=10;
   if(target==='stash')a.stash=[item(id)];else if(target==='bag')a.actor.bag=[item(id)];else if(target==='pending')a.pendingReturn=[item(id)];
   else if(target==='enemy')sim.state.enemies=[{...structuredClone(a.actor),id:'enemy',bag:[item(id)],home:{x:0,y:0,z:0},alert:0,lootClaimed:false}];
   else sim.state.containers=[{id:'box',name:'Box',position:{x:0,y:0,z:0},items:[item(id)],opened:false,locked:false,kind:'chest'}];
   expect(validRaidState(sim.state),`${target}: ${id}`).toBe(false);
  }
 });
 it('accepts issued current and older generated IDs plus arbitrary fixture IDs',()=>{
  const {sim,a}=setup();sim.state.raid=2;sim.state.serial=10;a.pendingReturn=[];
  for(const id of ['r2-i10','r1-i9','r0-i1','fixture-id'])place(a.pendingReturn,item(id));
  expect(validRaidState(sim.state)).toBe(true);expect(()=>new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state})).not.toThrow();
 });
 it.each([['array',['ore']],['object',{toString:'ore'}]] as const)('rejects non-string item kinds at inventory, durable-save and client snapshot boundaries: %s',(_label,kind)=>{
  const invalid=[{...item('malformed-kind'),kind}],{sim,a}=setup();Object.assign(a,{pendingReturn:invalid});
  expect(()=>validInventory(invalid)).not.toThrow();expect(validInventory(invalid)).toBe(false);
  expect(()=>validRaidState(sim.state)).not.toThrow();expect(validRaidState(sim.state)).toBe(false);
  expect(()=>new DungeonServer({save:async()=>{}},()=>1000,{version:1,savedAt:1000,state:sim.state})).toThrow('refusing reset');
  expect(()=>isSnapshot(sim.snapshot(a.actor.id))).not.toThrow();expect(isSnapshot(sim.snapshot(a.actor.id))).toBe(false);
 });
 it('rejects impossible live or ready pending batches instead of allowing a second extraction to replace them',()=>{
  for(const flag of ['ready','alive']){const {sim,a}=setup();a.pendingReturn=[item('waiting')];if(flag==='ready')a.actor.ready=true;else a.actor.status='alive';expect(validRaidState(sim.state)).toBe(false);}
 });
 it('accepts only bounded owner-scoped claims with an explicit bag or stash destination',()=>{
  for(const to of ['bag','stash'])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action:{kind:'claim-return',item:'waiting',to}}))).not.toBeNull();
  for(const action of [{kind:'claim-return',item:'waiting'},{kind:'claim-return',item:'waiting',to:'pendingReturn'},{kind:'claim-return',item:'waiting',to:'stash',owner:'p2'},{kind:'claim-return',item:'waiting',to:'stash',count:100},{kind:'claim-return',item:'x'.repeat(97),to:'stash'}])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action}))).toBeNull();
 });
});

const hello=()=>JSON.stringify({type:'hello',protocol:1,key:'a'.repeat(64),name:'A'});
const packet=(sequence:number,action:Action)=>JSON.stringify({type:'action',sequence,action});
const port=()=>{const messages:string[]=[],closed:number[]=[];return {messages,closed,send:(text:string)=>messages.push(text),close:(code:number)=>closed.push(code)};};
describe('save-before-ack pending ownership',()=>{
 it('persists a full-stash extraction before broadcasting and restores the batch without spending another exit slot',async()=>{
  const {sim,a}=raiding();a.stash=packed('full-',STASH_HEIGHT);command(sim,a,{kind:'interact',target:'exit-west'});const carried=structuredClone(a.actor.bag);
  let now=1000,saved:DungeonCheckpoint={version:1,savedAt:1000,state:structuredClone(sim.state)};const order:string[]=[];
  const server=new DungeonServer({save:async c=>{saved=structuredClone(c);order.push('save');}},()=>now,saved),p=port();server.connect('a',{...p,send:text=>{order.push('send');p.send(text);}});await server.receive('a',hello());order.length=0;p.messages.length=0;
  now=5100;await server.tick();expect(order[0]).toBe('save');expect(saved.state.profiles[0].pendingReturn).toEqual(carried.map(i=>({...i,found:true})));expect(saved.state.exits[0].remaining).toBe(1);
  expect(JSON.parse(p.messages.at(-1)!).snapshot.pendingReturn).toEqual(saved.state.profiles[0].pendingReturn);expect(validRaidState(saved.state)).toBe(true);
  const restored=new DungeonServer({save:async()=>{}},()=>now,JSON.parse(JSON.stringify(saved)));await restored.tick();expect(restored.sim.state.profiles[0].pendingReturn).toEqual(saved.state.profiles[0].pendingReturn);expect(restored.sim.state.exits[0].remaining).toBe(1);
 });
 it('serializes duplicate claims, saves once-owned state before notice, and rejects old and fresh UUID replays after restart',async()=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting','ore',10)];let saved:DungeonCheckpoint={version:1,savedAt:1000,state:structuredClone(sim.state)};const order:string[]=[];
  const server=new DungeonServer({save:async c=>{saved=structuredClone(c);order.push('save');}},()=>1000,saved),p=port();server.connect('a',{...p,send:text=>{order.push('send');p.send(text);}});await server.receive('a',hello());order.length=0;
  await Promise.all([server.receive('a',packet(1,{kind:'claim-return',item:'waiting',to:'stash'})),server.receive('a',packet(1,{kind:'claim-return',item:'waiting',to:'bag'}))]);
  expect(order[0]).toBe('save');expect(saved.state.profiles[0].pendingReturn).toEqual([]);expect(saved.state.profiles[0].stash).toEqual([item('waiting','ore',10)]);expect(saved.state.profiles[0].actor.bag).toEqual([]);
  const restored=new DungeonServer({save:async()=>{}},()=>1000,JSON.parse(JSON.stringify(saved))),again=port();restored.connect('again',again);await restored.receive('again',hello());
  await restored.receive('again',packet(1,{kind:'claim-return',item:'waiting',to:'bag'}));await restored.receive('again',packet(2,{kind:'claim-return',item:'waiting',to:'bag'}));
  expect(restored.sim.state.profiles[0].stash).toEqual(saved.state.profiles[0].stash);expect(restored.sim.state.profiles[0].actor.bag).toEqual([]);expect(validRaidState(restored.sim.state)).toBe(true);
 });
 it('never acknowledges a failed claim save, freezes later queued work, and permits exactly one retry from the last checkpoint',async()=>{
  const {sim,a}=setup();a.pendingReturn=[item('waiting','ore',10)];let fail=false,saved:DungeonCheckpoint={version:1,savedAt:1000,state:structuredClone(sim.state)};
  const server=new DungeonServer({save:async c=>{if(fail)throw Error('storage unavailable');saved=structuredClone(c);}},()=>1000,saved),p=port();server.connect('a',p);await server.receive('a',hello());p.messages.length=0;fail=true;
  await Promise.all([server.receive('a',packet(1,{kind:'claim-return',item:'waiting',to:'stash'})),server.receive('a',packet(2,{kind:'claim-return',item:'waiting',to:'bag'}))]);
  expect(p.messages).toEqual([]);expect(p.closed).toContain(1011);expect(server.sim.state.profiles[0].lastAction).toBe(1);expect(saved.state.profiles[0].pendingReturn).toEqual([item('waiting','ore',10)]);expect(saved.state.profiles[0].stash).toEqual([]);
  const restored=new DungeonServer({save:async()=>{}},()=>1000,saved),again=port();restored.connect('again',again);await restored.receive('again',hello());await restored.receive('again',packet(1,{kind:'claim-return',item:'waiting',to:'stash'}));await restored.receive('again',packet(1,{kind:'claim-return',item:'waiting',to:'bag'}));
  expect(restored.sim.state.profiles[0].pendingReturn).toEqual([]);expect(restored.sim.state.profiles[0].stash).toEqual([item('waiting','ore',10)]);expect(restored.sim.state.profiles[0].actor.bag).toEqual([]);
 });
 it('does not publish an extraction when its save fails and can safely finish it once from the earlier live checkpoint',async()=>{
  const {sim,a}=raiding();a.stash=packed('full-',STASH_HEIGHT);command(sim,a,{kind:'interact',target:'exit-west'});const carried=structuredClone(a.actor.bag);
  let now=1000,fail=false,saved:DungeonCheckpoint={version:1,savedAt:1000,state:structuredClone(sim.state)};
  const server=new DungeonServer({save:async c=>{if(fail)throw Error('storage unavailable');saved=structuredClone(c);}},()=>now,saved),p=port();server.connect('a',p);await server.receive('a',hello());p.messages.length=0;fail=true;now=5100;await server.tick();
  expect(p.messages).toEqual([]);expect(p.closed).toContain(1011);expect(saved.state.profiles[0].actor.status).toBe('alive');expect(saved.state.profiles[0].actor.bag).toEqual(carried);expect(saved.state.exits[0].remaining).toBe(2);
  const restored=new DungeonServer({save:async c=>{saved=structuredClone(c);}},()=>now,saved);await restored.tick();expect(saved.state.profiles[0].actor.status).toBe('extracted');expect(saved.state.profiles[0].pendingReturn).toEqual(carried.map(i=>({...i,found:true})));expect(saved.state.profiles[0].actor.bag).toEqual([]);expect(saved.state.exits[0].remaining).toBe(1);expect(validRaidState(saved.state)).toBe(true);
 });
});
