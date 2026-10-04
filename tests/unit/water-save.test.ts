import { describe, expect, it, vi } from 'vitest';
import { MAX_FLUID_CELLS, type FluidCell } from '../../src/fluid/fluid';
import { validateSave } from '../../src/save/format';
import { GameSimulation } from '../../src/simulation/game-simulation';

describe('water persistence without render sampling', () => {
  it('preserves every distant cell and the previous save representation without sampling terrain', () => {
    const sim = new GameSimulation();
    const cells: FluidCell[] = Array.from({ length: MAX_FLUID_CELLS + 17 }, (_, i) => ({
      x: 200 + (i % 128) * .5, y: 10, z: 200 + Math.floor(i / 128) * .5,
      size: .5, volume: .05 + (i % 7) * .01,
      vx: i % 2 ? 1.234567 : undefined, vz: i % 3 ? -.456789 : -.0001,
    }));
    sim.fluid.restore(cells);
    const expected = sim.fluid.snapshot().map(c => ({ x: c.x, y: c.y, z: c.z, size: c.size, volume: c.volume, vx: c.vx ?? 0, vz: c.vz ?? 0 }));
    const snapshot = vi.spyOn(sim.fluid, 'snapshot');
    const density = vi.spyOn(sim.world, 'density');
    const saved = sim.save();
    expect(saved.fluids).toEqual(expected);
    expect(saved.fluids).toHaveLength(cells.length);
    expect(saved.fluids.reduce((total, cell) => total + cell.volume, 0)).toBe(cells.reduce((total, cell) => total + cell.volume, 0));
    expect(snapshot).not.toHaveBeenCalled();
    expect(density).not.toHaveBeenCalled();
    expect(validateSave(saved).fluids).toEqual(expected);
    sim.fluid.cells.values().next().value!.volume = .001;
    expect(saved.fluids[0].volume).toBe(cells[0].volume);
  });

  it('round-trips omitted currents and existing precision for both legacy and current cell sizes', () => {
    const baseline = new GameSimulation().save();
    for (const generator of [1, 2, 3] as const) {
      const size = generator === 3 ? .5 : 1;
      const fluids = [
        { x: 0, y: 10, z: 0, size, volume: size ** 3 * .75 },
        { x: size, y: 10, z: 0, size, volume: size ** 3 * .5, vx: -1.234567, vz: 2.345678 },
      ];
      const sim = new GameSimulation({ ...baseline, generator, fluids });
      const saved = sim.save();
      expect(saved.fluids).toEqual([{ ...fluids[0], vx: 0, vz: 0 }, { ...fluids[1], vx: -1.235, vz: 2.346 }]);
      const restored = new GameSimulation(validateSave(saved));
      expect(restored.save().fluids).toEqual(saved.fluids);
    }
  });
});
