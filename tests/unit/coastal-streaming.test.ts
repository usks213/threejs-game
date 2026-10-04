import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {advanceMeadowWater,populateMeadowTiles} from '../../src/game/meadows/exploration';
import {validateSave} from '../../src/save/format';
it('queues coastline discovery instead of allocating the whole region in its discovery tick',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);populateMeadowTiles(sim,sim.adventure.state,{x:-96,y:0,z:8});expect(sim.fluid.cells.size).toBe(0);expect(sim.adventure.state.meadows!.pendingWaterTiles!.length).toBeGreaterThan(0);
 expect(advanceMeadowWater(sim,sim.adventure.state,()=>0)).toBe(64);expect(sim.fluid.cells.size).toBeLessThanOrEqual(640);
});
it('keeps exact final water content and resumes a saved partial tile without duplicate volume',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.meadows!.pendingWaterTiles=[{x:-3,z:0,column:0}];advanceMeadowWater(sim,sim.adventure.state,()=>0);
 const save=sim.save(),resumed=new GameSimulation(structuredClone(save));expect(resumed.adventure.state.meadows!.pendingWaterTiles![0].column).toBe(64);
 while(resumed.adventure.state.meadows!.pendingWaterTiles!.length)advanceMeadowWater(resumed,resumed.adventure.state,()=>0);
 const expected=new GameSimulation();expected.fluid.restore([]);
 for(let x=-96;x<-64;x+=.5)for(let z=0;z<32;z+=.5){const y=expected.groundAt(x+.25,z+.25);if(y>=-.1)continue;for(let wy=Math.max(-5,Math.ceil(y*2)/2);wy<0;wy+=.5)expected.fluid.add({x,y:wy,z},.95);}
 const cells=(s:GameSimulation)=>[...s.fluid.cells.entries()].map(([id,c])=>[id,{...c,vx:c.vx??0,vz:c.vz??0}] as const).sort((a,b)=>a[0].localeCompare(b[0]));expect(cells(resumed)).toEqual(cells(expected));
 const corrupt=structuredClone(save);corrupt.adventure!.meadows!.pendingWaterTiles![0].column=-1;expect(()=>validateSave(corrupt)).toThrow('水の生成記録');
},15000);
it('honors the time budget between columns',()=>{const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.meadows!.pendingWaterTiles=[{x:-3,z:0,column:0}];let time=0;expect(advanceMeadowWater(sim,sim.adventure.state,()=>time+=3)).toBe(1);});
