import {validateRoomAccess,type RoomAccessState} from '../networking/room-access';
import type {SafeCheckpoint} from './checkpoint';
export interface AccessEnvelope {version:1;access:RoomAccessState;sha256:string}
async function checksum(access:RoomAccessState):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(access)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
export async function encodeRoomAccess(access:RoomAccessState):Promise<AccessEnvelope>{const validated=validateRoomAccess(access);return {version:1,access:validated,sha256:await checksum(validated)};}
export async function decodeRoomAccess(raw:unknown):Promise<RoomAccessState>{if(!raw||typeof raw!=='object')throw Error('部屋管理の保存を読めません');const e=raw as AccessEnvelope;if(e.version!==1||! /^[a-f0-9]{64}$/.test(e.sha256))throw Error('部屋管理の保存が不正です');const access=validateRoomAccess(e.access);if(await checksum(access)!==e.sha256)throw Error('部屋管理の保存が破損しています');return access;}
/** The compact access record is never rolled back with a previous world generation. */
export function overlayRoomAccess(checkpoint:SafeCheckpoint,access:RoomAccessState|undefined):SafeCheckpoint{
 if(!access)return checkpoint;
 if(checkpoint.access&&(checkpoint.access.revision>access.revision||checkpoint.access.revision===access.revision&&JSON.stringify(checkpoint.access)!==JSON.stringify(access)))throw Error('部屋管理の保存世代が一致しません');
 return {...checkpoint,access:structuredClone(access)};
}
