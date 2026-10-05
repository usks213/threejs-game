import {afterEach,expect,it,vi} from 'vitest';
import {networkUI} from '../../src/platform/network';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import {participantSave} from '../../src/save/participant';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import type {ClientMessage,Snapshot} from '../../src/simulation/protocol';
import type {EditOperation} from '../../src/world/types';
vi.mock('../../src/ui/room-management',()=>({roomManagementUI:()=>({update(){},acknowledged(){},cancelConfirmation(){return false;}})}));
class Element extends EventTarget {hidden=false;value='';textContent='';dataset:Record<string,string>={};click(){this.dispatchEvent(new Event('click'));}}
class Socket {
 static OPEN=1;static CONNECTING=0;static all:Socket[]=[];readyState=0;sent:string[]=[];onopen:(()=>void)|null=null;onmessage:((event:{data:string})=>void)|null=null;onclose:null=null;onerror:null=null;
 constructor(){Socket.all.push(this);}send(text:string){this.sent.push(text);}close(){this.readyState=3;}open(){this.readyState=1;this.onopen?.();}receive(packet:unknown){this.onmessage?.({data:JSON.stringify(packet)});}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();Socket.all=[];});
it('routes same-world welcome to a local continuation and reinitializes only changed or rolled-back worlds',()=>{
 vi.useFakeTimers();const elements=new Map<string,Element>(),element=(selector:string)=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)!;},storage=new Map<string,string>();
 vi.stubGlobal('document',{querySelector:element});vi.stubGlobal('window',new EventTarget());vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('location',{origin:'https://game.example',hash:''});vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
 const posts:ClientMessage[]=[],continued:{state:Snapshot;edits:EditOperation[]}[]=[],controller=new AbortController();
 networkUI(controller.signal,message=>posts.push(message),()=>{}, {loadPersonal:async()=>null,continueReplica:(state,edits)=>continued.push({state,edits})});element('#session-host').click();const socket=Socket.all[0];socket.open();
 const room=new SessionAuthority(null,true);room.join('guest');const save=participantSave(room,'guest'),state=sessionFrame(room,'guest');
 const welcome=(epoch:string,tick:number)=>socket.receive({type:'welcome',protocol:COOP_PROTOCOL,epoch,playerId:'guest',save,state:{...state,tick}});
 welcome('same-world',10);expect(posts.map(message=>message.type)).toEqual(['replica-init','replica-state']);expect(continued).toHaveLength(0);
 element('#session-panel').hidden=false;welcome('same-world',13);expect(posts).toHaveLength(2);expect(continued).toHaveLength(1);expect(continued[0].state.tick).toBe(13);expect(element('#session-panel').hidden).toBe(false);expect(element('#session-status').dataset.welcomeMode).toBe('continued');
 welcome('restarted-world',0);expect(posts.filter(message=>message.type==='replica-init')).toHaveLength(2);expect(element('#session-status').dataset.welcomeMode).toBe('reinitialized');
 welcome('restarted-world',5);expect(continued).toHaveLength(2);welcome('restarted-world',4);expect(posts.filter(message=>message.type==='replica-init')).toHaveLength(3);expect(element('#session-status').dataset.welcomeMode).toBe('reinitialized');
 controller.abort();
});
