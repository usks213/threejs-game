import { it,expect } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { applySkyEffects } from '../../src/game/skybound-effects';
import type { SkyEffect } from '../../src/game/skybound/types';
it('applies one enemy-only elemental hit and respects solid-world occlusion',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.resources=[];sim.adventure.state.buildings=[];
 sim.adventure.state.enemies=[{id:12,definition:'walker',tier:1,x:0,y:4,z:-3,homeX:0,homeZ:-3,health:100,cooldown:0,windup:0,slow:0,boss:false}];
 const effect:SkyEffect={id:'1',tick:1,sourcePart:1,owner:'host',element:'shock',origin:{x:0,y:4.7,z:0},direction:{x:0,y:0,z:-1},range:5,radius:.3,damage:8,targets:'enemies'};
 sim.world.density=()=>1;const health=sim.adventure.state.health;applySkyEffects(sim,[effect]);expect(sim.adventure.state.enemies[0].health).toBe(92);expect(sim.adventure.state.health).toBe(health);
 sim.world.density=p=>p.z<-1&&p.z>-2?-1:1;applySkyEffects(sim,[effect]);expect(sim.adventure.state.enemies[0].health).toBe(92);
});
it('applies zero-direction short-circuit pulses to nearby enemies without hurting players',()=>{const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.resources=[];sim.adventure.state.buildings=[];sim.world.density=()=>1;const p=sim.player;sim.adventure.state.enemies=[{id:44,definition:'walker',tier:1,x:p.x+.5,y:p.y,z:p.z,homeX:p.x,homeZ:p.z,health:50,cooldown:0,windup:0,slow:0,boss:false}];const hp=sim.adventure.state.health;applySkyEffects(sim,[{id:'pulse',tick:1,sourcePart:1,owner:'host',element:'shock',origin:{x:p.x,y:p.y+.7,z:p.z},direction:{x:0,y:0,z:0},range:0,radius:1.2,damage:6,targets:'enemies'}]);expect(sim.adventure.state.enemies[0].health).toBe(44);expect(sim.adventure.state.health).toBe(hp);});
