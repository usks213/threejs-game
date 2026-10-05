import { COOP_PROTOCOL } from './coop-protocol';
/** Resume capabilities travel in the WebSocket body only, never URLs/logs/saves. */
export interface AuthenticatedCoopPacket {text:string;playerId?:string}
export async function authenticateCoopPacket(text:string):Promise<AuthenticatedCoopPacket>{
 if(text.length>8192)return {text};
 let packet:Record<string,unknown>;try{packet=JSON.parse(text) as Record<string,unknown>;}catch{return {text};}
 if(!packet||packet.type!=='hello')return {text};
 if(packet.protocol!==COOP_PROTOCOL)throw Error('ゲームの版が違います。ページを更新してください');
 if(typeof packet.resumeKey!=='string'||!/^[a-f0-9]{64}$/.test(packet.resumeKey))throw Error('復帰情報が不正です');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packet.resumeKey));
 const playerId=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return {text:JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),playerId};
}
