import {afterEach,expect,it,vi} from 'vitest';
import {writeRoom,type RoomStorage} from '../../src/save/room-storage';
import {PersistenceFailure,persistenceDiagnostic,formatPersistenceDiagnostic,type PersistencePhase} from '../../src/save/persistence-diagnostic';
import {legacySimulation} from '../helpers/legacy';
import {initialRoomAccess} from '../../src/networking/room-access';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
const secret='fake-secret room-123 https://private.invalid/checkpoint';
afterEach(()=>vi.restoreAllMocks());
it('publishes only allowlisted codes, retaining the private original cause and no raw text',()=>{
 const cause=new Error(secret+' SQLITE_FULL\n'+secret),error=new PersistenceFailure('transaction-write',cause);
 expect(error.cause).toBe(cause);expect(formatPersistenceDiagnostic(persistenceDiagnostic(error))).toBe('transaction-write/storage-full');
 expect(error.message+JSON.stringify(error)).not.toContain(secret);
 expect(formatPersistenceDiagnostic({phase:secret,category:'unknown'})).toBe('unknown/unknown');
 expect(formatPersistenceDiagnostic({phase:'transaction-write',category:secret})).toBe('unknown/unknown');
 expect(formatPersistenceDiagnostic({get phase(){throw cause;}})).toBe('unknown/unknown');
 let reads=0;expect(formatPersistenceDiagnostic({get phase(){return reads++===0?'transaction-write':secret;},category:'unknown'})).toBe('transaction-write/unknown');expect(reads).toBe(1);
 expect(formatPersistenceDiagnostic(persistenceDiagnostic(Error('arbitrary quota limit size '+secret)))).toBe('queue/unknown');
 expect(formatPersistenceDiagnostic(persistenceDiagnostic(Error('Save queue is full')))).toBe('queue/limit');
 for(const [cause,expected]of [[Object.assign(Error(secret),{overloaded:true}),'overloaded'],[Object.assign(Error(secret),{name:'QuotaExceededError'}),'limit'],[Error('SQLITE_BUSY '+secret),'storage-busy'],[Error('SQLITE_TOOBIG '+secret),'value-size'],[Error('Durable Object storage operation exceeded timeout '+secret),'timeout']] as const)expect(persistenceDiagnostic(cause).category).toBe(expected);
});
it.each(['encode-checkpoint','encode-access','transaction-open','transaction-read','transaction-write','transaction-pointers','transaction-cleanup','transaction-commit'] as const)('identifies %s while preserving writeRoom exception identity and transaction ordering',async failed=>{
 let phase:PersistencePhase='checkpoint';const phases:PersistencePhase[]=[],error=Error(secret),checkpoint={version:1 as const,world:legacySimulation().save(),access:initialRoomAccess(false),receipts:[]};
 const digest=crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle,'digest').mockImplementation((...args)=>phase===failed?Promise.reject(error):digest(...args));
 const reject=()=>{if(phase===failed)throw error;};
 const storage:RoomStorage={
  async get<T>(key:string){reject();return(key==='room-current'?{storageVersion:1,generation:'current',segments:1}:key==='room-previous'?{storageVersion:1,generation:'previous',segments:1}:undefined) as T|undefined;},
  async put(){reject();},async delete(){reject();},
  async transaction<T>(fn:(tx:RoomStorage)=>Promise<T>){reject();const result=await fn(storage);reject();return result;},
 };
 await expect(writeRoom(storage,checkpoint,next=>{phase=next;phases.push(next);})).rejects.toBe(error);
 expect(phase).toBe(failed);expect(phases.at(-1)).toBe(failed);
 if(failed==='transaction-commit')expect(phases).toEqual(['encode-checkpoint','encode-access','transaction-open','transaction-read','transaction-write','transaction-pointers','transaction-cleanup','transaction-commit']);
 if(failed==='transaction-open')expect(phases).not.toContain('transaction-read');
});
it('keeps first welcome and late acknowledgments blocked after a diagnostic save failure',()=>{
 const room=new AuthorityRoom(null,'test'),sent:unknown[]=[],closed:number[]=[];
 room.connect('socket',{send:packet=>sent.push(packet),close:code=>closed.push(code)});
 const pending=room.receive('socket',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),'a'.repeat(64));expect(pending.changed).toBe(true);
 expect(sent.some(packet=>(packet as {type:string}).type==='welcome')).toBe(false);
 room.failPersistence(persistenceDiagnostic(new PersistenceFailure('transaction-commit',Error(secret+' SQLITE_FULL'))));pending.acknowledgment?.();
 expect(room.readOnly).toBe(true);expect(closed).toEqual([1011]);expect(JSON.stringify(sent)).not.toContain(secret);
 expect(sent.some(packet=>(packet as {type:string}).type==='welcome')).toBe(false);
 expect(JSON.stringify(sent)).toContain('transaction-commit/storage-full');
});
