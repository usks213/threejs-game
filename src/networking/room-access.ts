export type RoomAdminOperation='lock'|'unlock'|'kick'|'ban'|'unban';
export interface RoomAdminCommand {commandId:string;expectedRevision:number;operation:RoomAdminOperation;targetId?:string}
export interface RoomAdminReceipt extends RoomAdminCommand {revision:number}
export interface RoomAccessState {version:1;administratorId:string|null;claimable:boolean;locked:boolean;knownIds:string[];bannedIds:string[];revision:number;receipts:RoomAdminReceipt[]}
export interface RoomAccessView {canManage:boolean;locked:boolean;revision:number;pending:boolean;readOnly:boolean;members?:{id:string;online:boolean;banned:boolean}[]}
export const ROOM_ACCESS_LIMITS={members:256,receipts:256} as const;
export const isPublicPlayerId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
const knownId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(id)&&!['host','__proto__','constructor','prototype'].includes(id);
export function validateAdminCommand(raw:unknown):RoomAdminCommand{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('部屋管理の操作が不正です');const c=raw as RoomAdminCommand;
 if(typeof c.commandId!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(c.commandId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||!['lock','unlock','kick','ban','unban'].includes(c.operation)||(['lock','unlock'].includes(c.operation)?c.targetId!==undefined:!isPublicPlayerId(c.targetId)))throw Error('部屋管理の操作が不正です');
 return {commandId:c.commandId,expectedRevision:c.expectedRevision,operation:c.operation,...(c.targetId?{targetId:c.targetId}:{})};
}
export function validateRoomAccess(raw:unknown):RoomAccessState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('部屋の管理情報が不正です');const a=raw as RoomAccessState;
 const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=ROOM_ACCESS_LIMITS.members&&new Set(v).size===v.length&&v.every(knownId);
 if(a.version!==1||a.administratorId!==null&&!isPublicPlayerId(a.administratorId)||typeof a.claimable!=='boolean'||typeof a.locked!=='boolean'||!Number.isSafeInteger(a.revision)||a.revision<0||!ids(a.knownIds)||!ids(a.bannedIds)||!Array.isArray(a.receipts)||a.receipts.length>ROOM_ACCESS_LIMITS.receipts||a.bannedIds.some(id=>!a.knownIds.includes(id))||a.administratorId&&(!a.knownIds.includes(a.administratorId)||a.bannedIds.includes(a.administratorId)||a.claimable)||a.claimable&&(a.locked||a.knownIds.length||a.bannedIds.length||a.receipts.length))throw Error('部屋の管理情報が不正です');
 const commands=new Set<string>(),receipts=a.receipts.map(raw=>{const c=validateAdminCommand(raw);if(commands.has(c.commandId)||!Number.isSafeInteger(raw.revision)||raw.revision<=c.expectedRevision||raw.revision>a.revision)throw Error('部屋管理の受領記録が不正です');commands.add(c.commandId);return {...c,revision:raw.revision};});
 return {version:1,administratorId:a.administratorId,claimable:a.claimable,locked:a.locked,knownIds:[...a.knownIds],bannedIds:[...a.bannedIds],revision:a.revision,receipts};
}
export function initialRoomAccess(fresh:boolean,known:readonly string[]=[]):RoomAccessState{return {version:1,administratorId:null,claimable:fresh,locked:false,knownIds:fresh?[]:[...new Set(known)].filter(knownId).slice(0,ROOM_ACCESS_LIMITS.members),bannedIds:[],revision:0,receipts:[]};}
export const sameAdminCommand=(a:RoomAdminCommand,b:RoomAdminCommand):boolean=>a.commandId===b.commandId&&a.operation===b.operation&&a.targetId===b.targetId&&a.expectedRevision===b.expectedRevision;
export function roomAdminMessage(c:RoomAdminCommand):string{return c.operation==='lock'?'新規参加をロックしました。既知の冒険者は再接続できます':c.operation==='unlock'?'新規参加のロックを解除しました':c.operation==='kick'?'指定した冒険者を退出させました。保存は保持しています':c.operation==='ban'?'指定した冒険者を退出させ、再参加を拒否しました。保存は保持しています':'再参加の拒否を解除しました。以前の保存へ戻れます';}
