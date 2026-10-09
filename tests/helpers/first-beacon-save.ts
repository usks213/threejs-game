import {GameSimulation} from '../../src/simulation/game-simulation';
import {adjacentConstructionPoint} from '../../src/game/skybound/construction-placement';
import {landmarkProtectedVolumes} from '../../src/game/skybound/protection';

/** Browser continuation fixture, earned through real actions from fresh spawn.
 * The independent fresh-arrival test owns browser pickup/construction coverage.
 * This does not edit coordinates, inventory, ready flags, terrain, water or foes.
 */
export function firstBeaconSave(){
 const sim=new GameSimulation(),g=sim.adventure,idle={x:0,z:0,jump:false};
 for(let n=0;n<30;n++)sim.step(idle);
 const wood=g.state.resources.find(node=>node.kind==='wood'&&node.drop)!;
 g.action('gather',String(wood.id));
 g.action('sky-part','beam:wood',{x:wood.x,y:Math.max(sim.groundAt(wood.x,wood.z)+.75,sim.player.y+.5),z:wood.z});
 for(let n=0;n<90;n++)sim.step(idle);
 const first=sim.skybound.state.parts[0];
 g.action('sky-part','beam:wood',adjacentConstructionPoint(first,'beam',landmarkProtectedVolumes(g.state.resources)));
 const second=sim.skybound.state.parts[1];
 g.action('sky-grab',String(first.id));g.action('sky-glue',first.id+':'+second.id);g.action('sky-release',String(first.id));
 // Walk into interaction range without changing the real assembly or player.
 for(let n=0;n<30&&sim.player.z>5.3;n++)sim.step({x:0,z:-1,jump:false});
 g.action('gather','810001');
 return sim.save();
}
