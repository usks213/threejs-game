export interface CommittedRevisionSample {
 at:number;
 shown:string|null;
 stored:unknown;
 scope:string|null;
 storageVersion:unknown;
}

/** Sample the DOM in the same event callback as the committed IDB read. */
export function readCommittedRevisionSample():Promise<CommittedRevisionSample>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('voxel-coop-adventure-v1',3);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Save verification database is blocked'));
  request.onupgradeneeded=()=>{request.transaction?.abort();reject(Error('Expected an existing save database'));};
  request.onsuccess=()=>{
   const db=request.result;
   try{
   const tx=db.transaction('worlds','readonly'),read=tx.objectStore('worlds').get('single-player');
   let sample:CommittedRevisionSample|undefined;
   read.onsuccess=()=>{
    const status=document.querySelector('#save-status');
    sample={at:Date.now(),shown:status?.getAttribute('data-revision')??null,scope:status?.getAttribute('data-save-scope')??null,stored:read.result?.revision,storageVersion:read.result?.storageVersion};
   };
   read.onerror=()=>reject(read.error);
   tx.onerror=()=>{db.close();reject(tx.error);};
   tx.onabort=()=>{db.close();reject(tx.error??Error('Save verification read aborted'));};
   tx.oncomplete=()=>{db.close();if(sample)resolve(sample);else reject(Error('Save verification produced no sample'));};
   }catch(error){db.close();reject(error);}
  };
 });
}

/** A stable old revision or a persistent wrong UI value must never pass. */
export function isNewCommittedRevision(sample:CommittedRevisionSample,before:string|null):boolean{
 return sample.scope==='local'&&sample.storageVersion===3&&typeof sample.shown==='string'
  &&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sample.shown)
  &&sample.shown===sample.stored&&sample.shown!==before;
}
