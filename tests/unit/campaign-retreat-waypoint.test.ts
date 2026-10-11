import {describe,it,expect,vi} from 'vitest';
import type {Page} from '@playwright/test';
import {PlayerControls,type CampaignProbe} from '../e2e/helpers/campaign-controls';
import {waypointAxes} from '../e2e/helpers/combat-navigation';

// Real retreat control flow; only browser observations and input transport are
// deterministic. This fixture never alters a running game's state.
vi.mock('@playwright/test',()=>({
 test:{},
 expect:Object.assign(expect,{poll:(read:()=>Promise<unknown>)=>({
  toBeGreaterThan:async(expected:number)=>expect(await read()).toBeGreaterThan(expected),
 })}),
}));

type Motion=Pick<CampaignProbe,'position'|'hp'|'stamina'|'phase'|'seconds'|'yaw'|'pitch'|'enemies'>;
function state(x:number,z:number,enemyX:number,enemyZ:number,seconds=0,stamina=41):Motion {
 return {position:{x,y:.25,z},hp:100,stamina,phase:'idle',seconds,yaw:0,pitch:0,
  enemies:[{position:{x:enemyX,y:.25,z:enemyZ},hp:36,phase:'recover',time:0}]};
}
function harness(states:Motion[]){
 let index=0,moving=false,observed=false;
 const motions:{axes:{x:number;z:number};from:Motion}[]=[];
 const page={evaluate:vi.fn(async()=>{
  if(moving&&!observed){index=Math.min(index+1,states.length-1);observed=true;}
  return structuredClone(states[index]);
 })} as unknown as Page;
 const controls=new PlayerControls(page,false);
 const shield=vi.spyOn(controls,'shield').mockResolvedValue();
 const aim=vi.spyOn(controls,'aim').mockResolvedValue();
 const move=vi.spyOn(controls,'moveAxes').mockImplementation(async(x,z)=>{
  moving=!!(x||z);observed=false;
  if(moving)motions.push({axes:{x,z},from:structuredClone(states[index])});
 });
 return {controls,shield,aim,move,motions};
}
const recovered=state(4.8,5.3,1,3.5,3.1,95);
const right={x:4.8,z:5.3},left={x:-3.8,z:5.3};

describe('retreat keeps its chosen physical leg until arrival or a stall',()=>{
 // Exact-head ace7028754b0fdd6939c9e12b68aafb0317849df traces:
 // https://github.com/usks213/threejs-game/actions/runs/38134608277
 // The enemy crosses the lane's x=.5 midpoint while the player is still
 // heading right. Rechoosing the farther endpoint reverses into the pursuer.
 it.each([
  {route:'chapter: player (1.911,5.318), enemy (.557,4.094), job 114457098255',
   start:state(.005,5.276,.001,2.214,0,70.7),crossed:state(1.911,5.318,.557,4.094,.2,60.8)},
  {route:'regional: player (1.394,5.408), enemy (.515,3.700), job 114457098335',
   start:state(-.002,5.321,-.002,2.006,0,66.2),crossed:state(1.394,5.408,.515,3.7,.2,83.3)},
 ])('does not reverse before the selected endpoint: $route',async({start,crossed})=>{
  const h=harness([start,crossed,recovered]);await h.controls.retreat();
  expect(h.motions).toHaveLength(2);
  expect(h.motions[0].axes).toEqual(waypointAxes(start.position,start.yaw,right));
  expect(h.motions[1].axes).toEqual(waypointAxes(crossed.position,crossed.yaw,right));
  expect(h.motions[1].axes.x).toBeGreaterThan(0);
  expect(h.move).toHaveBeenLastCalledWith(0,0);
 });
 it('does not count a point outside the existing .12m settlement tolerance as arrival',async()=>{
  const start=state(0,5.3,0,3),almost=state(4.67,5.3,2,3,.2);
  const h=harness([start,almost,recovered]);await h.controls.retreat();
  expect(h.motions[1].axes).toEqual(waypointAxes(almost.position,almost.yaw,right));
 });
 it('selects the next leg after actual arrival inside the existing .12m tolerance',async()=>{
  const start=state(0,5.3,0,3),arrived=state(4.69,5.3,2,3,.2);
  const h=harness([start,arrived,state(4,5.3,2,3,3.1,95)]);await h.controls.retreat();
  expect(h.motions[1].axes).toEqual(waypointAxes(arrived.position,arrived.yaw,left));
 });
 it('advances from the doorway leg to the bounded cross-lane after arrival',async()=>{
  const start=state(0,3.319,0,1.803),arrived=state(0,5.22,0,2.214,.2);
  const h=harness([start,arrived,recovered]);await h.controls.retreat();
  expect(h.motions[0].axes).toEqual(waypointAxes(start.position,start.yaw,{x:0,z:5.3}));
  expect(h.motions[1].axes).toEqual(waypointAxes(arrived.position,arrived.yaw,right));
 });
 it('permits replanning after observed displacement below the unchanged .025m stall threshold',async()=>{
  const start=state(0,5.3,0,3),stalled=state(.01,5.3,1,3,.2);
  const h=harness([start,stalled,state(-1,5.3,1,3,3.1,95)]);await h.controls.retreat();
  expect(h.motions[1].axes).toEqual(waypointAxes(stalled.position,stalled.yaw,left));
  expect(h.shield).toHaveBeenCalledWith(true);expect(h.move).toHaveBeenLastCalledWith(0,0);
 });
 it('does not reset consecutive stalls when replanning and still fails at eight',async()=>{
  const h=harness(Array.from({length:9},(_,i)=>state(0,5.3,i%2?1:0,3,i*.2)));
  await expect(h.controls.retreat()).rejects.toThrow('Retreat must produce observed displacement instead of pushing into a wall');
  expect(h.motions).toHaveLength(8);expect(h.move).toHaveBeenLastCalledWith(0,0);
 });
});
