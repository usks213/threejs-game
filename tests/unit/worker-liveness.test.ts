import {afterEach,expect,it,vi} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {TerrainRuntime} from '../../src/world/terrain-runtime';
import type {TerrainRequest} from '../../src/world/terrain-protocol';
import type {SimulationClientMessage,SimulationWorkerMessage} from '../../src/simulation/local-protocol';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});
it('keeps simulation and input live while rendering credits are exhausted, and across pause/reload',async()=>{
 vi.useFakeTimers();
 const output:SimulationWorkerMessage[]=[],pending:Array<()=>void>=[];
 const scope={postMessage:(m:SimulationWorkerMessage)=>output.push(m),onmessage:null as null|((e:{data:SimulationClientMessage})=>void)};
 class Mesher {onmessage:((e:{data:unknown})=>void)|null=null;onerror=null;runtime=new TerrainRuntime();dead=false;postMessage(m:TerrainRequest){pending.push(()=>{if(this.dead)return;const r=this.runtime.handle(m);if(r)this.onmessage?.({data:r});});}terminate(){this.dead=true;}}
 vi.stubGlobal('self',scope);vi.stubGlobal('Worker',Mesher);await import('../../src/simulation/worker');
 const send=(m:SimulationClientMessage)=>scope.onmessage!({data:m});
 const sim=new GameSimulation();sim.adventure.state.inventory.club=1;sim.adventure.state.equipment='club';sim.fluid.restore([]);sim.adventure.state.enemies=[];sim.adventure.state.resources=[];sim.bodies.length=0;
 send({type:'init',save:sim.save()});
 // No mesh ACK at startup: authoritative SDF collision and input still progress.
 while(pending.length)pending.shift()!();send({type:'input',input:{x:1,z:0,jump:false}});vi.advanceTimersByTime(1000);
 const blocked=output.filter(m=>m.type==='snapshot').at(-1)!;expect(blocked.type).toBe('snapshot');if(blocked.type!=='snapshot')return;expect(blocked.state.tick).toBeGreaterThan(20);expect(blocked.state.player.x).toBeGreaterThan(1);expect(blocked.state.player.y).toBeGreaterThanOrEqual(sim.groundAt(blocked.state.player.x,blocked.state.player.z)-.3);expect(output.some(m=>m.type==='ready')).toBe(false);
 const initial=output.splice(0);expect(initial.filter(m=>m.type==='mesh')).toHaveLength(4);for(const m of initial)if(m.type==='mesh')send({type:'mesh-ack',epoch:m.epoch!,count:1});
 const pump=()=>{let n=0;while(pending.length&&n++<1500){pending.shift()!();for(const m of output.splice(0)){if(m.type==='mesh')send({type:'mesh-ack',epoch:m.epoch!,count:1});if(m.type==='ready')return true;}}return false;};
 expect(pump()).toBe(true);
 send({type:'input',input:{x:1,z:0,jump:false}});vi.advanceTimersByTime(1000);
 const snaps=()=>output.filter(m=>m.type==='snapshot');
 const first=snaps().at(-1)!;expect(first.type).toBe('snapshot');if(first.type!=='snapshot')return;expect(first.state.tick).toBeGreaterThan(20);expect(first.state.player.x).toBeGreaterThan(1);
 // Finish enough distant jobs to exhaust the four render credits, deliberately no ACK.
 for(let i=0;i<10&&pending.length;i++)pending.shift()!();output.length=0;vi.advanceTimersByTime(1000);
 const next=snaps().at(-1)!;expect(next.type).toBe('snapshot');if(next.type!=='snapshot')return;expect(next.state.tick).toBeGreaterThan(first.state.tick+20);expect(next.state.player.x).toBeGreaterThan(first.state.player.x+1);
 send({type:'pause',paused:true});output.length=0;vi.advanceTimersByTime(500);expect(snaps()).toHaveLength(0);
 send({type:'pause',paused:false});vi.advanceTimersByTime(500);expect(snaps().length).toBeGreaterThan(0);
 output.length=0;send({type:'init',save:sim.save()});expect(pump()).toBe(true);vi.advanceTimersByTime(100);expect(snaps().every(m=>m.epoch===2)).toBe(true);
 output.length=0;for(let i=0;i<10;i++)send({type:'game-action',action:'guard',id:'on',aim:{x:0,y:0,z:-1}});send({type:'game-action',action:'guard',id:'off',aim:{x:0,y:0,z:-1}});expect(output.some(m=>m.type==='save')).toBe(false);
 send({type:'game-action',action:'attack',aim:{x:0,y:-.8,z:-.6}});expect(output.some(m=>m.type==='save')).toBe(false);vi.advanceTimersByTime(600);expect(output.some(m=>m.type==='save')).toBe(false);vi.advanceTimersByTime(600);const saves=output.filter(m=>m.type==='save');expect(saves).toHaveLength(1);expect(saves[0].save.edits.length).toBeGreaterThan(0);
},20000);
