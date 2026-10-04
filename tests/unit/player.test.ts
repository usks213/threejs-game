import { expect, it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
const idle = { x: 0, z: 0, jump: false };
it('starts inside the finite world', () => { const sim = new GameSimulation(); expect(sim.player.x).toBe(0); expect(sim.player.z).toBe(8); expect(sim.player.y).toBeGreaterThan(-16); });
it('clamps movement to the world boundary', () => { const sim = new GameSimulation(); sim.player.x = 999; sim.step({ ...idle, x: 1 }); expect(sim.player.x).toBe(999); });
it('caps oversized input without increasing speed', () => { const a = new GameSimulation(), b = new GameSimulation(); a.step({...idle,x:1}); b.step({...idle,x:1000}); expect(a.player.x).toBe(b.player.x); });
it('ignores nonfinite movement without corrupting player state', () => { const sim = new GameSimulation(), control = new GameSimulation(); sim.step({...idle,x:Infinity,z:NaN}); control.step(idle); expect(sim.player).toEqual(control.player); });
it('returns a fallen player to a safe spawn', () => { const sim = new GameSimulation(); sim.player.y = -20; sim.step(idle); expect(sim.player.x).toBe(0); expect(sim.player.z).toBe(8); expect(sim.player.y).toBeGreaterThan(0); });
