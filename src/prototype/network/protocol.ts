/** PR4 transport protocol. Server is a bounded relay; host owns game rules. */
export const CAMPAIGN_PROTOCOL=1;
export const MAX_ROOM_PLAYERS=2;
export const MAX_PACKET_BYTES=40*1024;
export const MAX_SNAPSHOT_BYTES=16*1024*1024;
export const SNAPSHOT_CHUNK_CHARS=8192;
export const MAX_SNAPSHOT_CHUNKS=2048;
export const HOST_LEASE_MS=12000;
export type RoomRole='host'|'guest';
export type RoomStatus='connecting'|'syncing'|'online'|'paused'|'reconnecting'|'closed';
export interface GuestInput {x:number;z:number;yaw:number;pitch:number;block:boolean;sprint:boolean}
export const NEUTRAL_GUEST_INPUT:Readonly<GuestInput>={x:0,z:0,yaw:0,pitch:0,block:false,sprint:false};
export function validGuestInput(v:unknown):v is GuestInput {return record(v)&&typeof v.x==='number'&&Number.isFinite(v.x)&&Math.abs(v.x)<=1&&typeof v.z==='number'&&Number.isFinite(v.z)&&Math.abs(v.z)<=1&&typeof v.yaw==='number'&&Number.isFinite(v.yaw)&&Math.abs(v.yaw)<=Math.PI&&typeof v.pitch==='number'&&Number.isFinite(v.pitch)&&Math.abs(v.pitch)<=Math.PI/2&&typeof v.block==='boolean'&&typeof v.sprint==='boolean';}
export function freshGuestInput(input:GuestInput,lastReceived:number,now:number,timeout=350):GuestInput {return Number.isFinite(lastReceived)&&Number.isFinite(now)&&now-lastReceived>=0&&now-lastReceived<=timeout?{...input}:{...NEUTRAL_GUEST_INPUT,yaw:input.yaw,pitch:input.pitch};}
export interface PlayerPose {x:number;y:number;z:number;yaw:number;pitch:number;hp:number;animation:string}
export interface RoomPlayer {id:RoomRole;connected:boolean;pose:PlayerPose|null}
export interface GuestCommand {action:string;payload:Record<string,unknown>}
export interface SnapshotManifest {sequence:number;chunks:number;bytes:number;checksum:string}
export type ClientPacket=
 |{type:'hello';protocol:1;mode:'create'|'join';resumeKey:string}
 |{type:'ping';epoch:string}
 |{type:'frame';epoch:string;sequence:number;payload:Record<string,unknown>}
 |{type:'input';epoch:string;sequence:number;input:GuestInput}
 |{type:'pose';epoch:string;sequence:number;pose:PlayerPose}
 |{type:'command';epoch:string;sequence:number;commandId:string;command:GuestCommand}
 |{type:'ack';epoch:string;commandId:string;accepted:boolean;message:string}
 |{type:'permission';epoch:string;guestBuild:boolean}
 |{type:'snapshot-begin';epoch:string;manifest:SnapshotManifest}
 |{type:'snapshot-chunk';epoch:string;sequence:number;index:number;data:string}
 |{type:'snapshot-end';epoch:string;sequence:number}
 |{type:'resync';epoch:string}
 |{type:'chat';epoch:string;text:string};
export type ServerPacket=
 |{type:'welcome';protocol:1;role:RoomRole;epoch:string;lastCommandSequence:number;lastPoseSequence:number;snapshotSequence:number;guestBuild:boolean;hostOnline:boolean}
 |{type:'status';epoch:string;hostOnline:boolean;message:string}
 |{type:'players';epoch:string;players:RoomPlayer[]}
 |{type:'frame';epoch:string;sequence:number;payload:Record<string,unknown>}
 |{type:'input';epoch:string;sequence:number;playerId:'guest';input:GuestInput}
 |{type:'command';epoch:string;playerId:'guest';sequence:number;commandId:string;command:GuestCommand}
 |{type:'ack';epoch:string;commandId:string;accepted:boolean|null;message:string}
 |{type:'permission';epoch:string;guestBuild:boolean}
 |{type:'snapshot-begin';epoch:string;manifest:SnapshotManifest}
 |{type:'snapshot-chunk';epoch:string;sequence:number;index:number;data:string}
 |{type:'snapshot-end';epoch:string;sequence:number}
 |{type:'snapshot-request';epoch:string}
 |{type:'chat';epoch:string;playerId:RoomRole;text:string}
 |{type:'notice';message:string}
 |{type:'pong';epoch:string};
