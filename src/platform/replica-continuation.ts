import type {WorldSave} from '../save/format';
import type {Snapshot} from '../simulation/protocol';
import type {EditOperation} from '../world/types';

export interface ReplicaIdentity {epoch:string;playerId:string;seed:number;generator:number;version:number}
export function replicaIdentity(epoch:string,playerId:string,save:WorldSave):ReplicaIdentity {
 return {epoch,playerId,seed:save.seed,generator:save.generator,version:save.version};
}
export function sameTerrainEdit(a:EditOperation,b:EditOperation):boolean {
 return a.id===b.id&&a.kind===b.kind&&a.tick===b.tick&&a.radius===b.radius&&a.material===b.material&&a.undo===b.undo&&a.shape===b.shape&&a.surface===b.surface&&a.position.x===b.position.x&&a.position.y===b.position.y&&a.position.z===b.position.z;
}
/** Only a newer full baseline of this exact world may reuse collision/terrain.
 * Restart, rollback, another player/world, and rewritten edit history reinit. */
export function canContinueReplica(previous:ReplicaIdentity|null,next:ReplicaIdentity,lastTick:number,edits:readonly EditOperation[],save:WorldSave,state:Snapshot):boolean {
 if(!previous||!next.epoch||previous.epoch!==next.epoch||previous.playerId!==next.playerId||previous.seed!==next.seed||previous.generator!==next.generator||previous.version!==next.version)return false;
 if(!Number.isSafeInteger(state.tick)||state.tick<lastTick||state.edits!==save.edits.length||state.adventure.generator!==save.generator||edits.length>save.edits.length)return false;
 return edits.every((edit,i)=>sameTerrainEdit(edit,save.edits[i]));
}
