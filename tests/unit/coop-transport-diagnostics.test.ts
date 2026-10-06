import {expect,it} from 'vitest';
import {createCoopTransportDiagnostics} from '../helpers/coop-transport-diagnostics';

it('retains only allowlisted categories and static close reasons, never payloads, identifiers, capabilities or URLs',()=>{
 let now=100;const observer=createCoopTransportDiagnostics(()=>now),connection=observer.connection();
 connection.packet('sent',{type:'hello',resumeKey:'private-resume',url:'wss://private.example/coop/private'});
 now=110;connection.packet('sent',{type:'delivery',token:'private-delivery'});connection.packet('received',{type:'welcome',playerId:'private-player',save:{secret:'private-save'}});
 now=125;connection.packet('sent',{type:'https://private-category.example/token'});
 connection.close({code:1008,reason:'Rate limit',wasClean:true},{incoming:2,outgoing:3});
 const snapshot=observer.snapshot(),record=snapshot.connections[0];
 expect(snapshot).toMatchObject({nativeSent:3,nativeReceived:1,connectionCount:1});
 expect(record.sent).toEqual({total:3,byType:{hello:1,delivery:1,other:1},firstAtMs:0,lastAtMs:25});
 expect(record.close).toEqual({atMs:25,code:1008,reason:'Rate limit',reasonLength:10,wasClean:true,pendingIncoming:2,pendingOutgoing:3});
 expect(record.recent.samples.map(sample=>sample.agoMs)).toEqual([25,15,15,0]);
 for(const secret of ['private-resume','private.example','private-delivery','private-player','private-save','private-category'])expect(JSON.stringify(snapshot)).not.toContain(secret);
 const other=observer.connection();other.close({code:1008,reason:'Invalid handshake wss://secret.example/?token=secret',wasClean:false});
 expect(observer.snapshot().connections[1].close).toMatchObject({code:1008,reason:'redacted',wasClean:false});expect(JSON.stringify(observer.snapshot())).not.toContain('secret');
});

it('reports exact recent native counts and timing, and freezes the close window after later observation',()=>{
 let now=0;const observer=createCoopTransportDiagnostics(()=>now),connection=observer.connection();
 connection.packet('sent',{type:'hello'});now=1000;connection.packet('sent',{type:'input'});now=1001;connection.packet('received',{type:'delta'});now=1010;connection.packet('sent',{type:'delivery'});
 connection.close({code:1006,reason:'',wasClean:false});const closed=observer.snapshot().connections[0];
 expect(closed.sent.total).toBe(3);expect(closed.recent.sent).toEqual({total:2,byType:{input:1,delivery:1},firstAtMs:1000,lastAtMs:1010});expect(closed.recent.received.total).toBe(1);expect(closed.recent.truncated).toBe(false);
 now=9999;connection.packet('sent',{type:'input'});connection.close({code:1000,reason:'changed'});
 expect(observer.snapshot().connections[0]).toEqual(closed);expect(observer.snapshot().nativeSent).toBe(3);
 // Snapshots are detached, so artifact consumers cannot mutate observation.
 closed.sent.byType.hello=999;closed.recent.samples[0].type='other';
 expect(observer.snapshot().connections[0].sent.byType.hello).toBe(1);expect(observer.snapshot().connections[0].recent.samples[0].type).toBe('input');
});

it('bounds burst samples and reconnect records without hiding truncation or losing cumulative counts',()=>{
 let now=0;const observer=createCoopTransportDiagnostics(()=>now),connection=observer.connection();
 for(let i=0;i<300;i++)connection.packet('sent',{type:'delivery'});
 let snapshot=observer.snapshot();expect(snapshot.connections[0].recent.samples).toHaveLength(256);expect(snapshot.connections[0].recent.truncated).toBe(true);expect(snapshot.connections[0].sent.total).toBe(300);expect(snapshot.connections[0].recent.sent.total).toBe(256);
 now=1001;connection.packet('sent',{type:'ping'});snapshot=observer.snapshot();expect(snapshot.connections[0].recent.truncated).toBe(false);expect(snapshot.connections[0].recent.samples).toHaveLength(1);connection.close();
 for(let i=0;i<20;i++){const next=observer.connection();next.packet('sent',{type:'hello'});next.close();}
 snapshot=observer.snapshot();expect(snapshot.connectionCount).toBe(21);expect(snapshot.connections).toHaveLength(8);expect(snapshot.nativeSent).toBe(321);expect(snapshot.connections[0].connection).toBe(14);
 expect(snapshot.connections[0].close).toMatchObject({code:null,reason:'unavailable',wasClean:null});
});

it('does not treat malformed categories, close metadata or arbitrary strings as safe evidence',()=>{
 const observer=createCoopTransportDiagnostics(()=>0),connection=observer.connection();
 for(const packet of [null,'private-string',{type:{secret:'private-object'}},{type:'__proto__'},{type:'constructor'}])connection.packet('received',packet);
 connection.close({code:Infinity,reason:{secret:'private-close'},wasClean:'private-boolean'});
 expect(observer.snapshot().connections[0].received.byType).toEqual({other:5});
 expect(observer.snapshot().connections[0].close).toMatchObject({code:null,reason:'unavailable',reasonLength:null,wasClean:null});expect(JSON.stringify(observer.snapshot())).not.toContain('private');
});
