import {it,expect} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
const idle={x:0,z:0,jump:false},aim={x:0,y:0,z:-1};
it('makes a fast landing harmful while a wing-controlled landing stays safe',()=>{for(const wing of[false,true]){const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];Object.assign(sim.player,{x:5,y:12,z:8,grounded:false,vy:-12});if(wing)sim.adventure.action('glide','on',undefined,aim);const before=sim.adventure.state.health;for(let i=0;i<240&&!sim.player.grounded;i++)sim.step(idle);if(wing)expect(sim.adventure.state.health).toBe(before);else expect(sim.adventure.state.health).toBeLessThan(before);}});
it('folds the wing into a dive and reopens into controlled descent or forward lift before a safe landing',()=>{
 const sim=new GameSimulation(),health=sim.adventure.state.health;Object.assign(sim.player,{y:15,grounded:false});
 sim.adventure.action('glide','on',undefined,aim);sim.adventure.action('glide','dive',undefined,aim);
 expect(sim.adventure.traversal.gliding).toBe(false);expect(sim.player.vy).toBe(-12);
 sim.adventure.action('glide','on',undefined,aim);sim.adventure.traversal.beforeMove(idle,1/30);
 expect(sim.adventure.traversal.gliding).toBe(true);expect(sim.player.vy).toBeCloseTo(-3.4);
 sim.player.vy=-12;sim.adventure.traversal.beforeMove({x:1,z:0,jump:false},1/30);expect(sim.player.vy).toBeCloseTo(-.4);
 for(let tick=0;tick<240&&!sim.player.grounded;tick++)sim.step(idle);
 expect(sim.player.grounded).toBe(true);expect(sim.adventure.state.health).toBe(health);
});
it('mantles a low ledge after climbing instead of dropping as soon as the wall ends',()=>{const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];sim.world.density=p=>Math.max(p.x<1?1:-1,p.y-2);Object.assign(sim.player,{x:.6,y:1.2,z:0,heading:Math.PI/2,vy:0,grounded:false});sim.adventure.traversal.climbing=true;const result=sim.adventure.traversal.beforeMove(idle,1/30);expect(result.handled).toBe(true);expect(sim.player.x).toBeGreaterThan(1);expect(sim.player.y).toBeGreaterThan(2);expect(sim.adventure.traversal.climbing).toBe(false);});
