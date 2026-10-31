import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createArenaServer } from '../../../server/beyblade/node';
import { RoomManager, battleForSnapshot, SNAPSHOT_EVENT_LIMIT } from '../../../server/beyblade/manager';
import { createBattle, stepBattle } from '../../../src/beyblade/core/physics';
import type { BattleEvent, Build, Launch } from '../../../src/beyblade/core/types';
import type { Transport } from '../../../server/beyblade/manager';
import { defaultBuild, profileFor, buildForBlade, parts } from '../../../src/beyblade/data/catalog';
import type { ServerMessage, StateMessage } from '../../../src/beyblade/network/protocol';
const pauses=()=>new Promise<void>(resolve=>setTimeout(resolve,4));
async function until(test:()=>boolean,timeout=3000){const started=Date.now();while(!test()){if(Date.now()-started>timeout)throw new Error('Timed out awaiting protocol state');await pauses();}}
interface Peer { socket:WebSocket; messages:ServerMessage[];send:(data:Record<string,unknown>)=>void;state:()=>StateMessage|undefined;token:()=>string }
async function peer(url:string):Promise<Peer>{const socket=new WebSocket(url);const messages:ServerMessage[]=[];let seq=0;socket.on('message',data=>{const msg=JSON.parse(data.toString()) as ServerMessage;if(msg.type==='hello')seq=msg.lastSeq;messages.push(msg);});await until(()=>messages.some(m=>m.type==='hello'));return {socket,messages,send:data=>socket.send(JSON.stringify({...data,seq:++seq})),state:()=>[...messages].reverse().find((m):m is StateMessage=>m.type==='state'),token:()=>{const hello=messages.find(m=>m.type==='hello');return hello?.type==='hello'?hello.token:'';}};}
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
// Fixture reselection (2026-10-31, round 2): the original Hells launch pair
// was knife-edge (it burst locally but spun in CI) and no longer bursts at
// all after the duration recalibration. No single legal launch bursts
// robustly in this chaotic 240 Hz solver, so burst-dependent tests
// deterministically select the first pair from this fixed list that
// produces a genuine burst in the same deterministic physics the server
// runs (the fixture pins the selected launch seed), then play the real
// networked match with it. If no pair bursts, selection throws and the test fails:
// burst reachability from legal launches stays covered. All pairs respect
// the server launch limits (power .2-1, tilt <= 0.65 rad).
const BURST_D=Math.PI/180;
const BURST_PAIRS:[Launch,Launch][]=[
  [{power:1,angle:-50*BURST_D,tilt:37*BURST_D},{power:.76,angle:-30*BURST_D,tilt:25*BURST_D}],
  [{power:.85,angle:-50*BURST_D,tilt:37*BURST_D},{power:.76,angle:-.12,tilt:.11}],
  [{power:.85,angle:-70*BURST_D,tilt:37*BURST_D},{power:.76,angle:-.12,tilt:.11}],
  [{power:.7,angle:-50*BURST_D,tilt:30*BURST_D},{power:.9,angle:-7*BURST_D,tilt:11*BURST_D}],
  [{power:.85,angle:-90*BURST_D,tilt:30*BURST_D},{power:.9,angle:-7*BURST_D,tilt:11*BURST_D}],
  [{power:1,angle:-90*BURST_D,tilt:37*BURST_D},{power:.9,angle:-7*BURST_D,tilt:11*BURST_D}],
  [{power:.5,angle:-50*BURST_D,tilt:30*BURST_D},{power:.76,angle:-.12,tilt:.11}],
];
// Seeded candidates (2026-10-31, round 4): the round-4 physics (upright
// righting, gentle-meeting softening, detent recalibration with a 35%
// loading window) killed every previous candidate; an intermediate
// detent state produced zero bursts in 144 scanned battles before the
// ratchet band zone was re-broadened. Bursts are occasional by design
// now (measured in this matchup: .76/-7/12 bursts 4/24 seeds,
// .9/-30/25 3/16), so the selection tries eight independently verified
// seeded candidates FIRST (the seedless pairs below are unverified
// fallbacks that cost a full 15 s sim each when they fail) and CI needs
// only one candidate to survive its FP environment. Re-verified
// against the final round-4 detent calibration: seed 9 bursts at
// ~6.5 s, seed 23 at ~6.3 s, seed 24 at ~12.8 s (the remaining
// candidates burst under the same round's earlier calibration and
// are kept as fallbacks).
const SEEDED_BURST_CANDIDATES:{launches:[Launch,Launch],seed:number}[]=[
  {launches:[{power:.9,angle:-30*BURST_D,tilt:25*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:9},
  {launches:[{power:1,angle:-20*BURST_D,tilt:20*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:23},
  {launches:[{power:.76,angle:-7*BURST_D,tilt:12*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:24},
  {launches:[{power:.9,angle:-7*BURST_D,tilt:12*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:2},
  {launches:[{power:.9,angle:-30*BURST_D,tilt:25*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:16},
  {launches:[{power:.9,angle:-30*BURST_D,tilt:25*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:6},
  {launches:[{power:.76,angle:-7*BURST_D,tilt:6*BURST_D},{power:.76,angle:-7*BURST_D,tilt:6*BURST_D}],seed:17},
  {launches:[{power:.76,angle:-7*BURST_D,tilt:12*BURST_D},{power:.76,angle:-.12,tilt:.11}],seed:7},
];
function selectBurstLaunches():{launches:[Launch,Launch],seed:number}{
  const me=profileFor(defaultBuild),sword=profileFor(buildForBlade(parts.find(p=>p.canonicalId==='ドランソード'&&p.category==='blade')!.id));
  for(const c of SEEDED_BURST_CANDIDATES){const b=createBattle([me,sword],c.launches,c.seed);for(let i=0;i<240*15&&!b.result;i++)stepBattle(b);if(b.result?.finish==='burst')return c;}
  for(const [l1,l2] of BURST_PAIRS){const b=createBattle([me,sword],[l1,l2]);for(let i=0;i<240*15&&!b.result;i++)stepBattle(b);if(b.result?.finish==='burst')return {launches:[l1,l2],seed:0};}
  throw new Error('No enumerated legal launch produced a burst');
}
async function fixture(launchSeed=0){let now=1000;const app=await createArenaServer({port:0,now:()=>now,countdownMs:0,graceMs:100,launchSeed:()=>launchSeed});cleanup.push(app.close);const address=app.address;if(!address||typeof address==='string')throw new Error('No TCP address');const url=`ws://127.0.0.1:${address.port}/api/beyblade`;return{...app,url,advance:(ms:number)=>{now+=ms;app.manager.tick();}};}
async function pair(f:Awaited<ReturnType<typeof fixture>>,builds:[Build,Build]=[defaultBuild,defaultBuild]){const a=await peer(f.url),b=await peer(f.url);a.send({type:'queue',build:builds[0]});await until(()=>a.state()?.phase==='queued');b.send({type:'queue',build:builds[1]});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');return [a,b] as const;}
describe('authoritative network with real WebSocket clients',()=>{
  it('validates launch positions on the server and preserves accepted coordinates',async()=>{
    const f=await fixture(),[a,b]=await pair(f);
    a.send({type:'launch',launch:{power:.6,angle:0,tilt:.1,position:{x:.08,z:0}}});
    await until(()=>a.messages.some(m=>m.type==='error'&&m.message.includes('範囲外')));
    expect(a.state()?.ready).toEqual([false,false]);
    a.send({type:'launch',launch:{power:.6,angle:0,tilt:.1,position:{x:-.07,z:.02}}});
    b.send({type:'launch',launch:{power:.6,angle:0,tilt:.1,position:{x:.08,z:-.02}}});
    await until(()=>a.state()?.phase==='countdown');f.advance(1);
    await until(()=>a.messages.some(m=>m.type==='state'&&m.battle?.tick===0));
    const initial=a.messages.find((m):m is StateMessage=>m.type==='state'&&m.battle?.tick===0)!;
    expect(initial.battle?.tops.map(t=>({x:t.x,z:t.z}))).toEqual([{x:-.07,z:.02},{x:.08,z:-.02}]);
  });

  it('matches two independent clients and scores a finite real two-round match identically',async()=>{
    // This legal-launch fixture produces two actual Burst finishes (2 + 2 points).
    // Keep long same-build trajectory coverage separate from score-to-four transport coverage.
    const {launches:[launchA,launchB],seed}=selectBurstLaunches();
    const f=await fixture(seed);const sword=buildForBlade(parts.find(p=>p.canonicalId==='ドランソード'&&p.category==='blade')!.id);
    const [a,b]=await pair(f,[defaultBuild,sword]);expect(a.state()?.roomId).toBe(b.state()?.roomId);expect(a.state()?.player).toBe(0);expect(b.state()?.player).toBe(1);
    for(let round=0;round<2;round++){
      a.send({type:'launch',launch:launchA});b.send({type:'launch',launch:launchB});
      await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);
      for(let block=0;block<30;block++){
        for(let step=0;step<20;step++)f.advance(1000/60);
        a.send({type:'ping'});b.send({type:'ping'});await pauses();
        if(['round-end','match-end'].includes(a.state()?.phase??''))break;
      }
      await until(()=>['round-end','match-end'].includes(a.state()?.phase??'')&&['round-end','match-end'].includes(b.state()?.phase??'')&&a.state()?.battle?.tick===b.state()?.battle?.tick);
      const sa=a.state()!,sb=b.state()!;expect(sa.match).toEqual(sb.match);expect(sa.battle).toEqual(sb.battle);expect(sa.battle?.result?.finish).toBe('burst');
      expect(sa.match?.scores.reduce((sum,score)=>sum+score,0)).toBe(2*(round+1));
      const lockedScores=[...sa.match!.scores],lockedResult=sa.battle!.result;
      for(let block=0;block<4;block++){for(let step=0;step<60;step++)f.advance(1000/60);await pauses();}
      await until(()=>!(a.state()?.battle?.settling?.remaining)&&!(b.state()?.battle?.settling?.remaining));
      expect(a.state()?.match?.scores).toEqual(lockedScores);expect(a.state()?.battle?.result).toEqual(lockedResult);
      if(round===0){expect(sa.phase).toBe('round-end');a.send({type:'next'});b.send({type:'next'});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');}
    }
    expect(a.state()?.phase).toBe('match-end');expect(b.state()?.phase).toBe('match-end');expect(Math.max(...a.state()!.match!.scores)).toBeGreaterThanOrEqual(4);expect(a.state()?.match?.winner).not.toBeNull();
    a.send({type:'cancel'});b.send({type:'cancel'});await until(()=>a.state()?.phase==='idle'&&b.state()?.phase==='idle');expect(f.manager.rooms.size).toBe(0);
  },90_000);
  it('resolves the original unequal-launch same-build trajectory authoritatively for both clients',async()=>{
    // Full-tensor model: this normal-input round takes ~8 simulated seconds and scores Spin1.
    // One physical round preserves the regression without needlessly repeating it four times.
    const f=await fixture();const [a,b]=await pair(f);
    a.send({type:'launch',launch:{power:.2,angle:.3,tilt:.6}});b.send({type:'launch',launch:{power:1,angle:0,tilt:0}});
    await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);
    for(let block=0;block<40;block++){
      for(let step=0;step<60;step++)f.advance(1000/60);
      a.send({type:'ping'});b.send({type:'ping'});await pauses();if(a.state()?.phase==='round-end')break;
    }
    await until(()=>a.state()?.phase==='round-end'&&b.state()?.phase==='round-end'&&a.state()?.battle?.tick===b.state()?.battle?.tick);
    expect(a.state()?.battle).toEqual(b.state()?.battle);expect(a.state()?.match).toEqual(b.state()?.match);expect(a.state()?.battle?.result?.winner).not.toBeNull();expect(a.state()?.match?.scores.reduce((sum,score)=>sum+score,0)).toBeGreaterThan(0);
    expect(a.state()?.battle?.tops[0].profile.name).toBe(a.state()?.battle?.tops[1].profile.name);
  },15_000);
  it('keeps real burst fragments synchronized and result latched during unscored settling',async()=>{
    const {launches:[launchA,launchB],seed}=selectBurstLaunches();
    const f=await fixture(seed);const sword=buildForBlade(parts.find(p=>p.canonicalId==='ドランソード'&&p.category==='blade')!.id);
    const [a,b]=await pair(f,[defaultBuild,sword]);
    a.send({type:'launch',launch:launchA});b.send({type:'launch',launch:launchB});
    await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);
    for(let block=0;block<30;block++){for(let step=0;step<20;step++)f.advance(1000/60);await pauses();if(a.state()?.phase==='round-end')break;}
    await until(()=>a.state()?.phase==='round-end'&&b.state()?.phase==='round-end');
    const start=a.state()!;expect(start.battle?.result?.finish).toBe('burst');expect(start.battle?.fragments).toHaveLength(3);expect(start.battle?.settling?.remaining).toBeGreaterThan(0);
    const lockedScores=[...start.match!.scores],lockedResult=start.battle!.result,poses=JSON.stringify(start.battle!.fragments);
    a.send({type:'next'});await until(()=>a.messages.some(m=>m.type==='error'&&m.message.includes('余動')));expect(a.state()?.phase).toBe('round-end');
    for(let block=0;block<4;block++){for(let step=0;step<60;step++)f.advance(1000/60);await pauses();}
    await until(()=>!(a.state()?.battle?.settling?.remaining)&&!(b.state()?.battle?.settling?.remaining));
    expect(a.state()?.battle).toEqual(b.state()?.battle);expect(JSON.stringify(a.state()?.battle?.fragments)).not.toBe(poses);
    expect(a.state()?.battle?.result).toEqual(lockedResult);expect(a.state()?.match?.scores).toEqual(lockedScores);
    a.send({type:'next'});b.send({type:'next'});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');expect(a.state()?.battle).toBeNull();
  },90000);
  it('preserves the former Buster Burst input as a general authoritative trajectory regression',async()=>{
    // Independent mass observations legitimately change the finish; never tune physics to a fixture.
    const f=await fixture();const sword=buildForBlade(parts.find(p=>p.canonicalId==='ドランソード'&&p.category==='blade')!.id);
    const buster=buildForBlade(parts.find(p=>p.canonicalId==='ドランバスター'&&p.category==='blade')!.id);buster.ratchet='ratchet:1-60';buster.bit='bit:A';
    const [a,b]=await pair(f,[buster,sword]);
    a.send({type:'launch',launch:{power:.8,angle:0,tilt:8*Math.PI/180}});b.send({type:'launch',launch:{power:.76,angle:-.12,tilt:.11}});
    await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);
    for(let block=0;block<40;block++){
      for(let step=0;step<60;step++)f.advance(1000/60);
      a.send({type:'ping'});b.send({type:'ping'});await pauses();if(a.state()?.phase==='round-end')break;
    }
    await until(()=>a.state()?.phase==='round-end'&&b.state()?.phase==='round-end'&&a.state()?.battle?.tick===b.state()?.battle?.tick);
    expect(a.state()?.battle).toEqual(b.state()?.battle);expect(a.state()?.match).toEqual(b.state()?.match);expect(a.state()?.battle?.result).toBeTruthy();
    expect(a.state()?.battle?.tops[0].profile.name).toBe(profileFor(buster).name);expect(a.state()?.battle?.tick).toBeGreaterThan(0);
  },90_000);
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
  it('resumes an interrupted 6DOF battle without rebuilding or rounding the authoritative body state',async()=>{
    const f=await fixture();const [a,b]=await pair(f);a.send({type:'launch',launch:{power:.5,angle:-1,tilt:.5}});b.send({type:'launch',launch:{power:1,angle:.5,tilt:.1}});await until(()=>a.state()?.phase==='countdown'||a.state()?.phase==='battle');f.advance(1);f.advance(40);await until(()=>(a.state()?.battle?.tick??0)>0&&(b.state()?.battle?.tick??0)>0);
    const before=JSON.parse(JSON.stringify(a.state()?.battle)) as NonNullable<StateMessage['battle']>;expect(a.state()?.battle?.tops).toEqual(b.state()?.battle?.tops);expect(before.tops[0].orientation).toHaveProperty('w');expect(before.tops[0].angularMomentum).toHaveProperty('y');expect(Number.isFinite(before.tops[0].y)).toBe(true);
    const token=a.token();a.socket.terminate();await until(()=>b.state()?.phase==='opponent-disconnected');f.advance(50);const resumed=await peer(`${f.url}?resume=${encodeURIComponent(token)}`);await until(()=>resumed.state()?.phase==='battle'&&b.state()?.phase==='battle');expect(resumed.state()?.battle?.tops).toEqual(before.tops);expect(resumed.state()?.battle?.tick).toBe(before.tick);expect(resumed.state()?.battle).toEqual(b.state()?.battle);
  });
  it('preserves server-assigned seats when queue arrival is reversed',async()=>{
    const f=await fixture();const a=await peer(f.url),b=await peer(f.url);b.send({type:'queue',build:defaultBuild});await until(()=>b.state()?.phase==='queued');a.send({type:'queue',build:defaultBuild});await until(()=>a.state()?.phase==='ready'&&b.state()?.phase==='ready');
    expect(a.state()?.player).toBe(1);expect(b.state()?.player).toBe(0);const token=a.token(),room=a.state()?.roomId;a.socket.terminate();await until(()=>b.state()?.phase==='opponent-disconnected');const resumed=await peer(`${f.url}?resume=${encodeURIComponent(token)}`);await until(()=>resumed.state()?.phase==='ready'&&b.state()?.phase==='ready');expect(resumed.state()?.player).toBe(1);expect(resumed.state()?.roomId).toBe(room);
    resumed.send({type:'cancel'});await until(()=>b.state()?.phase==='match-end');expect(b.state()?.match?.winner).toBe(0);expect(b.state()?.reason).toBe('opponent-left');expect(b.state()?.match?.scores).toEqual([0,0]);
  });
  it('keeps fifth and sixth clients FIFO queued until an active room releases capacity',async()=>{
    const f=await fixture();const [a,b]=await pair(f);const [c,d]=await pair(f);const e=await peer(f.url),g=await peer(f.url);
    e.send({type:'queue',build:defaultBuild});await until(()=>e.state()?.phase==='queued');g.send({type:'queue',build:defaultBuild});await until(()=>g.state()?.phase==='queued');
    expect([...f.manager.rooms.values()].filter(room=>room.phase!=='match-end')).toHaveLength(2);expect(e.state()?.roomId).toBeNull();expect(g.state()?.roomId).toBeNull();
    a.send({type:'cancel'});await until(()=>e.state()?.phase==='ready'&&g.state()?.phase==='ready');expect(e.state()?.player).toBe(0);expect(g.state()?.player).toBe(1);expect(e.state()?.roomId).toBe(g.state()?.roomId);expect(b.state()?.phase).toBe('match-end');expect(c.state()?.phase).toBe('ready');expect(d.state()?.phase).toBe('ready');expect([...f.manager.rooms.values()].filter(room=>room.phase!=='match-end')).toHaveLength(2);
  });
  it('rejects cross-origin websocket upgrades',async()=>{
    const f=await fixture();const rejected=new WebSocket(f.url,{origin:'https://attacker.invalid'});const status=await new Promise<number>(resolve=>{rejected.on('unexpected-response',(_request,response)=>{resolve(response.statusCode??0);rejected.terminate();});rejected.on('error',()=>{});});expect(status).toBe(403);
  });
});
describe('bounded session lifecycle',()=>{
  it('expires stale sessions and limits capacity',()=>{let now=0;const m=new RoomManager({now:()=>now,maxSessions:1});const messages:ServerMessage[]=[];const transport:Transport={send:x=>messages.push(x),close:()=>{}};const first=m.connect(transport)!;expect(m.connect(transport)).toBeNull();m.disconnect(first,transport);now=300_001;m.tick();expect(m.sessions.size).toBe(0);expect(m.connect(transport)).not.toBeNull();m.dispose();});
});

describe('bounded 6DOF snapshot representation',()=>{
  it('keeps quaternion, world angular momentum, COM and lock state exact while bounding only old presentation events',()=>{
    const profile=profileFor(defaultBuild);const battle=createBattle([profile,profile],[{power:.5,angle:.2,tilt:.3},{power:1,angle:.1,tilt:.2}]);battle.tick=1000;
    const vector={x:.12345678901234567,y:-.23456789012345678,z:.34567890123456789};
    battle.events=Array.from({length:192},(_,i):BattleEvent=>({tick:800+i,kind:'rail-engage',top:i%2,intensity:.12345678901234567,position:{...vector},velocity:{...vector},energyBefore:.12345678901234567,energyAfter:.12345678901234567,spinBefore:600.1234567890123,spinAfter:500.1234567890123,velocityBefore:{...vector},velocityAfter:{...vector},travel:.12345678901234567}));
    const snapshot=battleForSnapshot(battle)!;const decoded=JSON.parse(JSON.stringify(snapshot)) as typeof battle;
    expect(snapshot.events).toHaveLength(SNAPSHOT_EVENT_LIMIT);expect(battle.events).toHaveLength(192);expect(decoded.tops).toEqual(battle.tops);expect(decoded.result).toEqual(battle.result);expect(snapshot.tick).toBe(battle.tick);expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(32*1024);expect(JSON.stringify(snapshot).length).toBeLessThan(JSON.stringify(battle).length/3);
    battle.tick=2000;expect(battleForSnapshot(battle)?.events).toHaveLength(0);expect(battle.events).toHaveLength(192);
  });
});
