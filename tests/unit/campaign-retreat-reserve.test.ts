import {describe,it,expect,vi} from 'vitest';
import type {Page} from '@playwright/test';
import {PlayerControls,type CampaignProbe} from '../e2e/helpers/campaign-controls';
import {CombatRecoveryNeeded} from '../e2e/helpers/combat-navigation';

// Exercise the real driver methods with deterministic observations. Only browser
// transport/locator assertions are replaced; this is not a gameplay fixture.
vi.mock('@playwright/test',()=>({
 test:{},
 expect:Object.assign((value:unknown,message?:string)=>{
  if(typeof value==='object'&&value!==null&&'selector' in value)return {
   toBeHidden:async()=>expect(value).toEqual({selector:'#death'}),
   toHaveAttribute:async(name:string,expected:string)=>{expect(value).toEqual({selector:'#game'});expect([name,expected]).toEqual(['data-running','true']);},
  };
  return expect(value,message);
 },{poll:(read:()=>Promise<unknown>)=>({
  toBe:async(expected:unknown)=>expect(await read()).toBe(expected),
  toBeGreaterThan:async(expected:number)=>expect(await read()).toBeGreaterThan(expected),
 })}),
}));

function harness(stamina=23.85){
 const state:Pick<CampaignProbe,'position'|'hp'|'stamina'|'phase'|'seconds'|'yaw'|'pitch'|'enemies'>={
  position:{x:0,y:0,z:0},hp:100,stamina,phase:'idle',seconds:0,yaw:0,pitch:0,
  enemies:[{position:{x:1,y:0,z:0},hp:100,phase:'recover',time:0}],
 };
 let moving=false;
 const page={evaluate:vi.fn(async()=>{if(moving){state.seconds+=3;state.position.z+=.7;state.stamina=95;}return structuredClone(state);}),locator:(selector:string)=>({selector})} as unknown as Page;
 const controls=new PlayerControls(page,false);
 const shield=vi.spyOn(controls,'shield').mockResolvedValue();
 const move=vi.spyOn(controls,'moveAxes').mockImplementation(async(x,z)=>{moving=!!(x||z);});
 const look=vi.spyOn(controls,'keyboardAim').mockImplementation(async(point,reserve)=>{
  expect(reserve).toBe(0);state.yaw=Math.atan2(state.position.x-point.x,state.position.z-point.z);
 });
 const aim=vi.spyOn(controls,'aim');
 return {state,controls,shield,move,look,aim};
}
const threat={x:1,y:1.52,z:0};

describe('defensive retreat preserves offensive reserve checks',()=>{
 it.each([41.85,23.85,5.85,0])('offensive aim still aborts below its reserve at stamina %s',async(stamina)=>{
  const h=harness(stamina);
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
  expect(h.look).not.toHaveBeenCalled();expect(h.shield).not.toHaveBeenCalled();
 });
 it('offensive aim passes its reserve through to backend corrections',async()=>{
  const h=harness(59.85);h.look.mockResolvedValue();
  await h.controls.aim(threat,true,55);
  expect(h.look).toHaveBeenCalledWith(threat,55);
 });
 it.each([41.85,23.85,5.85,0])('retreat can aim and move at stamina %s without changing later offensive checks',async(stamina)=>{
  const h=harness(stamina);
  await h.controls.retreat();
  expect(h.aim).toHaveBeenCalledWith(threat,true);
  expect(h.look).toHaveBeenCalledWith(threat,0);expect(h.shield).toHaveBeenCalledWith(true);
  expect(h.move.mock.calls.some(([x,z])=>!!(x||z))).toBe(true);expect(h.move).toHaveBeenLastCalledWith(0,0);
  expect(h.state.position.z).toBeGreaterThan(.6);expect(h.state.seconds).toBeGreaterThan(2.6);expect(h.state.stamina).toBeGreaterThan(90);
  h.state.stamina=stamina;
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
 });
 it('releases movement on recovery aim failure and keeps offensive checks',async()=>{
  const h=harness(),failure=Error('Look transport failed');h.look.mockRejectedValueOnce(failure);
  await expect(h.controls.retreat()).rejects.toBe(failure);
  expect(h.move).toHaveBeenLastCalledWith(0,0);
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
 });
 it('keeps offensive checks even if recovery movement cleanup throws',async()=>{
  const h=harness(),failure=Error('Movement release failed'),move=h.move.getMockImplementation()!;let releases=0;
  h.move.mockImplementation(async(x,z)=>{if(!x&&!z&&++releases===3)throw failure;await move(x,z);});
  await expect(h.controls.retreat()).rejects.toBe(failure);
  expect(h.state.stamina).toBeGreaterThan(90);h.state.stamina=23.85;
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
 });
 it('keeps offensive checks when the initial shield assertion fails',async()=>{
  const h=harness(),failure=Error('Shield not held');h.shield.mockRejectedValueOnce(failure);
  await expect(h.controls.retreat()).rejects.toBe(failure);
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
 });
 it('still fails health checks instead of masking death as stamina recovery',async()=>{
  const h=harness();h.state.hp=0;
  await expect(h.controls.retreat()).rejects.toThrow('Stamina recovery must remain on safe terrain');
  expect(h.look).not.toHaveBeenCalled();expect(h.move).toHaveBeenLastCalledWith(0,0);
  await expect(h.controls.aim(threat,true,55)).rejects.toBeInstanceOf(CombatRecoveryNeeded);
 });
});
