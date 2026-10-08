import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {DungeonServer,type DungeonCheckpoint} from '../../src/dungeon/server';
import {validRaidState} from '../../src/dungeon/protocol';
import {activeRavagerSkill,ravagerSkillReadyIn} from '../../src/dungeon/ravager-training';
import type {Action} from '../../src/dungeon/types';
const hello=(key='a')=>JSON.stringify({type:'hello',protocol:1,key:key.repeat(64),name:key.toUpperCase()});
const packet=(sequence:number,action:Action)=>JSON.stringify({type:'action',sequence,action});
const port=()=>{const messages:string[]=[],closed:number[]=[];return {messages,closed,send:(text:string)=>messages.push(text),close:(code:number)=>closed.push(code)};};
const checkpoint=(sim:DungeonSimulation):DungeonCheckpoint=>({version:1,savedAt:1000,state:structuredClone(sim.state)});
const configure:Action={kind:'configure-ravager-training',skill:'frenzy',perk:'laststand'};
function fixture(action:Action){const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'A')!;sim.command(p.actor.id,1,{kind:'class',classId:'ravager'});if(action.kind==='skill'){sim.command(p.actor.id,2,configure);sim.command(p.actor.id,3,{kind:'ready'});sim.command(p.actor.id,4,{kind:'start'});sim.state.enemies=[];}return sim;}

describe('durable Ravager training actions',()=>{
 it.each([configure,{kind:'skill'} as Action])('persists %j before notice and snapshot ACK',async action=>{
  let saved=checkpoint(fixture(action)),hold=false,release!:()=>void,entered!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;}),saving=new Promise<void>(resolve=>{entered=resolve;});
  const server=new DungeonServer({save:async value=>{if(hold){entered();await waiting;}saved=structuredClone(value);}},()=>1000,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());socket.messages.length=0;const before=structuredClone(saved);hold=true;
  const operation=server.receive('a',packet(10,action));await saving;expect(socket.messages).toEqual([]);expect(saved).toEqual(before);release();await operation;
  expect(socket.messages.map(value=>JSON.parse(value).type)).toEqual(['notice','snapshot']);expect(saved.state.profiles[0].lastAction).toBe(10);expect(validRaidState(saved.state)).toBe(true);const actor=JSON.parse(socket.messages[1]).snapshot.actors[0];expect(actor.ravagerTraining).toEqual(saved.state.profiles[0].actor.ravagerTraining);expect(actor.ravagerSkillState).toEqual(saved.state.profiles[0].actor.ravagerSkillState);
 });
 it.each([configure,{kind:'skill'} as Action])('fails closed without acknowledging %j and retries safely from committed save',async action=>{
  let saved=checkpoint(fixture(action)),fail=false;
  const server=new DungeonServer({save:async value=>{if(fail)throw Error('storage failure');saved=structuredClone(value);}},()=>1000,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());socket.messages.length=0;const before=structuredClone(saved);fail=true;await server.receive('a',packet(10,action));expect(socket.messages).toEqual([]);expect(socket.closed).toContain(1011);expect(saved).toEqual(before);
  const blocked=port();server.connect('blocked',blocked);expect(blocked.closed).toContain(1013);
  const restored=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000,JSON.parse(JSON.stringify(saved))),again=port();restored.connect('again',again);await restored.receive('again',hello());expect(restored.sim.state.profiles[0].actor.ravagerSkillState).toEqual(before.state.profiles[0].actor.ravagerSkillState);await restored.receive('again',packet(10,action));const committed=structuredClone(saved);await restored.receive('again',packet(10,action));expect(saved).toEqual(committed);expect(validRaidState(saved.state)).toBe(true);
 });
 it('retains exact selection and cooldown across serialized duplicate activations, reconnect and server restart',async()=>{
  let saved=checkpoint(fixture({kind:'skill'})),now=1000;const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>now,saved),socket=port();server.connect('a',socket);await server.receive('a',hello());await Promise.all([server.receive('a',packet(10,{kind:'skill'})),server.receive('a',packet(10,{kind:'skill'})),server.receive('a',packet(11,{kind:'skill'}))]);expect(saved.state.profiles[0].actor.ravagerSkillState).toEqual({skill:'frenzy',activeUntil:5,readyAt:18});await server.disconnect('a');now+=1000;
  const restored=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>now,JSON.parse(JSON.stringify(saved))),again=port();restored.connect('again',again);await restored.receive('again',hello());const a=restored.sim.state.profiles[0].actor;expect(a.ravagerTraining).toEqual({skill:'frenzy',perk:'laststand'});expect(activeRavagerSkill(a,restored.sim.state.elapsed)).toBe('frenzy');expect(ravagerSkillReadyIn(a,restored.sim.state.elapsed)).toBeCloseTo(17);expect(a.ravagerSkillState).toEqual({skill:'frenzy',activeUntil:5,readyAt:18});await restored.receive('again',packet(12,{kind:'skill'}));expect(a.ravagerSkillState?.readyAt).toBe(18);now+=18000;await restored.tick();expect(activeRavagerSkill(a,restored.sim.state.elapsed)).toBeNull();expect(ravagerSkillReadyIn(a,restored.sim.state.elapsed)).toBe(0);await restored.receive('again',packet(13,{kind:'skill'}));expect(a.ravagerSkillState!.readyAt).toBeCloseTo(37);expect(validRaidState(saved.state)).toBe(true);
 });
 it('keeps another player untouched and rejects attempts to name another actor',async()=>{
  let saved: DungeonCheckpoint|undefined;const server=new DungeonServer({save:async value=>{saved=structuredClone(value);}},()=>1000),a=port(),b=port();server.connect('a',a);server.connect('b',b);await server.receive('a',hello());await server.receive('b',hello('b'));await server.receive('a',packet(1,{kind:'class',classId:'ravager'}));await server.receive('a',packet(2,configure));expect(saved!.state.profiles[0].actor.ravagerTraining?.skill).toBe('frenzy');expect(saved!.state.profiles[1].actor.ravagerTraining).toBeUndefined();await server.receive('b',JSON.stringify({type:'action',sequence:1,action:{...configure,actor:'p1'}}));expect(b.closed).toContain(1008);expect(saved!.state.profiles[1].actor.ravagerTraining).toBeUndefined();
 });
 it('refuses corrupt optional durable fields instead of resetting a profile',()=>{for(const patch of [{ravagerTraining:null},{ravagerSkillState:{skill:'frenzy',activeUntil:5,readyAt:Infinity}},{ravagerSkillState:{skill:'frenzy',activeUntil:6,readyAt:19}},{ravagerTraining:{skill:null,perk:null},ravagerSkillState:{skill:'frenzy',activeUntil:5,readyAt:18}},{classId:'bastion',ravagerTraining:{skill:'frenzy',perk:null},ravagerSkillState:{skill:'frenzy',activeUntil:5,readyAt:18}}]){const saved=checkpoint(fixture({kind:'skill'}));Object.assign(saved.state.profiles[0].actor,patch);expect(()=>new DungeonServer({save:async()=>{}},()=>1000,saved)).toThrow('refusing reset');}});
});
