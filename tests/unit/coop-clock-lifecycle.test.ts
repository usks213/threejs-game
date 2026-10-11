import {expect,it} from 'vitest';
import {startCoopServer} from '../../apps/coop/local-server';
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
it('stops the local authority clock on shutdown and starts a new clock without old debt',async()=>{
 const first=await startCoopServer(0);try{await wait(100);expect(first.timing().steps).toBeGreaterThan(0);}finally{await first.close();}
 const stopped=first.timing();await wait(80);expect(first.timing()).toEqual(stopped);
 const next=await startCoopServer(0);try{expect(next.timing().steps).toBe(0);expect(next.timing().droppedMs).toBe(0);await wait(80);expect(next.timing().steps).toBeGreaterThan(0);}finally{await next.close();}
});
