import {expect,it} from 'vitest';
import {readRoom,writeRoom,type RoomStorage} from '../../src/save/room-storage';
import {legacySimulation} from '../helpers/legacy';
class Storage implements RoomStorage{
 data=new Map<string,unknown>(); fail=false; batches:number[]=[];
 async get<T=unknown>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put(entries:Record<string,unknown>){this.batches.push(Object.keys(entries).length);if(this.fail)throw Error('quota');for(const [key,value]of Object.entries(entries))this.data.set(key,structuredClone(value));}
 async delete(keys:string[]){keys.forEach(key=>this.data.delete(key));}
 async transaction<T>(fn:(tx:RoomStorage)=>Promise<T>):Promise<T>{const before=new Map(this.data);try{return await fn(this);}catch(error){this.data=before;throw error;}}
}
const save=()=>({version:1 as const,world:legacySimulation().save(),receipts:[]});
it('atomically retains two generations and preserves valid room when a write fails',async()=>{
 const storage=new Storage(),first=save();await writeRoom(storage,first);const second=save();second.world.player.x=4;await writeRoom(storage,second);expect((await readRoom(storage)).checkpoint?.world.player.x).toBe(4);
 storage.fail=true;await expect(writeRoom(storage,first)).rejects.toThrow('quota');storage.fail=false;expect((await readRoom(storage)).checkpoint?.world.player.x).toBe(4);expect(Math.max(...storage.batches)).toBeLessThanOrEqual(128);
});
it('recovers previous generation while protecting corrupt segments, then permits safe new saves',async()=>{
 const storage=new Storage();await writeRoom(storage,save());await writeRoom(storage,save());const current=await storage.get<{generation:string}>('room-current');const badKey=`checkpoint:${current!.generation}:0`;storage.data.set(badKey,'broken');expect((await readRoom(storage)).recovered).toBe(true);expect([...storage.data.keys()].some(k=>k.startsWith('protected:'))).toBe(true);
 await writeRoom(storage,save());await writeRoom(storage,save());expect(storage.data.get(badKey)).toBe('broken');
});
it('blocks corrupted rooms and migrates legacy segments without destroying originals',async()=>{
 const storage=new Storage();storage.data.set('segments',1);storage.data.set('world:0',JSON.stringify(save()));expect((await readRoom(storage)).checkpoint).not.toBeNull();expect(storage.data.has('world:0')).toBe(true);
 storage.data.set('room-current',{storageVersion:999});storage.data.set('room-previous',{storageVersion:999});await expect(readRoom(storage)).rejects.toThrow('neither has been reset');
});
it('retains the latest ban and receipt when recovering the previous world, and blocks corrupt access metadata',async()=>{
 const {AuthorityRoom}=await import('../../src/networking/authority-room'),{COOP_PROTOCOL}=await import('../../src/networking/coop-protocol');const room=new AuthorityRoom(null,'room'),a='a'.repeat(64),b='b'.repeat(64);for(const id of[a,b]){room.connect(id,{send:()=>{},close:()=>{}});room.receive(id,JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),id).acknowledgment?.();}const storage=new Storage();await writeRoom(storage,room.checkpoint());const previous=room.checkpoint();const result=room.receive(a,JSON.stringify({type:'room-admin',commandId:'ban-once',expectedRevision:room.viewAccess(a).revision,operation:'ban',targetId:b}));await writeRoom(storage,room.checkpoint());result.acknowledgment?.();const current=await storage.get<{generation:string}>('room-current');storage.data.set(`checkpoint:${current!.generation}:0`,'corrupt');const loaded=await readRoom(storage);expect(loaded.recovered).toBe(true);expect(loaded.checkpoint?.access?.bannedIds).toEqual([b]);expect(loaded.checkpoint?.access?.receipts[0].commandId).toBe('ban-once');await expect(writeRoom(storage,previous)).rejects.toThrow('古い管理情報');
 const envelope=await storage.get<{sha256:string}>('room-access');envelope!.sha256='0'.repeat(64);storage.data.set('room-access',envelope);await expect(readRoom(storage)).rejects.toThrow('破損');
});
it('atomically keeps prior access when quota fails before commit',async()=>{
 const {initialRoomAccess}=await import('../../src/networking/room-access');const storage=new Storage(),first={...save(),access:initialRoomAccess(false)};await writeRoom(storage,first);storage.fail=true;await expect(writeRoom(storage,{...first,access:{...first.access,locked:true,revision:1}})).rejects.toThrow('quota');storage.fail=false;expect((await readRoom(storage)).checkpoint?.access?.locked).toBe(false);
});
it('does not mistake a deleted compact access record for a legacy unmanaged room',async()=>{
 const {initialRoomAccess}=await import('../../src/networking/room-access');const storage=new Storage();await writeRoom(storage,{...save(),access:initialRoomAccess(false)});storage.data.delete('room-access');await expect(readRoom(storage)).rejects.toThrow('欠落');
});
