import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createArenaServer } from '../../../server/beyblade/node';
import { RoomManager } from '../../../server/beyblade/manager';
import type { Transport } from '../../../server/beyblade/manager';
import { defaultBuild } from '../../../src/beyblade/data/catalog';
import type { ServerMessage, StateMessage } from '../../../src/beyblade/network/protocol';
const pauses=()=>new Promise<void>(resolve=>setTimeout(resolve,4));
async function until(test:()=>boolean,timeout=3000){const started=Date.now();while(!test()){if(Date.now()-started>timeout)throw new Error('Timed out awaiting protocol state');await pauses();}}
interface Peer { socket:WebSocket; messages:ServerMessage[];send:(data:Record<string,unknown>)=>void;state:()=>StateMessage|undefined;token:()=>string }
async function peer(url:string):Promise<Peer>{const socket=new WebSocket(url);const messages:ServerMessage[]=[];let seq=0;socket.on('message',data=>{const msg=JSON.parse(data.toString()) as ServerMessage;if(msg.type==='hello')seq=msg.lastSeq;messages.push(msg);});await until(()=>messages.some(m=>m.type==='hello'));return {socket,messages,send:data=>socket.send(JSON.stringify({...data,seq:++seq})),state:()=>[...messages].reverse().find((m):m is StateMessage=>m.type==='state'),token:()=>{const hello=messages.find(m=>m.type==='hello');return hello?.type==='hello'?hello.token:'';}};}
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
async function fixture(){let now=1000;const app=await createArenaServer({port:0,now:()=>now,countdownMs:0,graceMs:100});cleanup.push(app.close);const address=app.address;if(!address||typeof address==='string')throw new Error('No TCP address');const url=`ws://127.0.0.1:${address.port}/api/beyblade`;return{...app,url,advance:(ms:number)=>{now+=ms;app.manager.tick();}};}
async function pair(f:Awaited<ReturnType<typeof fixture>>){const a=await peer(f.url),b=await peer(f.url);a.send({type:'queue',build:defaultBuild});b.send({type:'queue',build:defaultBuild});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');return [a,b] as const;}
describe('authoritative network with real WebSocket clients',()=>{
  it('matches two independent clients and simulates/scorers the full match identically',async()=>{
    const f=await fixture();const [a,b]=await pair(f);expect(a.state()?.roomId).toBe(b.state()?.roomId);expect(a.state()?.player).toBe(0);expect(b.state()?.player).toBe(1);
    let completed=false;
    for(let round=0;round<12&&!completed;round++){
      a.send({type:'launch',launch:{power:.2,angle:.3,tilt:.6}});b.send({type:'launch',launch:{power:1,angle:0,tilt:0}});
      await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);
      for(let block=0;block<200;block++){
        for(let step=0;step<60;step++)f.advance(1000/60);
        a.send({type:'ping'});b.send({type:'ping'});await pauses();
        if(['round-end','match-end'].includes(a.state()?.phase??''))break;
      }
      const sa=a.state()!,sb=b.state()!;expect(['round-end','match-end']).toContain(sa.phase);expect(sa.match).toEqual(sb.match);expect(sa.battle).toEqual(sb.battle);expect(sa.battle?.result).not.toBeNull();
      if(sa.phase==='match-end'){expect(Math.max(...sa.match!.scores)).toBeGreaterThanOrEqual(4);expect(sa.match?.winner).not.toBeNull();completed=true;}else{a.send({type:'next'});b.send({type:'next'});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');}
    }
    expect(completed).toBe(true);a.send({type:'cancel'});b.send({type:'cancel'});await until(()=>a.state()?.phase==='idle'&&b.state()?.phase==='idle');expect(f.manager.rooms.size).toBe(0);
  },15_000);
  it('rejects forged builds, client scores, duplicate sequences, and invalid launch values',async()=>{
    const f=await fixture();const [a,b]=await pair(f);a.send({type:'score',score:999,winner:0});a.send({type:'launch',launch:{power:Infinity,angle:0,tilt:0}});a.socket.send(JSON.stringify({seq:1,type:'launch',launch:{power:1,angle:0,tilt:0}}));await until(()=>a.messages.filter(m=>m.type==='error').length>=3);expect(a.state()?.phase).toBe('ready');expect(a.state()?.match?.scores).toEqual([0,0]);expect(b.state()?.match?.scores).toEqual([0,0]);
    const c=await peer(f.url);c.send({type:'queue',build:{...defaultBuild,bit:'invented'}});await until(()=>c.messages.some(m=>m.type==='error'));expect(c.state()?.phase).toBe('idle');expect(f.manager.rooms.size).toBe(1);
  });
  it('queue cancel prevents ghost matches and repeated queue does not self-match',async()=>{
    const f=await fixture();const a=await peer(f.url);a.send({type:'queue',build:defaultBuild});a.send({type:'queue',build:defaultBuild});await until(()=>a.messages.some(m=>m.type==='error'));expect(f.manager.rooms.size).toBe(0);a.send({type:'cancel'});await until(()=>a.state()?.phase==='idle');const b=await peer(f.url);b.send({type:'queue',build:defaultBuild});await until(()=>b.state()?.phase==='queued');expect(f.manager.rooms.size).toBe(0);
  });
  it('resumes the same authenticated session and forfeits after disconnect grace',async()=>{
    const f=await fixture();const [a,b]=await pair(f);const token=a.token();const room=a.state()?.roomId;a.socket.terminate();await until(()=>b.state()?.phase==='opponent-disconnected');const resumed=await peer(`${f.url}?resume=${encodeURIComponent(token)}`);await until(()=>b.state()?.phase==='ready');expect(resumed.state()?.roomId).toBe(room);expect(resumed.state()?.player).toBe(0);resumed.socket.terminate();await until(()=>b.state()?.phase==='opponent-disconnected');f.advance(101);await until(()=>b.state()?.phase==='match-end');expect(b.state()?.match?.winner).toBe(1);expect(b.state()?.reason).toBe('disconnect-forfeit');expect(b.state()?.match?.scores).toEqual([0,0]);
  });
  it('rejects cross-origin websocket upgrades',async()=>{
    const f=await fixture();const rejected=new WebSocket(f.url,{origin:'https://attacker.invalid'});const status=await new Promise<number>(resolve=>{rejected.on('unexpected-response',(_request,response)=>{resolve(response.statusCode??0);rejected.terminate();});rejected.on('error',()=>{});});expect(status).toBe(403);
  });
});
describe('bounded session lifecycle',()=>{
  it('expires stale sessions and limits capacity',()=>{let now=0;const m=new RoomManager({now:()=>now,maxSessions:1});const messages:ServerMessage[]=[];const transport:Transport={send:x=>messages.push(x),close:()=>{}};const first=m.connect(transport)!;expect(m.connect(transport)).toBeNull();m.disconnect(first,transport);now=300_001;m.tick();expect(m.sessions.size).toBe(0);expect(m.connect(transport)).not.toBeNull();m.dispose();});
});
