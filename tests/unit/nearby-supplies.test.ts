import {it,expect} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {nearbySupplies} from '../../src/ui/nearby-supplies';
it('shows actual reachable shared drops with explicit counts and stable target IDs',()=>{const sim=new GameSimulation(),state=sim.adventure.snapshot();const html=nearbySupplies(state,sim.player);expect(html).toContain('data-drop-kind="wood"');expect(html).toContain('×12');expect(html).toContain('data-item="wood" data-count="0"');expect(nearbySupplies(state,{x:100,y:20,z:100})).not.toContain('data-drop-kind');});
