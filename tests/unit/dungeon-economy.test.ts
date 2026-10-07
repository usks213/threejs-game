import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {DungeonServer,type DungeonCheckpoint} from '../../src/dungeon/server';
import {parsePacket,validRaidState} from '../../src/dungeon/protocol';
import {isSnapshot} from '../../src/dungeon/client';
import {freshSupplyStock,loadoutWeapon,preparationIssue,saleValue} from '../../src/dungeon/economy';
import {place,STASH_HEIGHT} from '../../src/dungeon/inventory';
import type {Action,Item} from '../../src/dungeon/types';
const item=(id:string,kind:Item['kind']='relic',count=1,quality=1,found=true):Item=>({id,kind,count,quality,found,x:0,y:0,rotated:false});
function setup(){const sim=new DungeonSimulation(),a=sim.join('a'.repeat(64),'A')!,b=sim.join('b'.repeat(64),'B')!;const action=(who:typeof a,command:Action)=>sim.command(who.actor.id,who.lastAction+1,command);return {sim,a,b,action};}
const assets=(s:ReturnType<typeof setup>)=>structuredClone({gold:s.a.gold,bag:s.a.actor.bag,stash:s.a.stash,stock:s.sim.state.shop,serial:s.sim.state.serial,receipt:s.a.receipt});
describe('room-local treasure and resupply economy',()=>{
 it('sells only extracted treasure or ore from the owner stash, with server prices and quantity',()=>{
  const s=setup();place(s.a.stash,item('treasure'),STASH_HEIGHT);place(s.a.stash,item('ore','ore',3,2),STASH_HEIGHT);
  expect(s.action(s.a,{kind:'sell-treasure',item:'treasure'})).toContain('+90');
  expect(s.a.gold).toBe(90);expect(s.a.stash.map(i=>i.id)).toEqual(['ore']);
  expect(s.action(s.a,{kind:'sell-treasure',item:'ore'})).toContain('+63');expect(s.a.gold).toBe(153);
  expect(s.a.receipt).toHaveLength(2);expect(validRaidState(s.sim.state)).toBe(true);
 });
 it('rejects 100 replayed sales and fresh repeats without adding coins',()=>{
  const s=setup();place(s.a.stash,item('treasure'),STASH_HEIGHT);s.action(s.a,{kind:'sell-treasure',item:'treasure'});
  for(let i=0;i<100;i++)s.sim.command(s.a.actor.id,1,{kind:'sell-treasure',item:'treasure'});
  s.action(s.a,{kind:'sell-treasure',item:'treasure'});expect(s.a.gold).toBe(90);expect(s.a.receipt).toHaveLength(1);
 });
 it('never buys back free equipment, purchased healing or unextracted loot',()=>{
  for(const value of [item('x','sword'),item('x','shield'),item('x','potion'),item('x','bandage'),item('x','key'),item('x','relic',1,1,false)]){
   const s=setup();place(s.a.stash,value,STASH_HEIGHT);const before=assets(s);
   s.action(s.a,{kind:'sell-treasure',item:'x'});expect(assets(s)).toEqual(before);expect(saleValue(value)).toBe(0);
  }
 });
 it('does not sell another explorer’s stash or the caller’s unbanked bag',()=>{
  const s=setup();place(s.b.stash,item('other'),STASH_HEIGHT);place(s.a.actor.bag,item('carried'));
  for(const id of ['other','carried'])s.action(s.a,{kind:'sell-treasure',item:id});
  expect(s.a.gold).toBe(0);expect(s.a.actor.bag).toHaveLength(1);expect(s.b.stash).toHaveLength(1);
 });
 it('buys one uniquely identified supply into stash and conserves exact coins and shared stock',()=>{
  const s=setup();s.a.gold=30;
  s.action(s.a,{kind:'buy-supply',supply:'potion'});s.action(s.a,{kind:'buy-supply',supply:'bandage'});
  expect(s.a.gold).toBe(12);expect(s.a.stash.map(i=>[i.kind,i.count,i.found])).toEqual([['potion',1,false],['bandage',1,false]]);
  expect(new Set(s.a.stash.map(i=>i.id)).size).toBe(2);expect(s.sim.state.shop).toEqual({potion:5,bandage:9});
  expect(s.a.actor.bag).toHaveLength(0);expect(s.a.receipt).toHaveLength(2);expect(validRaidState(s.sim.state)).toBe(true);
 });
 it('rejects a replayed purchase rather than charging twice',()=>{
  const s=setup();s.a.gold=24;s.action(s.a,{kind:'buy-supply',supply:'potion'});const before=assets(s);
  for(let i=0;i<100;i++)s.sim.command(s.a.actor.id,1,{kind:'buy-supply',supply:'potion'});expect(assets(s)).toEqual(before);
 });
 it('insufficient money, exhausted stock and a full stash are atomic refusals',()=>{
  for(const reason of ['money','stock','space']){
   const s=setup();s.a.gold=reason==='money'?11:100;
   if(reason==='stock')s.sim.state.shop!.potion=0;
   if(reason==='space')for(let i=0;i<100;i++)expect(place(s.a.stash,item('full'+i,'ore'),STASH_HEIGHT)).toBe(true);
   const before=assets(s);s.action(s.a,{kind:'buy-supply',supply:'potion'});expect(assets(s)).toEqual(before);
  }
 });
 it('ready, living raids and unreturned results cannot trade',()=>{
  for(const status of ['ready','raid','dead','extracted']){
   const s=setup();s.a.gold=100;place(s.a.stash,item('treasure'),STASH_HEIGHT);
   if(status==='ready')s.a.actor.ready=true;else if(status==='raid'){s.sim.state.phase='raid';s.a.actor.status='alive';}else{s.sim.state.phase='finished';s.a.actor.status=status as 'dead'|'extracted';}
   const before=assets(s);s.action(s.a,{kind:'buy-supply',supply:'potion'});s.action(s.a,{kind:'sell-treasure',item:'treasure'});expect(assets(s)).toEqual(before);
  }
 });
 it('refuses overflow or a damaged item serial without mutating ownership',()=>{
  const s=setup();s.a.gold=1e9;place(s.a.stash,item('treasure'),STASH_HEIGHT);let before=assets(s);
  s.action(s.a,{kind:'sell-treasure',item:'treasure'});expect(assets(s)).toEqual(before);
  s.a.gold=100;place(s.b.stash,item('r0-i1','potion',1,0,false),STASH_HEIGHT);before=assets(s);
  s.action(s.a,{kind:'buy-supply',supply:'potion'});expect(assets(s)).toEqual(before);
 });
 it('restocks only on a new raid and never on reconnect or buying the last supply',()=>{
  const s=setup();s.a.gold=72;for(let i=0;i<6;i++)s.action(s.a,{kind:'buy-supply',supply:'potion'});
  expect(s.sim.state.shop!.potion).toBe(0);s.sim.join('a'.repeat(64),'A');expect(s.sim.state.shop!.potion).toBe(0);
  s.action(s.a,{kind:'ready'});s.action(s.b,{kind:'ready'});s.action(s.a,{kind:'start'});expect(s.sim.state.shop).toEqual(freshSupplyStock());
  expect(s.a.stash).toHaveLength(6);expect(s.a.gold).toBe(0);
 });
 it('preserves legacy stock-less saves and fails closed on malformed new stock',()=>{
  const s=setup();delete s.sim.state.shop;place(s.a.stash,item('legacy'),STASH_HEIGHT);s.a.gold=24;
  expect(validRaidState(s.sim.state)).toBe(true);const restored=new DungeonSimulation(structuredClone(s.sim.state));
  expect(restored.snapshot(s.a.actor.id).shop).toEqual(freshSupplyStock());expect(restored.profile(s.a.actor.id)!.stash[0].id).toBe('legacy');
  for(const shop of [null,{}, {potion:-1,bandage:10},{potion:7,bandage:10},{potion:6,bandage:NaN},{potion:6,bandage:10,extra:1}])expect(validRaidState({...s.sim.state,shop})).toBe(false);
 });
 it('rejects spoofed prices, quantities, recipients and unknown stock at the packet boundary',()=>{
  for(const action of [{kind:'buy-supply',supply:'potion',price:0},{kind:'buy-supply',supply:'potion',count:100},{kind:'buy-supply',supply:'relic'},{kind:'sell-treasure',item:'x',owner:'p2'},{kind:'sell-treasure',item:'x',price:999}])expect(parsePacket(JSON.stringify({type:'action',sequence:1,action}))).toBeNull();
  expect(parsePacket(JSON.stringify({type:'action',sequence:1,action:{kind:'buy-supply',supply:'bandage'}}))).not.toBeNull();
 });
 it('keeps money, receipts and bought inventory private while exposing shared stock',()=>{
  const s=setup();s.a.gold=24;s.action(s.a,{kind:'buy-supply',supply:'potion'});const a=s.sim.snapshot(s.a.actor.id),b=s.sim.snapshot(s.b.actor.id);
  expect(a.gold).toBe(12);expect(a.trades).toHaveLength(1);expect(b.gold).toBe(0);expect(b.trades).toEqual([]);expect(b.stash).toEqual([]);expect(b.shop).toEqual(a.shop);expect(isSnapshot(a)).toBe(true);
  expect(isSnapshot({...a,shop:{potion:999,bandage:1}})).toBe(false);expect(isSnapshot({...a,trades:['x'.repeat(97)]})).toBe(false);
 });
 it('bounds saved receipts and the rendered owner journal without dropping coins or items',()=>{
  const s=setup();s.a.receipt=Array.from({length:128},(_,i)=>`old${i}`);s.a.gold=24;s.action(s.a,{kind:'buy-supply',supply:'potion'});
  expect(s.a.receipt).toHaveLength(128);expect(s.a.receipt[0]).toBe('old1');expect(s.sim.snapshot(s.a.actor.id).trades).toHaveLength(6);expect(validRaidState(s.sim.state)).toBe(true);
 });
});
describe('real prepared loadouts',()=>{
 it('keeps empty-bag free kits, blocks medicine-only bags, and uses actual carried weapons',()=>{
  const s=setup();expect(preparationIssue([])).toBeNull();expect(loadoutWeapon([],'keeper')).toBe('sword');
  place(s.a.actor.bag,item('medicine','potion',1,0,false));expect(s.action(s.a,{kind:'ready'})).toContain('武器');expect(s.a.actor.ready).toBe(false);
  s.a.actor.ready=s.b.actor.ready=true;expect(s.action(s.a,{kind:'start'})).toContain('武器');expect(s.sim.state.phase).toBe('lobby');
  s.a.actor.ready=false;place(s.a.actor.bag,item('owned','greatsword',1,0,false));s.action(s.a,{kind:'ready'});s.action(s.a,{kind:'start'});
  expect(s.a.actor.weapon).toBe('greatsword');expect(s.a.actor.bag.map(i=>i.id)).toEqual(['medicine','owned']);expect(validRaidState(s.sim.state)).toBe(true);
 });
});

