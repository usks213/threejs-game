import {it,expect} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {fieldGuide} from '../../src/ui/field-guide';
it('lists known personal materials and boss records without inventing undiscovered items',()=>{const sim=new GameSimulation();sim.adventure.state.meadows!.discovered=['ragTunic','wood'];sim.adventure.state.inventory={ragTunic:1};sim.adventure.state.defeated=['stormcore'];const html=fieldGuide(sim.adventure.snapshot());expect(html).toContain('data-guide-name="木材"');expect(html).not.toContain('data-guide-name="鉄鉱"');expect(html).toContain('嵐心の機殻を鎮めた');});
