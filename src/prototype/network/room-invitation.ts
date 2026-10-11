import {roomFromFragment,validResumeKey,validRoomCode,type RoomRole} from './protocol';

export interface RoomIdentityStorage {getItem(key:string):string|null}
export interface HostResumeIdentity {room:string;resumeKey:string}

/** Only application-owned, room-and-role-specific keys are eligible for resume. */
export function roomResumeStorageKey(room:string,role:RoomRole):string {
 if(!validRoomCode(room))throw new Error('Invalid room code');
 return 'ash-room-resume:'+room+':'+role;
}

export function readRoomResumeKey(room:string,role:RoomRole,getStorage:()=>RoomIdentityStorage):string|null {
 if(!validRoomCode(room))return null;
 try{const value=getStorage().getItem(roomResumeStorageKey(room,role));return typeof value==='string'&&validResumeKey(value)?value:null;}catch{return null;}
}

/** A malformed invitation never opens storage, and an unavailable/invalid identity
 * is a guest invitation rather than permission to create a host world. */
export function readHostResumeIdentity(fragment:string,getStorage:()=>RoomIdentityStorage):HostResumeIdentity|null {
 const room=roomFromFragment(fragment);if(!room)return null;
 const resumeKey=readRoomResumeKey(room,'host',getStorage);return resumeKey?{room,resumeKey}:null;
}

/** Invitation backend hints apply to the shared world only. Returning to solo
 * must let the browser's saved format selector choose the player's own world. */
export function soloCampaignURL(href:string):string {
 const url=new URL(href);url.hash='';url.searchParams.delete('streaming');url.searchParams.delete('expedition');return url.href;
}
