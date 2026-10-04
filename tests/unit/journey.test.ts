import { legacySimulation } from '../helpers/legacy';
import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { journeyGoal } from '../../src/game/journey';
import { placementPoint,placementIssue } from '../../src/game/placement';
import { BUILDINGS } from '../../src/content/catalog';
it('guides a new and returning player using real inventory, buildings and boss state',()=>{
 const sim=legacySimulation(),game=sim.adventure;
 expect(journeyGoal(game.snapshot(),sim.player).title).toBe('最初の道具を作ろう');
 game.state.inventory={wood:3,stone:2};expect(journeyGoal(game.snapshot(),sim.player).progress).toBe(1);
 game.action('craft','axe');expect(journeyGoal(game.snapshot(),sim.player).tab).toBe('build');
 game.state.buildings.push({id:123,definition:'bench',x:3,y:sim.groundAt(3,8),z:8,rotation:0,support:3,contents:{}});
 expect(journeyGoal(game.snapshot(),sim.player).title).toContain('石剣');
 game.state.inventory.sword=1;expect(journeyGoal(game.snapshot(),sim.player).target).toEqual({x:0,z:-14});
 game.state.death={x:5,y:1,z:5};game.state.grave={wood:3};expect(journeyGoal(game.snapshot(),sim.player).title).toContain('回収');
});
it('shares placement snapping and invalid-preview rules with the authority',()=>{
 const def=BUILDINGS.find(b=>b.id==='foundation')!,p={x:0,y:0,z:0},at=placementPoint({x:3.2,y:.21,z:2.4});
 expect(at).toEqual({x:3,y:0,z:2});expect(placementIssue(def,p,at,[],{stone:4})).toBe('');
 expect(placementIssue(def,p,at,[],{stone:3})).toContain('素材');
 expect(placementIssue(def,p,p,[],{stone:4})).toContain('自分');
 expect(placementIssue(def,p,{x:20,y:0,z:0},[],{stone:4})).toContain('近く');
});

it('keeps the completed Meadows objective when food expires or tools are stored',()=>{
 const sim=new GameSimulation(),g=sim.adventure;g.state.defeated=['stormstag'];g.state.inventory={};
 expect(journeyGoal(g.snapshot(),sim.player).title).toContain('奉納');g.state.meadows!.offered=true;
 expect(journeyGoal(g.snapshot(),sim.player).title).toContain('試練を越えた');
});
