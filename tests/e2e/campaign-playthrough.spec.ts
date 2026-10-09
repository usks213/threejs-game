import {desktopInputLabel} from './helpers/native-input';
import {test,expect} from '@playwright/test';
import {PlayerControls,read,choosePerformance,gatherAndLightHearth} from './helpers/campaign-controls';

test('campaign playthrough with desktop input or Android touch: gather, light, save and continue',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);
 testInfo.annotations.push({type:'input-mode',description:isMobile?'Actual Android touch gestures':desktopInputLabel()});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await expect(page.locator('#error')).toBeHidden();await choosePerformance(page,isMobile);
 // Each Playwright test gets a fresh browser context. Assert this is genuinely a new journey.
 expect((await read(page)).campaign.flameTier).toBe(0);expect((await read(page)).inventory[4]).toBe(0);expect((await read(page)).inventory[3]).toBe(0);
 if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await gatherAndLightHearth(page,controls);await page.screenshot({path:testInfo.outputPath('hearth-lit.png')});
 }finally{await controls.dispose();}
 await test.step('Save through the real menu, then reload persistent gameplay state',async()=>{
  if(isMobile)await page.locator('#campaign-toggle').tap();else await page.keyboard.press('KeyI');
  await expect(page.locator('#campaign-panel')).toBeVisible();
  const settings=page.getByRole('button',{name:'設定・保存',exact:true});if(isMobile)await settings.tap();else await settings.click();
  await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);
  const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
  const saved=await read(page);await testInfo.attach('saved-gameplay-checkpoint',{body:JSON.stringify({inventory:saved.inventory,campaign:saved.campaign,position:saved.position},null,2),contentType:'application/json'});
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);
  await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');const restored=await read(page);
  expect(restored.campaign.flameTier).toBe(1);expect(restored.inventory).toEqual(saved.inventory);expect(restored.worldSamples).toEqual(saved.worldSamples);expect(restored.campaign.completed).toEqual(saved.campaign.completed);expect(restored.campaign.deaths).toBe(0);
  expect(restored.position.x).toBeCloseTo(saved.position.x,2);expect(restored.position.z).toBeCloseTo(saved.position.z,2);
  if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  await page.screenshot({path:testInfo.outputPath('hearth-continued.png')});
 });
 expect(errors).toEqual([]);
});
