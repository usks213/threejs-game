import { it,expect } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { chopWood,fellTree,stepForestry } from '../../src/game/meadows/forestry';
import { validateSave } from '../../src/save/format';
it('retains timber through falling, splitting, chopping and save restoration',()=>{
 const sim=new GameSimulation(),g=sim.adventure,tree=g.state.resources.find(n=>n.kind==='beech')!;g.state.resources=[tree];g.state.inventory={};g.state.equipment='axe';fellTree(g,tree,1);const log=g.state.resources.find(n=>n.log)!;
 Object.assign(sim.player,{x:tree.x+5,y:tree.y,z:tree.z});for(let i=0;i<60;i++)stepForestry(g,1/30);expect(log.log!.fall).toBeGreaterThanOrEqual(1.5);expect(Math.abs(log.log!.b.position.y-log.log!.a.position.y)).toBeLessThan(2);expect(()=>validateSave(sim.save())).not.toThrow();
 for(let i=0;i<3;i++)chopWood(g,log);expect(g.state.resources.filter(n=>n.log)).toHaveLength(2);
 for(const piece of g.state.resources.filter(n=>n.log))for(let i=0;i<3;i++)chopWood(g,piece);expect(g.state.resources.filter(n=>n.drop&&n.kind==='wood').reduce((total,n)=>total+n.amount,0)).toBe(20);
 for(let i=0;i<4;i++)chopWood(g,tree);expect(g.state.resources.filter(n=>n.drop&&n.kind==='wood').reduce((total,n)=>total+n.amount,0)).toBe(22);
});
