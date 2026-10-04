import { it, expect, vi } from 'vitest';
import { CheckpointQueue } from '../../src/networking/checkpoint-queue';
it('coalesces bursts and acknowledges only after persistence; recovers after failed writes',async()=>{
 vi.useFakeTimers();try{
 let writes=0,release:(()=>void)|undefined;const queue=new CheckpointQueue(async()=>{writes++;await new Promise<void>(resolve=>release=resolve);});let acknowledged=0;
 const a=queue.request().then(()=>acknowledged++),b=queue.request().then(()=>acknowledged++);
 await vi.advanceTimersByTimeAsync(100);expect(writes).toBe(1);expect(acknowledged).toBe(0);
 const c=queue.request().then(()=>acknowledged++);release!();await a;await b;expect(acknowledged).toBe(2);
 await vi.advanceTimersByTimeAsync(100);expect(writes).toBe(2);release!();await c;expect(acknowledged).toBe(3);
 let fail=true;const retry=new CheckpointQueue(async()=>{if(fail)throw Error('disk full');});const rejected=retry.request().catch(e=>e.message);await vi.advanceTimersByTimeAsync(100);expect(await rejected).toBe('disk full');fail=false;const recovered=retry.request();await vi.advanceTimersByTimeAsync(100);await recovered;
 }finally{vi.useRealTimers();}
});
