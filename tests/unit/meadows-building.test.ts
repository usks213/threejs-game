import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { surfaceHeight } from '../../src/game/meadows/building-shapes';
import { stepVillage } from '../../src/game/meadows/village';
it('builds a cooking station above a fire and keeps a raft supported over water',()=>{const sim=new GameSimulation(undefined,3),g=sim.adventure,p=sim.player;g.state.buildings=[];g.state.inventory={hammer:1,wood:100,stone:50};g.action('build','fire',{x:p.x+3,y:p.y,z:p.z});g.action('build','cook',{x:p.x+3,y:p.y+.65,z:p.z});expect(g.state.buildings).toHaveLength(2);g.state.buildings.push({id:sim.allocateEntityId(),definition:'raft',x:0,y:10,z:10,rotation:0,support:4,contents:{}});g.support();expect(g.state.buildings.some(b=>b.definition==='raft')).toBe(true);});
it('uses sloped roof and stair surfaces rather than filling their bounding boxes',()=>{const b={id:1,definition:'roof45',x:0,y:2,z:0,rotation:0,support:2,contents:{}};expect(surfaceHeight(b,0,-1)).toBeCloseTo(2.12);expect(surfaceHeight(b,0,1)).toBeCloseTo(4.12);b.definition='stairs';expect(surfaceHeight(b,0,0)).toBe(3);});
it('respawns village defenders until their source is destroyed',()=>{const sim=new GameSimulation(undefined,3),g=sim.adventure,pile=g.state.resources.find(n=>n.kind==='bodyPile')!;Object.assign(sim.player,pile);g.state.enemies=[];stepVillage(g,6);expect(g.state.enemies).toHaveLength(1);pile.ready=1e10;stepVillage(g,60);expect(g.state.enemies).toHaveLength(1);});

it('returns the actual meadow recipe on collapse and preserves level edits in saves',()=>{
 const sim=new GameSimulation(undefined,3),g=sim.adventure;g.state.buildings=[];g.state.inventory={hammer:1,wood:2,hoe:1};const p=sim.player;
 g.action('build','floor',{x:p.x+3,y:p.y+5,z:p.z});expect(g.state.inventory.wood).toBe(0);expect(g.state.resources.filter(n=>n.drop&&n.kind==='wood').reduce((total,n)=>total+n.amount,0)).toBe(2);expect(g.state.buildings).toHaveLength(0);
 p.y=sim.groundAt(p.x,p.z);const target={x:p.x+2,y:sim.groundAt(p.x+2,p.z),z:p.z};g.action('landscape','level',target);
 const h=sim.groundAt(target.x,target.z);expect(sim.world.density({x:target.x+.5,y:h+.1,z:target.z})).toBeGreaterThan(0);expect(sim.world.density({x:target.x+.5,y:h-.1,z:target.z})).toBeLessThan(0);
 const restored=new GameSimulation(sim.save());expect(restored.groundAt(target.x,target.z)).toBeCloseTo(h);expect(restored.world.soilAt({x:target.x,y:h,z:target.z})).toBe(true);
});
