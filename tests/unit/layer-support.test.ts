import {reconcileCreature} from '../../src/game/meadows/obstacles';
import {dropItem} from '../../src/game/interaction/drops';
import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
it('selects the same voxel supporting surface separately for sky, surface and underground',()=>{const sim=new GameSimulation();expect(sim.groundAt(18,-18,25)).toBeCloseTo(25,2);expect(sim.groundAt(28,14,-10.5)).toBeCloseTo(-10.5,2);expect(sim.groundAt(0,8,sim.player.y)).toBeCloseTo(sim.player.y,1);});
it('keeps the final sky boss on its actual island through authority ticks',()=>{const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[{id:990001,definition:'stormcore',tier:1,x:48,y:29,z:29,homeX:48,homeZ:29,health:260,cooldown:3,windup:0,slow:0,boss:true}];Object.assign(sim.player,{x:48,y:29,z:25});for(let i=0;i<30;i++)sim.step({x:0,z:0,jump:false});expect(sim.adventure.state.enemies[0].y).toBeGreaterThan(28);expect(sim.adventure.state.enemies[0].z).toBeLessThan(28.9);});

it('keeps shared drops on the sky and underground surfaces instead of the surface heightmap',()=>{for(const point of [{x:18,y:25.3,z:-18},{x:28,y:-10.2,z:14}]){const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];dropItem(sim.adventure,'star',2,point);for(let i=0;i<90;i++)sim.step({x:0,z:0,jump:false});const drop=sim.adventure.state.resources.find(n=>n.drop&&n.kind==='star')!;expect(drop.y).toBeCloseTo(point.y-.3+.08,1);}});

it('does not let a cave creature cross a solid three-dimensional pillar',()=>{const sim=new GameSimulation(),from={x:25,y:-10.5,z:28},enemy={id:1,definition:'walker',tier:1,x:26.4,y:-10.5,z:28,homeX:25,homeZ:28,health:48,cooldown:1,windup:0,slow:0,boss:false};reconcileCreature(sim,enemy,from);expect(enemy.x).toBe(25);expect(enemy.y).toBe(-10.5);});
