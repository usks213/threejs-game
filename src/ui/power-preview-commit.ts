/** Planning is local, but a shared-world commit needs a live authority. A closed
 * connection with a retained participant ID is still a disconnected guest. */
export function powerPreviewConnectionReady(connection:string|undefined,playerId:string|undefined):boolean {
 return connection===undefined||connection==='online'||connection==='closed'&&!playerId;
}
/** Retain an unsubmitted preview through a transient resync. Never queue a new
 * action to execute unexpectedly after a later reconnection. */
export function commitPowerPreview<T>(draft:T|undefined,ready:boolean,commit:(draft:T)=>void):T|undefined {
 if(draft===undefined||!ready)return draft;commit(draft);return undefined;
}
