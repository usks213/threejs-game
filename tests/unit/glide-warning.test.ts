import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {traversalStatus} from '../../src/ui/traversal-warning';
const input={x:0,z:0,jump:false};
it('warns before gliding stamina runs out, explains the closure, then clears the notice',()=>{
 const sim=new GameSimulation(),g=sim.adventure;Object.assign(sim.player,{x:0,y:40,z:0,grounded:false});g.state.stamina=14;g.traversal.gliding=true;
 g.traversal.beforeMove(input,.1);expect(traversalStatus(g.traversal.snapshot())).toContain('足場へ着地');expect(g.traversal.gliding).toBe(true);
 g.state.stamina=0;g.traversal.beforeMove(input,.1);expect(g.traversal.gliding).toBe(false);expect(traversalStatus(g.traversal.snapshot())).toContain('翼が閉じました');
 g.state.stamina=30;g.traversal.beforeMove(input,2.1);expect(traversalStatus(g.traversal.snapshot())).toBe('');
});
it('does not warn during ordinary movement or stamina-free debug flight',()=>{
 const sim=new GameSimulation(),g=sim.adventure;g.state.stamina=5;g.traversal.beforeMove(input,.1);expect(traversalStatus(g.traversal.snapshot())).not.toContain('翼');
});
