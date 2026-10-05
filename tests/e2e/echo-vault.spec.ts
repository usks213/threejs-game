import {test,expect,type Page} from '@playwright/test';
import type {EchoVaultState,VaultTrapPhase} from '../../src/prototype/core/echo-vault';
import {PlayerControls,read,choosePerformance,type CampaignProbe} from './helpers/campaign-controls';
const vaultRead=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as CampaignProbe&{dungeon:EchoVaultState;dungeonCrustCleared:boolean;dungeonTrapPhase:VaultTrapPhase});

test('seal vault uses real PC/Android input for clue, mining, safe trap lane, keyed gate, unique reward, exit and reload',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect(page.locator('#error')).toBeHidden();await choosePerformance(page,isMobile);
 expect((await read(page)).inventory[3]).toBe(0);expect((await read(page)).campaign.flameTier).toBe(0);expect((await vaultRead(page)).dungeon.rewardTaken).toBe(false);
 if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();const controls=new PlayerControls(page,isMobile);await controls.initialize();
 const interact=async(id:string,point:{x:number;y:number;z:number})=>{await controls.aim(point);await expect(page.locator('#game')).toHaveAttribute('data-target',id);await controls.action('[data-action="interact"]','KeyE');};
 try{
  await controls.walkTo(8.5,6);await controls.walkTo(8.5,9);await interact('vault-note',{x:6.5,y:1,z:9});await expect.poll(async()=>(await vaultRead(page)).dungeon.clue).toBe(true);
  await controls.walkTo(8.5,11.35);await controls.walkTo(7.5,11.35);await controls.action('#tool-switch','Digit2');await expect.poll(async()=>(await read(page)).tool).toBe(true);
  for(let i=0;i<16&&!(await vaultRead(page)).dungeonCrustCleared;i++){
   await controls.aim({x:6.5,y:.95,z:11.4});await expect(page.locator('#game')).toHaveAttribute('data-target','vault-crust');await controls.action('[data-action="heavy"]','KeyR');await expect.poll(async()=>(await read(page)).phase,{intervals:[50,100]}).not.toBe('idle');await expect.poll(async()=>(await read(page)).phase,{timeout:60000}).toBe('idle');
  }
  expect((await vaultRead(page)).dungeonCrustCleared).toBe(true);await interact('vault-key',{x:6.5,y:1,z:11.95});await expect.poll(async()=>(await read(page)).campaign.items['echo-vault-key']).toBe(1);
  await controls.walkTo(8.5,11.35);await controls.walkTo(10,11.35);await controls.aim({x:8.25,y:.35,z:13});await expect.poll(async()=>(await vaultRead(page)).dungeonTrapPhase,{timeout:90000,intervals:[100]}).toBe('warning');await page.screenshot({path:testInfo.outputPath('seal-vault-warning-and-side-lane.png')});
  const hp=(await read(page)).hp;await interact('vault-brake',{x:10.6,y:1,z:12.1});await expect.poll(async()=>(await vaultRead(page)).dungeon.disarmed).toBe(true);
  await controls.walkTo(10,13.6);await interact('vault-switch',{x:10.6,y:1,z:14.4});await expect.poll(async()=>(await vaultRead(page)).dungeon.gateOpen).toBe(true);expect((await read(page)).campaign.items['echo-vault-key']).toBe(0);
  await controls.walkTo(8.5,13.6);await controls.walkTo(8.5,16.2);await interact('vault-cache',{x:8.5,y:.7,z:17.8});await expect.poll(async()=>(await read(page)).campaign.items['echo-vault-seal']).toBe(1);await interact('vault-cache',{x:8.5,y:.7,z:17.8});expect((await read(page)).campaign.items['echo-vault-seal']).toBe(1);await page.screenshot({path:testInfo.outputPath('seal-vault-reward.png')});
  for(const [x,z] of [[8.5,13.6],[10,13.6],[10,11.35],[8.5,11.35],[8.5,9],[8.5,6],[0,6]])await controls.walkTo(x,z);
  expect((await read(page)).hp).toBe(hp);expect((await read(page)).campaign.deaths).toBe(0);
  await controls.menu('settings');const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');const saved=await vaultRead(page);
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');const restored=await vaultRead(page);expect(restored.dungeon).toEqual(saved.dungeon);expect(restored.campaign.items['echo-vault-seal']).toBe(1);expect(restored.inventory).toEqual(saved.inventory);expect(restored.position.x).toBeCloseTo(saved.position.x,2);expect(restored.position.z).toBeCloseTo(saved.position.z,2);
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
