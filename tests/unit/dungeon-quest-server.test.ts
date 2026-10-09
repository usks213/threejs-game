import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {DungeonServer,type DungeonCheckpoint} from '../../src/dungeon/server';
import {validRaidState} from '../../src/dungeon/protocol';
import type {Action,Item,Profile} from '../../src/dungeon/types';

const item=(id='ore'):Item=>({id,kind:'ore',count:5,found:true,quality:2,x:0,y:0,rotated:false});
const hello=(key='a')=>JSON.stringify({type:'hello',protocol:1,key:key.repeat(64),name:key.toUpperCase()});
const packet=(sequence:number,action:Action)=>JSON.stringify({type:'action',sequence,action});
const port=()=>{const messages:string[]=[],closed:number[]=[];return {messages,closed,send:(text:string)=>messages.push(text),close:(code:number)=>closed.push(code)};};
const checkpoint=(sim:DungeonSimulation):DungeonCheckpoint=>({version:1,savedAt:1000,state:structuredClone(sim.state)});
const assets=(p:Profile)=>structuredClone({quests:p.quests,gold:p.gold,stash:p.stash,bag:p.actor.bag,pending:p.pendingReturn,receipt:p.receipt,lastAction:p.lastAction});
function setup(){const sim=new DungeonSimulation(),a=sim.join('a'.repeat(64),'A')!;return {sim,a};}
function fixture(action:Action){const {sim,a}=setup();
 if(action.kind==='deliver-quest'){a.quests=[{id:'first-return',progress:1,claimed:true},{id:'ore-delivery',progress:0,claimed:false}];a.gold=20;a.stash=[item()];}
 if(action.kind==='claim-quest')a.quests=[{id:'first-return',progress:1,claimed:false}];
 return {sim,a};
}
const actions:Action[]=[{kind:'accept-quest',quest:'first-return'},{kind:'deliver-quest',quest:'ore-delivery',item:'ore'},{kind:'claim-quest',quest:'first-return'}];

