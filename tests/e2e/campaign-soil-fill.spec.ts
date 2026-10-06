import {test,expect,type Locator,type Page} from '@playwright/test';
import {expectClearTouchBuildFeedback} from './helpers/hud-layout';
import {observeAttack} from './helpers/transient-observation';
import {PlayerControls,read,choosePerformance,type Point} from './helpers/campaign-controls';
const activate=(button:Locator,mobile:boolean)=>mobile?button.tap():button.click();
const soilRead=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as {soilFill:boolean;soil:{patches:{id:string;position:Point;cost:number}[]};inventory:Record<number,number>;position:Point;saveStatus:string});

test('H04/I04 zero-grant rake fill has visible mode, cost, physical support and finite removal on keyboard/touch',async({page,isMobile},info)=>{
 test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);await activate(page.locator('#start'),isMobile);
 const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  expect(Object.values((await read(page)).inventory).every(n=>n===0)).toBe(true);
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,12,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,8,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
  await controls.walkTo(-3.45,5.25);await controls.interact('hearth',{x:-3,y:.9,z:4});await controls.walkTo(1.6,5.5);
  for(let attempt=0;attempt<5&&(await read(page)).inventory[2]<9;attempt++){await controls.aim({x:1.6,y:.23,z:4.35});const attack=await observeAttack(page);try{await controls.action('[data-action=heavy]','KeyR');await expect.poll(()=>attack.read()).not.toBeNull();}finally{await attack.dispose();}await expect.poll(async()=>(await read(page)).phase,{timeout:60000,intervals:[100]}).toBe('idle');}
  await controls.walkTo(1.6,4.8);await expect.poll(async()=>(await read(page)).inventory[2]).toBeGreaterThanOrEqual(9);
  await controls.menu('crafting');await controls.row('terrain-rake','craft');await activate(page.locator('[data-tab=inventory]'),isMobile);await controls.row('terrain-rake','equip');await controls.resume();await expect(page.locator('#element-switch')).toContainText('削る');
  await controls.walkTo(1.6,5.8);await controls.walkTo(0,6.2);await controls.aim({x:0,y:.25,z:4.85});await controls.action('#element-switch','KeyF');await expect(page.locator('#element-switch')).toContainText('盛土');await expect(page.locator('#recipe-cost')).toContainText('土9');await expect(page.locator('#prompt')).toContainText('平らな盛土');
  if(isMobile){
   for(const size of [{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(size);await expect(page.locator('body')).toHaveClass(/soil-fill-mode/);
    await expectClearTouchBuildFeedback(page);
    await page.screenshot({path:info.outputPath(`rake-soil-feedback-${size.width}.png`)});
   }
   await page.setViewportSize({width:844,height:390});
  }
  const before=(await read(page)).inventory[2];await controls.action('[data-action=attack]','KeyT');await expect.poll(async()=>(await soilRead(page)).soil.patches.length).toBe(1);expect((await read(page)).inventory[2]).toBe(before-9);const target=(await soilRead(page)).soil.patches[0].position;
  await controls.walkTo(target.x,target.z);await expect.poll(async()=>(await read(page)).position.y).toBeGreaterThan(.45);await page.screenshot({path:info.outputPath('rake-soil-step-standing.png')});
  await controls.walkTo(target.x,6.2);await controls.aim(target);await controls.action('[data-action=heavy]','KeyR');await expect.poll(async()=>(await soilRead(page)).soil.patches.length).toBe(0);expect((await read(page)).inventory[2]).toBe(before);
  await controls.action('#cast','KeyG');await expect(page.locator('#element-switch')).toContainText('削る');await controls.menu('settings');await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');expect((await soilRead(page)).soil.patches).toEqual([]);expect((await read(page)).inventory[2]).toBe(before);
 }finally{await controls.dispose();}expect(errors).toEqual([]);
});

test('rake crafting help and remappable gamepad mode/removal labels expose the finite soil rules',async({page,isMobile})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(page.locator('[data-item=terrain-rake]')).toContainText('土9');await expect(page.locator('[data-item=terrain-rake]')).toContainText('無傷');await activate(page.locator('[data-tab=settings]'),isMobile);
 await expect(page.getByRole('combobox',{name:'属性/熊手モード切替のコントローラーボタン',exact:true})).toHaveValue('3');await expect(page.getByRole('combobox',{name:'建築/盛土を撤去のコントローラーボタン',exact:true})).toHaveValue('14');
});
