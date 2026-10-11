import { smokeColumn } from '../../src/game/meadows/smoke';
import type { BuildingState } from '../../src/game/types';
import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { roofed } from '../../src/game/meadows/state';
import { stepFish } from '../../src/game/meadows/fish';
import { occupiedSlots } from '../../src/game/meadows/inventory';
it('uses roof slope, rotation and footprint for rain cover',()=>{
 const b={id:1,definition:'roof45',x:0,y:1,z:0,rotation:Math.PI/2,support:3,contents:{}};
 expect(roofed({x:.9,y:2,z:0},[b])).toBe(true);
 expect(roofed({x:-.9,y:2,z:0},[b])).toBe(false);
 expect(roofed({x:1.2,y:0,z:0},[b])).toBe(false);
});
it('keeps fish in water, saves their movement, and allows stranded fish to be gathered',()=>{
 const sim=new GameSimulation(undefined,3),g=sim.adventure,n=g.state.resources.find(n=>n.kind==='perch')!;
 sim.fluid.add({x:n.x,y:n.y+1,z:n.z},1);Object.assign(sim.player,{x:n.x+1,y:n.y+2,z:n.z});g.state.resources=[n];
 stepFish(g,.1);expect(n.swimming).toBeDefined();expect(()=>g.action('gather')).toThrow('釣り竿');
 expect(new GameSimulation(sim.save()).adventure.state.resources[0].swimming).toEqual(n.swimming);
 sim.fluid.cells.clear();stepFish(g,.1);g.action('gather');expect(g.state.inventory.rawFish).toBe(1);
});
it('caps quick storage at ten stacks without deleting overflow',()=>{
 const sim=new GameSimulation(undefined,3),g=sim.adventure,p=sim.player;g.state.buildings=[{id:sim.allocateEntityId(),definition:'chest',x:p.x,y:p.y,z:p.z,rotation:0,support:3,contents:{}}];g.state.inventory={wood:1000,stone:40};
 g.action('chest');expect(occupiedSlots(g.state.buildings[0].contents)).toBe(10);expect(g.state.inventory.wood).toBe(500);expect(g.state.inventory.stone).toBe(40);
});

it('keeps smoke below a closed ceiling and vents through an opened door',()=>{
 const fire:BuildingState={id:1,definition:'fire',x:0,y:0,z:0,rotation:0,support:3,contents:{}};
 const room:BuildingState[]=[{...fire,id:2,definition:'floor',y:2}];
 for(let i=0;i<4;i++){const a=i*Math.PI/2;room.push({...fire,id:3+i,definition:i===0?'gate':'wall',x:Math.sin(a),z:Math.cos(a),rotation:a});}
 expect(smokeColumn(fire,room)).toEqual({ceiling:2,ventilated:false});room[1].open=true;
 expect(smokeColumn(fire,room).ventilated).toBe(true);room.shift();expect(smokeColumn(fire,room).ceiling).toBeNull();
});
it('sets a spawn in daytime without skipping a day or restoring health instantly',()=>{
 const sim=new GameSimulation(undefined,3),g=sim.adventure,p=sim.player;g.state.enemies=[];g.state.health=10;
 const b:BuildingState={id:sim.allocateEntityId(),definition:'bed',x:p.x,y:p.y,z:p.z,rotation:0,support:3,contents:{}};
 g.state.buildings=[b,{...b,id:sim.allocateEntityId(),definition:'fire',x:p.x+2,fuel:100},{...b,id:sim.allocateEntityId(),definition:'roof',y:p.y+2}];
 g.action('rest');expect(g.state.spawn).not.toBeNull();expect(g.state.seconds).toBe(0);expect(g.state.health).toBe(10);
 g.state.seconds=360;g.action('rest');expect(g.state.seconds).toBeGreaterThan(360);expect(g.state.health).toBe(25);
});
