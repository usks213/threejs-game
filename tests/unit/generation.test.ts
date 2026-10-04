import {it,expect} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SdfWorld,terrainHeight,landscapeHeight} from '../../src/world/density';
import {validateSave} from '../../src/save/format';
it('retains the original terrain generator for existing worlds',()=>{
 const old=new GameSimulation().save();old.generator=1;
 const restored=new GameSimulation(validateSave(old));expect(restored.world.heightAt(90,90)).toBe(terrainHeight(90,90));
 expect(restored.save().generator).toBe(1);expect(new GameSimulation().save().generator).toBe(3);
});
it('gives the five regions distinct terrain and creates rift islands',()=>{
 expect(landscapeHeight(0,90)).toBeGreaterThan(terrainHeight(0,90)+4);
 expect(landscapeHeight(90,90)).toBeLessThan(terrainHeight(90,90)-2);
 const world=new SdfWorld(undefined,2);const y=18+Math.sin(-96+96)*3;
 expect(world.density({x:-96,y,z:96})).toBeLessThan(0);expect(world.density({x:-96,y:y-6,z:96})).toBeGreaterThan(0);
});

