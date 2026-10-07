import {describe,it,expect} from 'vitest';
import {DungeonServer,type DungeonCheckpoint,type DungeonPort} from '../../src/dungeon/server';
const key='a'.repeat(64);
function port(){const messages:string[]=[],closed:{code:number;reason:string}[]=[];return {messages,closed,send:(text:string)=>messages.push(text),close:(code:number,reason:string)=>closed.push({code,reason})};}
const hello=(k=key)=>JSON.stringify({type:'hello',protocol:1,key:k,name:'探索者'});
describe('dungeon durable server',()=>{
 it('persists identities before sending state, and rejoining returns the same avatar',async()=>{let saved:DungeonCheckpoint|undefined;const order:string[]=[];const server=new DungeonServer({save:async c=>{saved=c;order.push('save');}},()=>1000),a=port();server.connect('first',{...a,send:text=>{order.push('send');a.send(text);}});await server.receive('first',hello());expect(order[0]).toBe('save');expect(a.messages.length).toBeGreaterThan(0);const actor=server.sim.state.profiles[0].actor.id;const restored=new DungeonServer({save:async()=>{}},()=>1000,saved),b=port();restored.connect('second',b);await restored.receive('second',hello());expect(restored.sim.state.profiles[0].actor.id).toBe(actor);expect(restored.sim.state.profiles).toHaveLength(1);expect(JSON.stringify(JSON.parse(b.messages[0]).snapshot)).not.toContain(key);});
 it('does not acknowledge or reveal uncommitted changes after storage fails',async()=>{const server=new DungeonServer({save:async()=>{throw new Error('full');}},()=>1000),a=port();server.connect('a',a);await server.receive('a',hello());expect(a.messages).toHaveLength(0);expect(a.closed[0].code).toBe(1011);await server.tick();expect(a.messages).toHaveLength(0);});
 it('rejects unknown protocols, unjoined inputs, bad messages and excessive frequency',async()=>{const server=new DungeonServer({save:async()=>{}},()=>1000),a=port();server.connect('a',a);await server.receive('a',JSON.stringify({type:'hello',protocol:0,key,name:'A'}));expect(a.closed[0].code).toBe(1002);const b=port();server.connect('b',b);await server.receive('b',JSON.stringify({type:'action',sequence:1,action:{kind:'start'}}));expect(b.closed[0].code).toBe(1008);const c=port();server.connect('c',c);await server.receive('c','x'.repeat(5000));expect(c.closed[0].code).toBe(1008);});
 it('keeps raid time moving without clients and makes expired raids fatal on process restore',async()=>{let time=1000,saved:DungeonCheckpoint|undefined;const server=new DungeonServer({save:async c=>{saved=c;}},()=>time),a=port();server.connect('a',a);await server.receive('a',hello());await server.receive('a',JSON.stringify({type:'action',sequence:1,action:{kind:'ready'}}));await server.receive('a',JSON.stringify({type:'action',sequence:2,action:{kind:'start'}}));await server.disconnect('a');time+=481000;const restored=new DungeonServer({save:async()=>{}},()=>time,saved);await restored.tick();expect(restored.sim.state.phase).toBe('finished');expect(restored.sim.state.profiles[0].actor.status).toBe('dead');});
 it('rejects corrupt stash instead of silently constructing a new profile',()=>{expect(()=>new DungeonServer({save:async()=>{}},Date.now,{version:1,savedAt:1,state:{version:999} as never})).toThrow('refusing reset');});
 it('replaces an old connection with the same private identity without exposing a second avatar',async()=>{const server=new DungeonServer({save:async()=>{}},()=>1000),a=port(),b=port();server.connect('a',a);await server.receive('a',hello());server.connect('b',b);await server.receive('b',hello());expect(a.closed.at(-1)?.code).toBe(4001);expect(server.sim.state.profiles).toHaveLength(1);});
});

 it('persists and restores legitimate downward arrows without treating velocity as position',async()=>{let time=1000,saved:DungeonCheckpoint|undefined;const server=new DungeonServer({save:async c=>{saved=c;}},()=>time),a=port();server.connect('a',a);await server.receive('a',hello());for(const [sequence,action] of [[1,{kind:'class',classId:'hunter'}],[2,{kind:'ready'}],[3,{kind:'start'}]] as const)await server.receive('a',JSON.stringify({type:'action',sequence,action}));await server.receive('a',JSON.stringify({type:'input',sequence:1,input:{x:0,z:0,yaw:0,pitch:-1.4,block:false,crouch:false}}));await server.receive('a',JSON.stringify({type:'action',sequence:4,action:{kind:'shoot'}}));for(let i=0;i<6;i++){time+=100;await server.tick();}expect(saved?.state.shots.length).toBeGreaterThan(0);expect(saved?.state.shots[0].velocity.y).toBeLessThan(-10);expect(()=>new DungeonServer({save:async()=>{}},()=>time,saved)).not.toThrow();});

 it('does not reinterpret existing falsy corrupt records as an empty room',()=>{for(const saved of [null,false,0,''])expect(()=>new DungeonServer({save:async()=>{}},Date.now,saved as never)).toThrow('refusing reset');});

 it('releases unjoined sockets after a bounded handshake period instead of reserving every room slot forever',async()=>{let now=1000;const server=new DungeonServer({save:async()=>{}},()=>now),ports=Array.from({length:8},()=>port());ports.forEach((p,i)=>server.connect(String(i),p));now+=11000;await server.tick();expect(ports.every(p=>p.closed[0]?.code===1008)).toBe(true);expect(server.active).toBe(false);const p=port();server.connect('real',p);await server.receive('real',hello());expect(server.sim.state.profiles).toHaveLength(1);expect(p.messages.length).toBeGreaterThan(0);});

 it('drops a broken socket without stopping another player or poisoning the room queue',async()=>{const server=new DungeonServer({save:async()=>{}},()=>1000),good=port();server.connect('bad',{send:()=>{throw new Error('closed');},close:()=>{throw new Error('already closed');}});await server.receive('bad',hello());server.connect('good',good);await server.receive('good',hello('b'.repeat(64)));expect(good.messages.length).toBeGreaterThan(0);expect(good.closed).toHaveLength(0);expect(server.sim.state.profiles[0].actor.connected).toBe(false);});

