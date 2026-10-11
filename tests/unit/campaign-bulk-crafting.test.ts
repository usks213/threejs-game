import {describe,it,expect,vi} from 'vitest';
import {CampaignSystem,CAMPAIGN_POINTS} from '../../src/prototype/core/campaign';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {campaignRecipeRows,campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {craftingSelection} from '../../src/prototype/campaign-ui';
import {executeGameCommand,isGameCommand} from '../../src/prototype/campaign-commands';
import {defaultSettings} from '../../src/prototype/campaign-session';
const hearth={...CAMPAIGN_POINTS.find(p=>p.id==='hearth')!.position};
const setup=()=>new CampaignSystem({2:0,3:100,4:100,6:100,7:100,10:100});
const recipe=(c:CampaignSystem,id:string,position=hearth)=>campaignRecipeRows(c,position).find(r=>r.id===id)!.craft!;

describe('C08 authoritative bulk recipe display',()=>{
 it('omits bulk detail work when the crafting panel is not requested',()=>{
  const c=setup(),check=vi.spyOn(c,'recipeStatus'),rows=campaignRecipeRows(c,hearth,false);
  expect(rows.every(row=>row.craft===undefined)).toBe(true);expect(check).toHaveBeenCalledTimes(rows.length);
  check.mockClear();campaignRecipeRows(c,hearth);expect(check).toHaveBeenCalledTimes(rows.length*20);
 });
 it('reports exact total materials and output while bounded to 20 batches',()=>{
  const c=setup(),before=c.snapshot(),materials={...c.materials},arrows=recipe(c,'arrows'),selection=craftingSelection(arrows,'3');
  expect(arrows.maxCount).toBe(20);expect(selection).toMatchObject({count:3,ok:true,outputCount:24});
  expect(selection.costs).toEqual([{label:'石',perCraft:1,owned:100,total:3},{label:'木材',perCraft:1,owned:100,total:3}]);
  expect(c.snapshot()).toEqual(before);expect(c.materials).toEqual(materials);
  expect(c.craft('arrows',hearth,selection.count!).ok).toBe(true);
  expect(c.state.items.arrows).toBe(selection.outputCount);expect(c.materials[3]).toBe(97);expect(c.materials[4]).toBe(97);
 });
 it('derives max from each material and retains unavailable chosen totals',()=>{
  const c=setup();c.materials[3]=5;c.materials[4]=2;
  const craft=recipe(c,'arrows');expect(craft.maxCount).toBe(2);
  const selected=craftingSelection(craft,'3');expect(selected.ok).toBe(false);expect(selected.outputCount).toBe(24);expect(selected.message).toContain('木材 2/3');
  c.materials[4]=0;expect(recipe(c,'arrows').maxCount).toBe(0);expect(craftingSelection(recipe(c,'arrows'),'1').ok).toBe(false);
 });
 it('limits whole-output batches at the stack edge and never adds a partial batch',()=>{
  const c=setup();c.state.items.arrows=184;
  expect(recipe(c,'arrows').maxCount).toBe(2);expect(recipe(c,'arrows').output).toMatchObject({perCraft:8,owned:184,stackLimit:200});
  expect(c.craft('arrows',hearth,2).ok).toBe(true);expect(c.state.items.arrows).toBe(200);expect(recipe(c,'arrows').maxCount).toBe(0);
  c.state.items.arrows=197;const before=c.snapshot(),materials={...c.materials};
  expect(recipe(c,'arrows').maxCount).toBe(0);expect(c.craft('arrows',hearth,1).ok).toBe(false);expect(c.snapshot()).toEqual(before);expect(c.materials).toEqual(materials);
  c.state.items['fish-bait']=97;expect(recipe(c,'fish-bait').maxCount).toBe(1);c.state.items['fish-bait']=98;expect(recipe(c,'fish-bait').maxCount).toBe(0);
  expect(recipe(c,'fishing-rod').maxCount).toBe(1);c.state.items['fishing-rod']=1;expect(recipe(c,'fishing-rod').maxCount).toBe(0);
 });
 it('multiplies all material and item ingredients before an atomic commit',()=>{
  const c=setup();c.state.flameTier=1;c.materials[4]=10;c.state.items.silverfin=3;c.state.items.herbs=2;
  const craft=recipe(c,'herb-fish-soup'),selection=craftingSelection(craft,'2');expect(craft.maxCount).toBe(2);
  expect(selection.outputCount).toBe(2);expect(selection.costs).toEqual([{label:'木材',perCraft:1,owned:10,total:2},{label:'澄鰭魚',perCraft:1,owned:3,total:2},{label:'摘みたての薬草',perCraft:1,owned:2,total:2}]);
  const before=c.snapshot(),materials={...c.materials};expect(c.craft('herb-fish-soup',hearth,3).ok).toBe(false);expect(c.snapshot()).toEqual(before);expect(c.materials).toEqual(materials);
  expect(c.craft('herb-fish-soup',hearth,2).ok).toBe(true);expect(c.state.items['herb-fish-soup']).toBe(2);expect(c.state.items.silverfin).toBe(1);expect(c.state.items.herbs).toBe(0);expect(c.materials[4]).toBe(8);
 });
 it('rejects a failed material cost without touching item ingredients, outputs, or progression',()=>{
  const c=setup();c.state.flameTier=1;c.materials[4]=1;c.state.items.silverfin=4;c.state.items.herbs=4;
  const before=c.snapshot(),materials={...c.materials};expect(c.craft('herb-fish-soup',hearth,2).ok).toBe(false);expect(c.snapshot()).toEqual(before);expect(c.materials).toEqual(materials);
 });
 it('keeps maximum zero for unavailable stations, artisan gates, and proximity',()=>{
  const c=setup();expect(recipe(c,'berry-meal').maxCount).toBe(0);expect(recipe(c,'berry-meal').statuses[0].message).toContain('点火');
  c.state.flameTier=1;expect(recipe(c,'berry-meal').maxCount).toBe(20);expect(recipe(c,'iron-blade').maxCount).toBe(0);
  c.state.artisanRescued=true;expect(recipe(c,'iron-blade').maxCount).toBe(1);expect(recipe(c,'berry-meal',{x:100,y:0,z:100}).maxCount).toBe(0);
 });
 it.each(['',' ','0','-1','1.5','21','99999999999999999','Infinity','NaN','oops'])('disables invalid quantity %j without inventing zero-cost output',draft=>{
  const selected=craftingSelection(recipe(setup(),'arrows'),draft);expect(selected.count).toBeNull();expect(selected.ok).toBe(false);expect(selected.outputCount).toBeNull();expect(selected.costs.every(c=>c.total===null)).toBe(true);
 });
 it('recalculates a preserved chosen quantity against refreshed inventory',()=>{
  const c=setup(),draft='7';expect(craftingSelection(recipe(c,'arrows'),draft).ok).toBe(true);c.materials[4]=6;
  const next=craftingSelection(recipe(c,'arrows'),draft);expect(next.count).toBe(7);expect(next.outputCount).toBe(56);expect(next.ok).toBe(false);
 });
});

describe('bulk craft command boundary',()=>{
 it.each([1,2,20])('accepts a craft-only count %i',count=>expect(isGameCommand({type:'craft',id:'arrows',count})).toBe(true));
 it('accepts legacy one-batch commands and rejects arbitrary or inherited keys',()=>{
  expect(isGameCommand({type:'craft',id:'arrows'})).toBe(true);
  for(const value of [{type:'craft',id:'arrows',count:2,materials:{4:99}},{type:'craft',id:'arrows',output:99},{type:'equip',id:'bow',count:1},{type:'gear',id:'fishing-rod',count:1},{type:'consume',id:'bandage',count:1},{type:'learn',id:'vigor',count:1},{type:'travel',id:'hearth',count:1},{type:'homestead',id:'deposit:4',count:1},{type:new String('craft'),id:'arrows'},Object.create({type:'craft',id:'arrows'}),JSON.parse('{"type":"craft","id":"arrows","__proto__":{"count":2}}'),{type:'craft',id:'arrows',[Symbol('extra')]:1}])expect(isGameCommand(value)).toBe(false);
 });
 it.each([undefined,null,'2',true,0,-1,1.1,21,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects an explicitly invalid count %j',count=>expect(isGameCommand({type:'craft',id:'arrows',count})).toBe(false));
 it('executes exactly one atomic transaction with the requested count, including guest actor context',()=>{
  const sim=new CoreSimulation(true,false,true);sim.survival.inventory[3]=10;sim.survival.inventory[4]=10;
  const craft=vi.spyOn(sim.campaign,'craft');expect(executeGameCommand(sim,{type:'craft',id:'arrows',count:3}).ok).toBe(true);
  expect(craft).toHaveBeenCalledExactlyOnceWith('arrows',sim.player.position,3);expect(sim.campaign.state.items.arrows).toBe(24);expect(sim.survival.inventory[4]).toBe(7);
  craft.mockClear();sim.enableCompanion();sim.withCompanion(()=>expect(executeGameCommand(sim,{type:'craft',id:'arrows',count:2}).ok).toBe(true));
  expect(craft).toHaveBeenCalledTimes(1);expect(craft.mock.calls[0][2]).toBe(2);expect(sim.campaign.state.items.arrows).toBe(40);expect(sim.survival.inventory[4]).toBe(5);
  craft.mockClear();expect(executeGameCommand(sim,{type:'craft',id:'arrows'}).ok).toBe(true);expect(craft).toHaveBeenCalledTimes(1);expect(sim.campaign.state.items.arrows).toBe(48);expect(sim.survival.inventory[4]).toBe(4);
 });
 it('preserves the fishing-rod inventory action and blocks bulk craft after death',()=>{
  const sim=new CoreSimulation(true,false,true);sim.campaign.state.items['fishing-rod']=1;sim.survival.inventory[3]=10;sim.survival.inventory[4]=10;
  const snapshot=campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[]);expect(snapshot.items.find(r=>r.id==='fishing-rod')?.action).toBe('gear');
  expect(executeGameCommand(sim,{type:'gear',id:'fishing-rod'}).ok).toBe(true);expect(sim.fishing.selected).toBe(true);
  sim.player.hp=0;const before=sim.campaign.snapshot(),materials={...sim.survival.inventory};expect(executeGameCommand(sim,{type:'craft',id:'arrows',count:2}).ok).toBe(false);expect(sim.campaign.snapshot()).toEqual(before);expect(sim.survival.inventory).toEqual(materials);
 });
});
