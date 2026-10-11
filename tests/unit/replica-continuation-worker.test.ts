import {afterEach,expect,it,vi} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import {participantSave} from '../../src/save/participant';
import type {SimulationClientMessage,SimulationWorkerMessage} from '../../src/simulation/local-protocol';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});
it('clears pre-welcome predicted movement and reused input numbers without reinitializing terrain',async()=>{
 vi.useFakeTimers();const source=new GameSimulation(undefined,3);source.fluid.restore([]);source.adventure.state.enemies=[];source.adventure.state.resources=[];
 const authority=new SessionAuthority(source.save(),true),actor=authority.join('guest'),save=participantSave(authority,'guest'),state=sessionFrame(authority,'guest');
 const output:SimulationWorkerMessage[]=[],workers:{dead:boolean}[]=[],scope={postMessage:(message:SimulationWorkerMessage)=>output.push(message),onmessage:null as null|((event:{data:SimulationClientMessage})=>void)};
 class Mesher {onmessage=null;onerror=null;dead=false;constructor(){workers.push(this);}postMessage(){}terminate(){this.dead=true;}}
 vi.stubGlobal('self',scope);vi.stubGlobal('Worker',Mesher);await import('../../src/simulation/worker');
 const send=(message:SimulationClientMessage)=>scope.onmessage!({data:message});send({type:'replica-init',save,direct:true});send({type:'replica-update',requestId:1,state,edits:save.edits});
 for(let sequence=1;sequence<=8;sequence++)send({type:'replica-input',sequence,input:{x:1,z:0,jump:false}});
 const predicted=output.filter(message=>message.type==='replica-motion').at(-1)!;expect(predicted.type).toBe('replica-motion');if(predicted.type!=='replica-motion')throw Error('Missing predicted motion');expect(predicted.player.x).toBeGreaterThan(actor.player.x+.3);
 const baseline={...state,tick:100,ack:0};send({type:'replica-update',requestId:2,resetPrediction:true,state:baseline,edits:save.edits});
 const resumed=output.filter(message=>message.type==='replica-applied').at(-1)!;expect(resumed.type).toBe('replica-applied');if(resumed.type!=='replica-applied')throw Error('Missing resumed baseline');expect(resumed.player.x).toBe(actor.player.x);expect(resumed.tick).toBe(100);
 expect(output.filter(message=>message.type==='terrain-reset')).toHaveLength(1);expect(workers).toHaveLength(1);expect(workers[0].dead).toBe(false);
 // The new transport starts again at ACK+1. It must not combine this command
 // with the old pending commands carrying the same numbers.
 send({type:'replica-input',sequence:1,input:{x:0,z:0,jump:false}});send({type:'replica-update',requestId:3,state:{...baseline,tick:101,ack:1},edits:save.edits});
 const idle=output.filter(message=>message.type==='replica-applied').at(-1)!;if(idle.type!=='replica-applied')throw Error('Missing idle baseline');expect(idle.player.x).toBe(actor.player.x);
 expect(output.some(message=>message.type==='error'||message.type==='replica-rejected')).toBe(false);
});