describe('serialized and durable merchant transactions',()=>{
 const hello=(key:string)=>JSON.stringify({type:'hello',protocol:1,key:key.repeat(64),name:key.toUpperCase()});
 const packet=(sequence:number,action:Action)=>JSON.stringify({type:'action',sequence,action});
 const port=()=>{const messages:string[]=[],closed:number[]=[];return {messages,closed,send:(text:string)=>messages.push(text),close:(code:number)=>closed.push(code)};};
 it('serializes competing purchases of the last shared supply without debt or duplicate IDs',async()=>{
  const s=setup();s.a.gold=s.b.gold=12;s.sim.state.shop!.potion=1;let saved:DungeonCheckpoint|undefined;
  const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,{version:1,savedAt:1000,state:s.sim.state});
  const a=port(),b=port();server.connect('a',a);server.connect('b',b);await server.receive('a',hello('a'));await server.receive('b',hello('b'));
  await Promise.all([server.receive('a',packet(1,{kind:'buy-supply',supply:'potion'})),server.receive('b',packet(1,{kind:'buy-supply',supply:'potion'}))]);
  const profiles=server.sim.state.profiles;expect(profiles.map(p=>p.gold)).toEqual([0,12]);expect(profiles.flatMap(p=>p.stash)).toHaveLength(1);expect(server.sim.state.shop!.potion).toBe(0);
  expect(a.messages.some(value=>value.includes('届けました'))).toBe(true);expect(b.messages.some(value=>value.includes('売り切れ'))).toBe(true);expect(validRaidState(saved!.state)).toBe(true);
 });
 it('restores a committed sale/purchase and rejects both replayed operations after reconnect',async()=>{
  const s=setup();place(s.a.stash,item('earned'),STASH_HEIGHT);let saved:DungeonCheckpoint={version:1,savedAt:1000,state:s.sim.state};
  const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,saved),a=port();server.connect('a',a);await server.receive('a',hello('a'));
  await server.receive('a',packet(1,{kind:'sell-treasure',item:'earned'}));await server.receive('a',packet(2,{kind:'buy-supply',supply:'potion'}));
  const before=structuredClone(saved.state.profiles[0]);const restored=new DungeonServer({save:async()=>{}},()=>1000,JSON.parse(JSON.stringify(saved))),again=port();restored.connect('again',again);await restored.receive('again',hello('a'));
  await restored.receive('again',packet(1,{kind:'sell-treasure',item:'earned'}));await restored.receive('again',packet(2,{kind:'buy-supply',supply:'potion'}));
  const after=restored.sim.state.profiles[0];expect(after.gold).toBe(78);expect(after.stash).toEqual(before.stash);expect(after.receipt).toEqual(before.receipt);expect(restored.sim.state.shop).toEqual(saved.state.shop);
 });
 it('never acknowledges a trade when durable saving fails, preserving the last saved balance on restart',async()=>{
  const s=setup();s.a.gold=24;let fail=false,saved:DungeonCheckpoint={version:1,savedAt:1000,state:structuredClone(s.sim.state)};
  const server=new DungeonServer({save:async value=>{if(fail)throw Error('storage unavailable');saved=structuredClone(value);}},()=>1000,saved),a=port();server.connect('a',a);await server.receive('a',hello('a'));a.messages.length=0;fail=true;
  await server.receive('a',packet(1,{kind:'buy-supply',supply:'potion'}));expect(a.messages).toEqual([]);expect(a.closed).toContain(1011);
  const restored=new DungeonServer({save:async()=>{}},()=>1000,saved);expect(restored.sim.state.profiles[0].gold).toBe(24);expect(restored.sim.state.profiles[0].stash).toEqual([]);expect(restored.sim.state.shop).toEqual(freshSupplyStock());
 });
});

it('reports this raid’s returned items rather than counting older stash contents as new rewards',()=>{
 const s=setup();place(s.a.stash,item('old-stash'),STASH_HEIGHT);s.action(s.a,{kind:'ready'});s.action(s.b,{kind:'ready'});s.action(s.a,{kind:'start'});
 s.sim.state.enemies=[];s.sim.state.elapsed=46;s.a.actor.position={...s.sim.state.exits[0].position};const carried=s.a.actor.bag.length;
 s.action(s.a,{kind:'interact',target:'exit-west'});for(let i=0;i<81;i++)s.sim.step();
 expect(s.a.actor.status).toBe('extracted');expect(s.a.stash).toHaveLength(carried+1);expect(s.a.result).toBe(`帰還成功。${carried}品を倉庫へ保存`);
});
