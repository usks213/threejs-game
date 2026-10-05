import {expect,it} from 'vitest';
import {startCoopServer} from '../../apps/coop/local-server';
import {loadTarget,measurePublicCoop,sampleDistribution} from '../../scripts/probe-public-coop-load';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('only targets the existing secure preview with an exact SHA, or an explicit loopback validation',()=>{
 expect(loadTarget('https://pr-5-voxel-coop-adventure.usks213.workers.dev','a'.repeat(40)).local).toBe(false);expect(loadTarget('http://127.0.0.1:1234','local').local).toBe(true);
 for(const url of ['https://example.com','http://pr-5-voxel-coop-adventure.usks213.workers.dev','https://user:password@pr-5-voxel-coop-adventure.usks213.workers.dev','https://pr-5-voxel-coop-adventure.usks213.workers.dev/path'])expect(()=>loadTarget(url,'a'.repeat(40))).toThrow();expect(()=>loadTarget('https://pr-5-voxel-coop-adventure.usks213.workers.dev','local')).toThrow();
});
it('computes observations without inventing samples',()=>{expect(sampleDistribution([])).toEqual({count:0,p50:0,p95:0,max:0});expect(sampleDistribution([4,1,3,2])).toEqual({count:4,p50:2,p95:3,max:4});});
it('validates the bounded measurement over four real local sockets without a game fixture',async()=>{
 const server=await startCoopServer(0),directory=await mkdtemp(join(tmpdir(),'public-load-probe-'));
 try{const result=await measurePublicCoop({base:`http://127.0.0.1:${server.port}`,expected:'local',durationMs:1000,warmupMs:200,output:join(directory,'summary.json')});expect(result.status).toBe('completed');expect(result.clients).toBe(4);expect(result.clientsMeasured.every(c=>c.frames>=2&&c.tickDelta>0&&c.observedTickHz>0)).toBe(true);expect(result.workerMemoryUsage).toContain('not exposed');expect(result.failures).toEqual([]);}finally{await server.close();await rm(directory,{recursive:true,force:true});}
},20000);
