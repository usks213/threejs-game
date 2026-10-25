import { profileFor, validateBuild } from '../../src/beyblade/data/catalog';
import { createBattle, stepBattle, STEP } from '../../src/beyblade/core/physics';
import { createMatch, scoreRound } from '../../src/beyblade/core/rules';
import type { Battle, Build, Launch, Match } from '../../src/beyblade/core/types';
import type { Phase, ServerMessage, StateMessage } from '../../src/beyblade/network/protocol';
export interface Transport { send(message:ServerMessage):void; close():void }
interface Session { token:string; transport:Transport|null; build:Build|null; roomId:string|null; queued:boolean; disconnectedAt:number|null; lastSeen:number; lastSeq:number; rateStart:number; rateCount:number }
interface Room { id:string; players:[Session,Session]; names:[string,string]; phase:Phase; priorPhase:Phase; match:Match; battle:Battle|null; launches:[Launch|null,Launch|null]; ready:[boolean,boolean]; countdownEndsAt:number; lastTick:number; accumulator:number; lastBroadcast:number; endedAt:number|null; reason?:string }
export interface ManagerOptions { now?:()=>number; countdownMs?:number; graceMs?:number; maxSessions?:number; maxActiveRooms?:number }
const SESSION_TTL=300_000;
export const SNAPSHOT_EVENT_LIMIT=32;
export const SNAPSHOT_EVENT_WINDOW_TICKS=240;
/** Presentation event window only. All rigid-body state stays exact and authoritative. */
export function battleForSnapshot(battle:Battle|null):Battle|null {
  if(!battle)return null;
  return {...battle,events:battle.events.filter(event=>event.tick>=battle.tick-SNAPSHOT_EVENT_WINDOW_TICKS).slice(-SNAPSHOT_EVENT_LIMIT)};
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function parseBuild(value:unknown):Build|null {
  if(!isRecord(value)) return null;
  const allowed=['blade','ratchet','bit','lock_chip','main_blade','assist_blade','over_blade','metal_blade','bladeMode','bitMode'];
  if(Object.keys(value).some(k=>!allowed.includes(k)))return null;
  if(typeof value.blade!=='string'||value.blade.length>100)return null;
  for(const key of allowed)if(value[key]!==undefined&&(typeof value[key]!=='string'||(value[key] as string).length>100))return null;
  const build={blade:'',ratchet:'',bit:'',...value} as unknown as Build;
  return validateBuild(build).length?null:build;
}
function parseLaunch(value:unknown):Launch|null {
  if(!isRecord(value))return null;
  const {power,angle,tilt}=value;
  return finite(power)&&power>=.2&&power<=1&&finite(angle)&&Math.abs(angle)<=Math.PI&&finite(tilt)&&tilt>=0&&tilt<=.65?{power,angle,tilt}:null;
}
/** All scoring, legal builds, simulation time and phase transitions live on the server. */
export class RoomManager {
  readonly sessions=new Map<string,Session>(); readonly rooms=new Map<string,Room>();
  private queue:string[]=[]; private now:()=>number; private countdownMs:number; private graceMs:number; private maxSessions:number;private maxActiveRooms:number;
  constructor(options:ManagerOptions={}){this.now=options.now??Date.now;this.countdownMs=options.countdownMs??2000;this.graceMs=options.graceMs??15_000;this.maxSessions=options.maxSessions??128;this.maxActiveRooms=Math.max(1,Math.floor(options.maxActiveRooms??2));}
  connect(transport:Transport,resumeToken?:string):string|null {
    const now=this.now(); let session=resumeToken?this.sessions.get(resumeToken):undefined;
    if(!session){if(this.sessions.size>=this.maxSessions){transport.send({type:'error',message:'サーバーが混み合っています。時間をおいてお試しください。'});transport.close();return null;}const token=crypto.randomUUID()+crypto.randomUUID();session={token,transport:null,build:null,roomId:null,queued:false,disconnectedAt:null,lastSeen:now,lastSeq:0,rateStart:now,rateCount:0};this.sessions.set(token,session);}
    const previous=session.transport; session.transport=transport;session.disconnectedAt=null;session.lastSeen=now;previous?.close();
    transport.send({type:'hello',token:session.token,lastSeq:session.lastSeq,serverTime:now});
    const room=session.roomId?this.rooms.get(session.roomId):undefined;
    if(room?.phase==='opponent-disconnected'&&room.players.every(p=>p.transport)){room.phase=room.priorPhase;room.lastTick=now;room.accumulator=0;if(room.phase==='countdown')room.countdownEndsAt=now+this.countdownMs;this.broadcast(room);}else this.sendState(session);
    return session.token;
  }
  disconnect(token:string,transport:Transport):void {
    const s=this.sessions.get(token);if(!s||s.transport!==transport)return;
    s.transport=null;s.disconnectedAt=this.now();this.removeQueue(s);
    const room=s.roomId?this.rooms.get(s.roomId):undefined;
    if(room&&room.phase!=='match-end'){if(room.phase!=='opponent-disconnected')room.priorPhase=room.phase;room.phase='opponent-disconnected';this.broadcast(room);}
  }
  receive(token:string,raw:string,transport?:Transport):void {
    const s=this.sessions.get(token);if(!s?.transport||(transport&&s.transport!==transport))return;
    if(raw.length>4096){this.error(s,'メッセージが大きすぎます');return;}
    const now=this.now(); if(now-s.rateStart>=1000){s.rateStart=now;s.rateCount=0;}if(++s.rateCount>20){this.error(s,'操作が速すぎます');return;}
    let msg:unknown;try{msg=JSON.parse(raw);}catch{this.error(s,'不正なメッセージ形式です');return;}
    if(!isRecord(msg)||!Number.isSafeInteger(msg.seq)||Number(msg.seq)<=s.lastSeq||Number(msg.seq)>s.lastSeq+10_000){this.error(s,'古い、または不正な操作です');return;}
    s.lastSeq=Number(msg.seq);s.lastSeen=now;
    if(msg.type==='ping'){s.transport.send({type:'pong',serverTime:now});return;}
    if(msg.type==='cancel'){this.cancel(s);return;}
    if(msg.type==='queue'){
      if(s.queued||s.roomId){this.error(s,'すでに待機中または対戦中です');return;}
      const build=parseBuild(msg.build);if(!build){this.error(s,'使用できないパーツ構成です');return;}
      s.build=build;s.queued=true;this.queue.push(s.token);this.sendState(s);this.pair();return;
    }
    const room=s.roomId?this.rooms.get(s.roomId):undefined;if(!room){this.error(s,'対戦ルームがありません');return;}const index=room.players[0]===s?0:1;
    if(msg.type==='launch'){
      if(room.phase!=='ready'||room.launches[index]){this.error(s,'このタイミングではシュートできません');return;}
      const launch=parseLaunch(msg.launch);if(!launch){this.error(s,'シュート設定が範囲外です');return;}
      room.launches[index]=launch;room.ready[index]=true;
      if(room.launches[0]&&room.launches[1]){room.phase='countdown';room.countdownEndsAt=now+this.countdownMs;}
      this.broadcast(room);return;
    }
    if(msg.type==='next'){
      if(room.phase!=='round-end'){this.error(s,'次のラウンドを開始できません');return;}
      room.ready[index]=true;
      if(room.ready[0]&&room.ready[1]){room.phase='ready';room.ready=[false,false];room.launches=[null,null];room.battle=null;}
      this.broadcast(room);return;
    }
    this.error(s,'未対応の操作です');
  }
  tick():void {
    const now=this.now();
    for(const room of this.rooms.values()){
      if(room.phase==='match-end'){if(room.endedAt!==null&&now-room.endedAt>60_000)this.releaseRoom(room);continue;}
      const absent=room.players.findIndex(p=>p.disconnectedAt!==null&&now-p.disconnectedAt>=this.graceMs);
      if(absent!==-1){const other=absent===0?1:0;room.match={...room.match,winner:room.players[other].transport?other:null};room.phase='match-end';room.reason='disconnect-forfeit';room.endedAt=now;this.broadcast(room);continue;}
      if(room.phase==='opponent-disconnected')continue;
      if(room.phase==='countdown'&&now>=room.countdownEndsAt){room.battle=createBattle([profileFor(room.players[0].build!,0x335dff),profileFor(room.players[1].build!,0xff7858)],[room.launches[0]!,room.launches[1]!]);room.phase='battle';room.lastTick=now;room.accumulator=0;this.broadcast(room);}
      if(room.phase!=='battle'||!room.battle)continue;
      room.accumulator+=Math.min(.1,Math.max(0,(now-room.lastTick)/1000));room.lastTick=now;
      while(room.accumulator>=STEP&&!room.battle.result){stepBattle(room.battle,STEP);room.accumulator-=STEP;}
      if(room.battle.result){room.match=scoreRound(room.match,room.battle.result);room.phase=room.match.winner===null?'round-end':'match-end';room.ready=[false,false];room.endedAt=room.match.winner===null?null:now;this.broadcast(room);}
      else if(now-room.lastBroadcast>=1000/30){this.broadcast(room);}
    }
    for(const s of this.sessions.values()){
      if(s.transport&&now-s.lastSeen>30_000){const transport=s.transport;this.disconnect(s.token,transport);transport.close();}
      if(!s.transport&&!s.roomId&&now-s.lastSeen>SESSION_TTL)this.sessions.delete(s.token);
    }
    this.pair();
  }
  dispose():void {for(const s of this.sessions.values())s.transport?.close();this.sessions.clear();this.rooms.clear();this.queue=[];}
  private pair():void {
    this.queue=this.queue.filter(token=>{const s=this.sessions.get(token);return s?.queued&&s.transport;});
    let activeRooms=[...this.rooms.values()].filter(room=>room.phase!=='match-end').length;
    while(this.queue.length>=2&&activeRooms<this.maxActiveRooms){activeRooms++;const a=this.sessions.get(this.queue.shift()!)!,b=this.sessions.get(this.queue.shift()!)!;a.queued=false;b.queued=false;const id=crypto.randomUUID();a.roomId=id;b.roomId=id;const room:Room={id,players:[a,b],names:[profileFor(a.build!).name,profileFor(b.build!).name],phase:'ready',priorPhase:'ready',match:createMatch(),battle:null,launches:[null,null],ready:[false,false],countdownEndsAt:0,lastTick:this.now(),accumulator:0,lastBroadcast:0,endedAt:null};this.rooms.set(id,room);this.broadcast(room);}
  }
  private cancel(s:Session):void {
    this.removeQueue(s);const room=s.roomId?this.rooms.get(s.roomId):undefined;
    if(room){if(room.phase!=='match-end'){const other=room.players[0]===s?1:0;room.match={...room.match,winner:other};room.phase='match-end';room.reason='opponent-left';room.endedAt=this.now();this.broadcast(room);}s.roomId=null;if(room.players.every(p=>p.roomId!==room.id))this.rooms.delete(room.id);}
    this.sendState(s);this.pair();
  }
  private removeQueue(s:Session){s.queued=false;this.queue=this.queue.filter(t=>t!==s.token);}
  private releaseRoom(room:Room){for(const s of room.players)if(s.roomId===room.id){s.roomId=null;this.sendState(s);}this.rooms.delete(room.id);}
  private error(s:Session,message:string){s.transport?.send({type:'error',message});}
  private snapshot(s:Session):StateMessage {
    const room=s.roomId?this.rooms.get(s.roomId):undefined;
    if(!room)return{type:'state',phase:s.queued?'queued':'idle',player:null,roomId:null,match:null,battle:null,ready:[false,false]};
    const player=room.players[0]===s?0:1;
    return {type:'state',phase:room.phase,player,roomId:room.id,match:room.match,battle:battleForSnapshot(room.battle),ready:room.ready,countdownEndsAt:room.countdownEndsAt,reason:room.reason,opponentName:room.names[player===0?1:0]};
  }
  private sendState(s:Session){s.transport?.send(this.snapshot(s));}
  private broadcast(room:Room){room.lastBroadcast=this.now();for(const s of room.players)this.sendState(s);}
}