it('counts input arrival time rather than misclassifying a delayed persistence queue as flooding',async()=>{
 let now=0,blocked=false,release=()=>{},entered=()=>{};
 const waiting=new Promise<void>(resolve=>{release=resolve;}),saving=new Promise<void>(resolve=>{entered=resolve;});
 const server=new DungeonServer({save:async()=>{if(blocked){entered();await waiting;}}},()=>now),a=port();server.connect('a',a);await server.receive('a',hello());
 blocked=true;now=1000;const prepare=server.receive('a',JSON.stringify({type:'action',sequence:1,action:{kind:'ready'}}));await saving;
 const pending:Promise<void>[]=[];
 for(let i=1;i<=50;i++){now=1000+i*50;pending.push(server.receive('a',JSON.stringify({type:'input',sequence:i,input:{x:0,z:0,yaw:0,pitch:0,block:false,crouch:false}})));}
 blocked=false;release();await prepare;await Promise.all(pending);
 expect(a.closed).toEqual([]);expect(server.sim.state.profiles[0].actor.seq).toBe(50);expect(server.sim.state.profiles[0].actor.connected).toBe(true);
});
it('still rejects an actual same-time packet flood at the original budget after a slow save',async()=>{
 let now=0,blocked=false,release=()=>{},entered=()=>{};
 const waiting=new Promise<void>(resolve=>{release=resolve;}),saving=new Promise<void>(resolve=>{entered=resolve;});
 const server=new DungeonServer({save:async()=>{if(blocked){entered();await waiting;}}},()=>now),a=port();server.connect('a',a);await server.receive('a',hello());
 blocked=true;now=1000;const prepare=server.receive('a',JSON.stringify({type:'action',sequence:1,action:{kind:'ready'}}));await saving;
 const pending:Promise<void>[]=[];
 for(let i=1;i<=50;i++)pending.push(server.receive('a',JSON.stringify({type:'input',sequence:i,input:{x:0,z:0,yaw:0,pitch:0,block:false,crouch:false}})));
 now=4000;blocked=false;release();await prepare;await Promise.all(pending);
 expect(a.closed).toContainEqual({code:1008,reason:'送信が多すぎます'});expect(server.sim.state.profiles[0].actor.seq).toBe(39);expect(server.sim.state.profiles[0].actor.connected).toBe(false);
});

it.each([100,0])('uses arrival windows for queued actions and preserves the twelve-action limit (spacing %dms)',async spacing=>{
 let now=0,blocked=false,release=()=>{},entered=()=>{};
 const waiting=new Promise<void>(resolve=>{release=resolve;}),saving=new Promise<void>(resolve=>{entered=resolve;});
 const server=new DungeonServer({save:async()=>{if(blocked){entered();await waiting;}}},()=>now),a=port();server.connect('a',a);await server.receive('a',hello());
 blocked=true;now=1000;const prepare=server.receive('a',JSON.stringify({type:'action',sequence:1,action:{kind:'ready'}}));await saving;
 const pending:Promise<void>[]=[];
 for(let i=1;i<=15;i++){now=1000+i*spacing;pending.push(server.receive('a',JSON.stringify({type:'action',sequence:i+1,action:{kind:'class',classId:'bastion'}})));}
 now=4000;blocked=false;release();await prepare;await Promise.all(pending);
 if(spacing){expect(a.closed).toEqual([]);expect(server.sim.state.profiles[0].lastAction).toBe(16);}
 else{expect(a.closed).toContainEqual({code:1008,reason:'操作が多すぎます'});expect(server.sim.state.profiles[0].lastAction).toBe(12);}
});
