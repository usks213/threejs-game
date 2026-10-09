import {expect,it} from 'vitest';
import {canContinueReplica,replicaIdentity,sameTerrainEdit} from '../../src/platform/replica-continuation';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import {participantSave} from '../../src/save/participant';
import type {EditOperation} from '../../src/world/types';
const room=new SessionAuthority(null,true);room.join('guest');const save=participantSave(room,'guest'),frame=sessionFrame(room,'guest');
const first:EditOperation={id:1,tick:5,kind:'dig',material:'stone',position:{x:20,y:3,z:8},radius:1.7};
const second:EditOperation={...first,id:2,tick:9,position:{x:22,y:3,z:8}};
const identity=replicaIdentity('authority-epoch','guest',save);
it('continues a same-world full baseline with equal or appended exact edit history',()=>{
 const next={...save,edits:[structuredClone(first),second]},state={...frame,tick:15,edits:2};
 expect(canContinueReplica(identity,identity,10,[first],next,state)).toBe(true);
 expect(canContinueReplica(identity,identity,15,next.edits,next,state)).toBe(true);
 // A reconnect can reset the actor input sequence; the continuation path must
 // separately clear old local prediction rather than require an increasing ACK.
 expect(canContinueReplica(identity,identity,10,[first],next,{...state,ack:0})).toBe(true);
});
it('reinitializes after a restart, world/player change, time rollback or shortened/rewritten history',()=>{
 const next={...save,edits:[first,second]},state={...frame,tick:15,edits:2};
 expect(canContinueReplica(null,identity,10,[],next,state)).toBe(false);
 for(const patch of [{epoch:'restarted'},{playerId:'other'},{seed:save.seed+1},{generator:2},{version:1}])expect(canContinueReplica(identity,{...identity,...patch},10,[first],next,state)).toBe(false);
 expect(canContinueReplica(identity,identity,16,[first],next,state)).toBe(false);
 expect(canContinueReplica(identity,identity,10,next.edits,{...save,edits:[first]},{...state,edits:1})).toBe(false);
 expect(canContinueReplica(identity,identity,10,[first],{...next,edits:[{...first,radius:1.6},second]},state)).toBe(false);
 expect(canContinueReplica(identity,identity,10,[first],next,{...state,edits:1})).toBe(false);
 expect(canContinueReplica(identity,identity,10,[first],next,{...state,adventure:{...state.adventure,generator:3}})).toBe(false);
});
it('compares all saved terrain operation fields without quantizing or mutating either side',()=>{
 expect(sameTerrainEdit(first,structuredClone(first))).toBe(true);
 for(const patch of [{id:3},{tick:6},{kind:'add' as const},{radius:1.7000001},{undo:1},{shape:'cylinder' as const},{surface:'soil' as const},{position:{...first.position,z:8.0000001}}])expect(sameTerrainEdit(first,{...first,...patch})).toBe(false);
 expect(first.position).toEqual({x:20,y:3,z:8});
});