export const byteLength=(text:string)=>new TextEncoder().encode(text).byteLength;
export const validRoomCode=(value:string)=>/^[a-f0-9]{64}$/.test(value);
export const validResumeKey=validRoomCode;
export const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const validCommandId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,96}$/.test(v);
export function validPose(v:unknown):v is PlayerPose {if(!record(v))return false;return ['x','y','z','yaw','pitch','hp'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k] as number)<10000)&&typeof v.animation==='string'&&/^[a-z-]{1,24}$/.test(v.animation)&&Number(v.hp)>=0&&Number(v.hp)<=1000;}
/** Damage/building targets must still be checked by the host's simulation. */
export const GUEST_ACTIONS=['attack','heavy','jump','dodge','heal','cast','interact','craft','equip','consume','learn','travel','build','mine','remove-build','repair','upgrade','socket','storage','farm','feed','harvest','rest'] as const;
export const BUILD_ACTIONS=new Set(['build','mine','remove-build','storage']);
function boundedValue(v:unknown,depth=0):boolean {if(depth>4)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1000000;if(typeof v==='string')return v.length<=256;if(Array.isArray(v))return v.length<=32&&v.every(x=>boundedValue(x,depth+1));if(record(v)){const entries=Object.entries(v);return entries.length<=32&&entries.every(([key,value])=>key.length<=64&&!['__proto__','prototype','constructor'].includes(key)&&boundedValue(value,depth+1));}return false;}
export function validCommand(v:unknown):v is GuestCommand {return record(v)&&typeof v.action==='string'&&(GUEST_ACTIONS as readonly string[]).includes(v.action)&&record(v.payload)&&boundedValue(v.payload)&&byteLength(JSON.stringify(v))<=4096;}
function frameValue(v:unknown,depth=0):boolean {if(depth>6)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e9;if(typeof v==='string')return v.length<=512;if(Array.isArray(v))return v.length<=256&&v.every(x=>frameValue(x,depth+1));if(record(v)){const entries=Object.entries(v);return entries.length<=64&&entries.every(([key,value])=>key.length<=64&&!['__proto__','prototype','constructor'].includes(key)&&frameValue(value,depth+1));}return false;}
export function validFrame(v:unknown):v is Record<string,unknown> {return record(v)&&frameValue(v)&&byteLength(JSON.stringify(v))<=24*1024;}
export function validManifest(v:unknown):v is SnapshotManifest {return record(v)&&integer(v.sequence,1)&&integer(v.chunks,1,MAX_SNAPSHOT_CHUNKS)&&integer(v.bytes,1,MAX_SNAPSHOT_BYTES)&&typeof v.checksum==='string'&&/^[a-f0-9]{8}$/.test(v.checksum);}
/** FNV-1a detects accidental transfer corruption. Not an authentication MAC. */
export function snapshotChecksum(text:string){let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export function splitSnapshot(text:string,sequence:number){const bytes=byteLength(text);if(!bytes||bytes>MAX_SNAPSHOT_BYTES)throw new Error('共有状態は16MiB以内で送信してください');const chunks:string[]=[];for(let i=0;i<text.length;){let end=Math.min(text.length,i+SNAPSHOT_CHUNK_CHARS);const last=text.charCodeAt(end-1),next=text.charCodeAt(end);if(end<text.length&&last>=0xd800&&last<=0xdbff&&next>=0xdc00&&next<=0xdfff)end--;chunks.push(text.slice(i,end));i=end;}if(chunks.length>MAX_SNAPSHOT_CHUNKS)throw new Error('共有状態の分割数が上限を超えました');return {manifest:{sequence,chunks:chunks.length,bytes,checksum:snapshotChecksum(text)},chunks};}
export function randomRoomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
export function inviteFragment(room:string){if(!validRoomCode(room))throw new Error('Invalid room code');return '#campaign-room='+room;}
export function roomFromFragment(fragment:string){const m=/^#campaign-room=([a-f0-9]{64})$/.exec(fragment);return m?.[1]??null;}
