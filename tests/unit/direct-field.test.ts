import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {TerrainRuntime} from '../../src/world/terrain-runtime';
import {meshTransferables} from '../../src/world/mesh-preparation';
it('direct rendering consumes the same saved world and never changes saves, inventory or terrain edits',()=>{
 const sim=new GameSimulation();sim.adventure.state.inventory.wood=37;sim.adventure.state.buildings.push({id:sim.allocateEntityId(),definition:'bench',x:3,y:sim.groundAt(3,8),z:8,rotation:0,support:3,contents:{wood:5}});
 const p={x:0,y:sim.groundAt(0,8),z:8};sim.world.apply({id:1,tick:1,kind:'dig',position:p,radius:1.2,material:'stone'});
 const saved=sim.save(),before=JSON.stringify(saved),runtime=new TerrainRuntime();
 runtime.handle({type:'init',direct:true,epoch:1,bounds:sim.world.bounds,generator:sim.world.generator,edits:saved.edits});
 const result=runtime.handle({type:'mesh',job:{epoch:1,version:1,editCount:saved.edits.length,brick:{id:'0,0,1',origin:{x:0,y:0,z:8},step:.5}}});
 expect(result?.type).toBe('mesh');if(result?.type!=='mesh')return;
 expect(result.mesh.indices.length).toBe(0);expect(result.mesh.positions.length).toBe(0);const field=result.mesh.field!;expect(field.density.length).toBe(4913);expect(meshTransferables([result.mesh])).toContain(field.density.buffer);
 for(const [x,y,z]of [[0,0,0],[5,4,3],[16,16,16]])expect(field.density[x+17*(y+17*z)]).toBeCloseTo(sim.world.density({x:x*.5,y:y*.5,z:8+z*.5}),5);
 expect(JSON.stringify(saved)).toBe(before);const restored=new GameSimulation(structuredClone(saved));expect(restored.adventure.state.inventory.wood).toBe(37);expect(restored.world.edits).toEqual(sim.world.edits);expect(restored.save()).toEqual(saved);
});
