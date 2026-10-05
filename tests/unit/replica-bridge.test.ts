import {expect,it} from 'vitest';
import {ReplicaBridge} from '../../src/platform/replica-bridge';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import type {ReplicaUpdate} from '../../src/simulation/local-protocol';
import type {Snapshot} from '../../src/simulation/protocol';
import type {EditOperation} from '../../src/world/types';
const room=new SessionAuthority(null,true);room.join('test');const base=sessionFrame(room,'test');
const state=(tick:number):Snapshot=>({...base,tick,ack:tick,player:{...base.player,x:tick/10}});
function setup(){const sent:ReplicaUpdate[]=[],published:{state:Snapshot;motionOnly:boolean}[]=[];const bridge=new ReplicaBridge(message=>sent.push(message),(state,motionOnly)=>published.push({state,motionOnly}));bridge.beginEpoch(2);return {bridge,sent,published};}
it('bounds complete worker updates and retains newest authority state, water, and the full edit history',()=>{
 const {bridge,sent,published}=setup(),edits:EditOperation[]=[{id:1,tick:1,material:'stone',kind:'dig',position:{x:20,y:0,z:8},radius:1}];
 bridge.offer(state(1),[]);for(let tick=2;tick<=200;tick++)bridge.offer(state(tick),edits);
 expect(sent).toHaveLength(1);expect(bridge.stats).toMatchObject({inFlight:1,pending:1,latestTick:200});
 bridge.applied({type:'replica-applied',epoch:2,requestId:sent[0].requestId,tick:1,player:sent[0].state.player});
 expect(sent).toHaveLength(2);expect(sent[1].state.tick).toBe(200);expect(sent[1].state.fluids).toBe(base.fluids);expect(sent[1].edits).toBe(edits);
 bridge.applied({type:'replica-applied',epoch:2,requestId:sent[1].requestId,tick:200,player:sent[1].state.player});
 expect(bridge.stats).toMatchObject({inFlight:0,pending:0,displayedTick:200});expect(published.at(-1)!.state.fluids).toBe(base.fluids);expect(published.at(-1)!.state.adventure).toBe(base.adventure);
 bridge.offer(state(199),[]);expect(sent).toHaveLength(2);
});
it('never lets delayed prediction or an old epoch overwrite a newer authority frame',()=>{
 const {bridge,sent,published}=setup();bridge.offer(state(1),[]);const first=sent[0];bridge.applied({type:'replica-applied',epoch:2,requestId:first.requestId,tick:1,player:first.state.player});
 bridge.motion({type:'replica-motion',epoch:2,requestId:first.requestId,tick:1,sequence:2,player:{...first.state.player,x:10}});expect(published.at(-1)!.motionOnly).toBe(true);expect(published.at(-1)!.state.player.x).toBe(10);
 bridge.offer(state(3),[]);const next=sent[1];bridge.applied({type:'replica-applied',epoch:2,requestId:next.requestId,tick:3,player:next.state.player});const count=published.length;
 bridge.motion({type:'replica-motion',epoch:2,requestId:first.requestId,tick:1,sequence:99,player:{...first.state.player,x:99}});expect(published).toHaveLength(count);expect(published.at(-1)!.state.player.x).toBe(.3);
 bridge.reset();bridge.offer(state(1),[]);expect(sent).toHaveLength(2);bridge.beginEpoch(3);expect(sent).toHaveLength(3);bridge.applied({type:'replica-applied',epoch:2,requestId:next.requestId,tick:3,player:next.state.player});expect(published).toHaveLength(count);
});
it('releases a failed local update so the latest complete snapshot can recover without losing notices',()=>{
 const {bridge,sent,published}=setup();bridge.offer(state(1),[]);bridge.offer(state(2),[]);bridge.rejected({type:'replica-rejected',epoch:2,requestId:sent[0].requestId,message:'invalid replica'});expect(sent).toHaveLength(2);expect(sent[1].state.tick).toBe(2);expect(published).toHaveLength(0);
});
it('retains the newest complete same-tick frame, including personal state, peers, acknowledgments, and edits',()=>{
 const {bridge,sent,published}=setup();bridge.offer({...state(10),ack:1},[]);
 const edits:EditOperation[]=[{id:1,tick:10,material:'stone',kind:'dig',position:{x:20,y:0,z:8},radius:1}];
 bridge.offer({...state(10),ack:2,edits:1},edits);
 const latest={...state(10),ack:3,edits:1,adventure:{...base.adventure,inventory:{...base.adventure.inventory,wood:12}},peers:[]};bridge.offer(latest,edits);
 bridge.applied({type:'replica-applied',epoch:2,requestId:sent[0].requestId,tick:10,player:sent[0].state.player});
 expect(sent[1].state).toBe(latest);expect(sent[1].edits).toBe(edits);
 bridge.applied({type:'replica-applied',epoch:2,requestId:sent[1].requestId,tick:10,player:sent[1].state.player});expect(published.at(-1)!.state.adventure.inventory.wood).toBe(12);expect(published.at(-1)!.state.ack).toBe(3);expect(published.at(-1)!.state.peers).toEqual([]);
});
it('resets authority acknowledgment and prediction sequencing on reconnect while rejecting all delayed pre-reset messages',()=>{
 const {bridge,sent,published}=setup();bridge.offer(state(100),[]);const old=sent[0];bridge.applied({type:'replica-applied',epoch:2,requestId:old.requestId,tick:100,player:old.state.player});bridge.motion({type:'replica-motion',epoch:2,requestId:old.requestId,tick:100,sequence:101,player:{...old.state.player,x:50}});
 bridge.reset();const count=published.length;bridge.offer({...state(20),ack:2},[]);bridge.beginEpoch(3);const current=sent[1];expect(current.requestId).toBeGreaterThan(old.requestId);
 bridge.applied({type:'replica-applied',epoch:2,requestId:old.requestId,tick:100,player:old.state.player});bridge.motion({type:'replica-motion',epoch:2,requestId:old.requestId,tick:100,sequence:999,player:{...old.state.player,x:999}});expect(published).toHaveLength(count);
 bridge.applied({type:'replica-applied',epoch:3,requestId:current.requestId,tick:20,player:current.state.player});bridge.motion({type:'replica-motion',epoch:3,requestId:current.requestId,tick:20,sequence:3,player:{...current.state.player,x:2.1}});expect(published.at(-1)!.state.player.x).toBe(2.1);
 const after=published.length;bridge.motion({type:'replica-motion',epoch:3,requestId:current.requestId,tick:20,sequence:2,player:{...current.state.player,x:999}});bridge.motion({type:'replica-motion',epoch:3,requestId:old.requestId,tick:100,sequence:999,player:{...old.state.player,x:999}});expect(published).toHaveLength(after);
});