describe('durable supplier quest transactions',()=>{
 it.each(actions)('persists %j before notice and snapshot acknowledgment',async action=>{
  const {sim}=fixture(action);let saved=checkpoint(sim),hold=false,release!:()=>void,entered!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;}),saving=new Promise<void>(resolve=>{entered=resolve;});
  const server=new DungeonServer({save:async value=>{if(hold){entered();await waiting;}saved=structuredClone(value);}},()=>1000,saved),a=port();
  server.connect('a',a);await server.receive('a',hello());a.messages.length=0;const before=assets(saved.state.profiles[0]);hold=true;
  const operation=server.receive('a',packet(1,action));await saving;expect(a.messages).toEqual([]);expect(assets(saved.state.profiles[0])).toEqual(before);
  release();await operation;expect(a.messages.map(value=>JSON.parse(value).type)).toEqual(['notice','snapshot']);expect(saved.state.profiles[0].lastAction).toBe(1);expect(validRaidState(saved.state)).toBe(true);
  const snapshot=JSON.parse(a.messages[1]).snapshot;expect(snapshot.quests).toEqual(saved.state.profiles[0].quests);expect(snapshot.gold).toBe(saved.state.profiles[0].gold);
 });
 it.each(actions)('freezes without acknowledging failed %j, then safely retries once after restart',async action=>{
  const {sim}=fixture(action);let saved=checkpoint(sim),fail=false;
  const server=new DungeonServer({save:async value=>{if(fail)throw Error('storage unavailable');saved=structuredClone(value);}},()=>1000,saved),a=port();
  server.connect('a',a);await server.receive('a',hello());a.messages.length=0;const before=assets(saved.state.profiles[0]);fail=true;
  await server.receive('a',packet(1,action));expect(a.messages).toEqual([]);expect(a.closed).toContain(1011);expect(assets(saved.state.profiles[0])).toEqual(before);
  const blocked=port();server.connect('blocked',blocked);expect(blocked.closed).toContain(1013);await server.receive('a',packet(2,action));expect(a.messages).toEqual([]);
  const restored=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,JSON.parse(JSON.stringify(saved))),again=port();
  restored.connect('again',again);await restored.receive('again',hello());expect(assets(restored.sim.state.profiles[0])).toEqual(before);
  await restored.receive('again',packet(1,action));const committed=assets(restored.sim.state.profiles[0]);await restored.receive('again',packet(1,action));expect(assets(restored.sim.state.profiles[0])).toEqual(committed);expect(validRaidState(saved.state)).toBe(true);
  if(action.kind==='claim-quest'){expect(committed.gold).toBe(20);expect(committed.receipt).toHaveLength(1);}
  if(action.kind==='deliver-quest'){expect(committed.gold).toBe(20);expect(committed.stash[0].count).toBe(3);expect(committed.quests![1].progress).toBe(2);}
 });
 it('preserves exact committed journals, coins and stack leftovers through reconnect and repeated claims',async()=>{
  const {sim,a}=setup();a.quests=[{id:'first-return',progress:1,claimed:false}];a.stash=[item()];let saved=checkpoint(sim);
  const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());
  const sequence:Action[]=[{kind:'claim-quest',quest:'first-return'},{kind:'accept-quest',quest:'ore-delivery'},{kind:'deliver-quest',quest:'ore-delivery',item:'ore'},{kind:'claim-quest',quest:'ore-delivery'}];
  for(let i=0;i<sequence.length;i++)await server.receive('a',packet(i+1,sequence[i]));
  expect(saved.state.profiles[0].gold).toBe(50);expect(saved.state.profiles[0].stash).toEqual([{...item(),count:3}]);expect(saved.state.profiles[0].receipt).toHaveLength(2);
  const before=assets(saved.state.profiles[0]),restored=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,JSON.parse(JSON.stringify(saved))),again=port();
  restored.connect('again',again);await restored.receive('again',hello());for(let i=0;i<sequence.length;i++)await restored.receive('again',packet(i+1,sequence[i]));expect(assets(restored.sim.state.profiles[0])).toEqual(before);
  await restored.receive('again',packet(5,{kind:'claim-quest',quest:'ore-delivery'}));expect(restored.sim.state.profiles[0].gold).toBe(50);expect(restored.sim.state.profiles[0].receipt).toHaveLength(2);expect(restored.sim.snapshot(a.actor.id).quests!.every(q=>q.claimed)).toBe(true);
 });
 it('serializes competing duplicate claims on one account and keeps the other account private',async()=>{
  const {sim,a}=setup();a.quests=[{id:'first-return',progress:1,claimed:false}];const b=sim.join('b'.repeat(64),'B')!;let saved=checkpoint(sim);
  const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,saved),one=port(),two=port();server.connect('one',one);server.connect('two',two);await server.receive('one',hello());await server.receive('two',hello('b'));one.messages.length=two.messages.length=0;
  await Promise.all([server.receive('one',packet(1,{kind:'claim-quest',quest:'first-return'})),server.receive('one',packet(2,{kind:'claim-quest',quest:'first-return'})),server.receive('two',packet(1,{kind:'claim-quest',quest:'first-return'}))]);
  expect(saved.state.profiles.map(p=>p.gold)).toEqual([20,0]);expect(saved.state.profiles.map(p=>p.receipt.length)).toEqual([1,0]);expect(saved.state.profiles[1].quests).toBeUndefined();
  for(const message of two.messages.map(value=>JSON.parse(value)).filter(value=>value.type==='snapshot')){expect(message.snapshot.you).toBe(b.actor.id);expect(message.snapshot.quests).toEqual([]);expect(message.snapshot.trades).toEqual([]);expect(message.snapshot.gold).toBe(0);}
 });
 it('persists extraction progress together with the returned inventory and gives no reward automatically',async()=>{
  const {sim,a}=setup();sim.command(a.actor.id,1,{kind:'accept-quest',quest:'first-return'});sim.command(a.actor.id,2,{kind:'ready'});sim.command(a.actor.id,3,{kind:'start'});
  sim.state.enemies=[];sim.state.elapsed=46;a.actor.position={...sim.state.exits[0].position};sim.command(a.actor.id,4,{kind:'interact',target:'exit-west'});a.actor.extract=3.95;let saved=checkpoint(sim),now=1000;
  const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>now,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());socket.messages.length=0;now+=100;await server.tick();
  const returned=saved.state.profiles[0];expect(returned.actor.status).toBe('extracted');expect(returned.quests).toEqual([{id:'first-return',progress:1,claimed:false}]);expect(returned.gold).toBe(0);expect(returned.receipt).toEqual([]);expect(returned.stash.length).toBeGreaterThan(0);expect(returned.actor.bag).toEqual([]);expect(validRaidState(saved.state)).toBe(true);
  const snapshot=JSON.parse(socket.messages.at(-1)!).snapshot;expect(snapshot.quests).toEqual(returned.quests);expect(snapshot.stash).toEqual(returned.stash);
 });
 it('does not expose or durably record extraction completion when its inventory/progress save fails',async()=>{
  const {sim,a}=setup();sim.command(a.actor.id,1,{kind:'accept-quest',quest:'first-return'});sim.command(a.actor.id,2,{kind:'ready'});sim.command(a.actor.id,3,{kind:'start'});
  sim.state.enemies=[];sim.state.elapsed=46;a.actor.position={...sim.state.exits[0].position};sim.command(a.actor.id,4,{kind:'interact',target:'exit-west'});a.actor.extract=3.95;let saved=checkpoint(sim),now=1000,fail=false;
  const server=new DungeonServer({save:async value=>{if(fail)throw Error('failed extraction commit');saved=structuredClone(value);}},()=>now,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());socket.messages.length=0;const before=assets(saved.state.profiles[0]);fail=true;now+=100;await server.tick();
  expect(socket.messages).toEqual([]);expect(socket.closed).toContain(1011);expect(assets(saved.state.profiles[0])).toEqual(before);
  const restored=new DungeonServer({save:async()=>{}},()=>now,saved);expect(restored.sim.state.profiles[0].actor.status).toBe('alive');expect(restored.sim.state.profiles[0].quests![0].progress).toBe(0);expect(restored.sim.state.profiles[0].actor.bag.length).toBeGreaterThan(0);
 });
});
