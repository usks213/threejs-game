import {DungeonSimulation} from './simulation';
import {parsePacket,validRaidState} from './protocol';
import {DUNGEON_PROTOCOL,type RaidState} from './types';
export interface DungeonCheckpoint {version:1;savedAt:number;state:RaidState}
export interface DungeonPort {send(text:string):void;close(code:number,reason:string):void}
export interface DungeonPersistence {save(checkpoint:DungeonCheckpoint):Promise<void>}
interface Connection {port:DungeonPort;actor:string|null;openedAt:number;window:number;count:number;actions:number}
export function validDungeonCheckpoint(x:unknown):x is DungeonCheckpoint{const c=x as DungeonCheckpoint;return !!c&&c.version===1&&Number.isFinite(c.savedAt)&&c.savedAt>=0&&validRaidState(c.state);}
/** Transport and durable transactions are serialized. No browser owns raid rules. */
export class DungeonServer {
 readonly sim:DungeonSimulation;private connections=new Map<string,Connection>();private serial:Promise<void>=Promise.resolve();private last:number;private saved:number;private failed=false;private remainder=0;
 constructor(private readonly persistence:DungeonPersistence,private readonly now=Date.now,saved?:DungeonCheckpoint){if(saved!==undefined&&!validDungeonCheckpoint(saved))throw new Error('Dungeon save validation failed; refusing reset');this.sim=new DungeonSimulation(saved?structuredClone(saved.state):undefined);this.last=saved?.savedAt??now();this.saved=this.last;for(const p of this.sim.state.profiles){p.actor.connected=false;p.actor.input.x=0;p.actor.input.z=0;p.actor.input.block=false;}}
 get active(){return this.sim.state.phase==='raid'||this.connections.size>0;}
 connect(id:string,port:DungeonPort){const safe:DungeonPort={send:text=>port.send(text),close:(code,reason)=>{try{port.close(code,reason);}catch{/* A closed socket cannot fail the entire raid. */}}};if(this.failed||this.connections.size>=8){safe.close(1013,'部屋が満員か、一時停止中です');return;}this.connections.set(id,{port:safe,actor:null,openedAt:this.now(),window:this.now(),count:0,actions:0});}
 receive(id:string,text:string){return this.enqueue(async()=>{const c=this.connections.get(id);if(!c)return;const now=this.now();if(now-c.window>=1000){c.window=now;c.count=0;c.actions=0;}if(++c.count>40){c.port.close(1008,'送信が多すぎます');this.disconnectNow(id);return;}const packet=parsePacket(text);if(!packet){c.port.close(1008,'不正な操作です');this.disconnectNow(id);return;}await this.advance();
  if(packet.type==='hello'){if(packet.protocol!==DUNGEON_PROTOCOL){c.port.close(1002,'更新して入り直してください');this.disconnectNow(id);return;}if(c.actor){c.port.close(1008,'参加済みです');return;}const p=this.sim.join(packet.key,packet.name.trim());if(!p){c.port.close(1013,'この部屋は6人までです');return;}for(const [otherId,other]of this.connections){if(otherId!==id&&other.actor===p.actor.id){other.port.close(4001,'別の画面で再接続しました');this.connections.delete(otherId);}}c.actor=p.actor.id;await this.persist();this.broadcast();return;}
  if(!c.actor){c.port.close(1008,'先に参加してください');this.disconnectNow(id);return;}
  if(packet.type==='input')this.sim.input(c.actor,packet.sequence,packet.input);
  else{if(++c.actions>12){c.port.close(1008,'操作が多すぎます');this.disconnectNow(id);return;}const message=this.sim.command(c.actor,packet.sequence,packet.action);await this.persist();c.port.send(JSON.stringify({type:'notice',message}));this.broadcast();}
 });}
 disconnect(id:string){return this.enqueue(async()=>{this.disconnectNow(id);await this.persist();});}
 private disconnectNow(id:string){const c=this.connections.get(id);this.connections.delete(id);if(c?.actor)this.sim.disconnect(c.actor);}
 tick(){return this.enqueue(async()=>{for(const [id,c]of this.connections)if(!c.actor&&this.now()-c.openedAt>10000){c.port.close(1008,'参加確認が時間切れです');this.disconnectNow(id);}await this.advance();if(this.sim.dirty||this.sim.state.phase==='raid'&&this.now()-this.saved>=2000)await this.persist();this.broadcast();});}
 private async advance(){const now=this.now(),elapsed=Math.max(0,Math.min(480,(now-this.last)/1000));this.last=now;this.remainder+=elapsed;const steps=Math.min(9600,Math.floor(this.remainder/.05));for(let i=0;i<steps;i++)this.sim.step();this.remainder-=steps*.05;if(this.sim.dirty)await this.persist();}
 private async persist(){const now=this.now();await this.persistence.save({version:1,savedAt:now,state:structuredClone(this.sim.state)});this.saved=now;this.sim.dirty=false;}
 private broadcast(){for(const [id,c]of this.connections)if(c.actor){try{c.port.send(JSON.stringify({type:'snapshot',snapshot:this.sim.snapshot(c.actor)}));}catch{c.port.close(1011,'通信が切れました');this.disconnectNow(id);}}}
 private enqueue(fn:()=>Promise<void>){this.serial=this.serial.then(async()=>{if(this.failed)return;try{await fn();}catch{this.failed=true;for(const c of this.connections.values())c.port.close(1011,'保存に失敗したため安全に停止しました');this.connections.clear();}});return this.serial;}
}
