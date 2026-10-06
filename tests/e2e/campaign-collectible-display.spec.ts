import {test,expect,type Locator,type Page} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
import type {CollectibleDisplayState} from '../../src/prototype/core/collectible-display';
const activate=(button:Locator,mobile:boolean)=>mobile?button.tap():button.click();
const displayRead=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as {display:CollectibleDisplayState;home:{storage:{items:Record<string,number>}}});

test('H16/I15 display menu explains actual cost, ownership and equipment effect before construction',async({page,isMobile})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=homestead]'),isMobile);
 await expect(page.locator('[data-item=display-status]')).toContainText('装備の性能は展示中は働きません');const row=page.locator('[data-item=display-build]');await expect(row).toContainText('木材4・石3');await expect(row.locator('[data-command=homestead]')).toBeDisabled();await expect(row).toContainText('先に拠点の炉');
 const bounds=await row.locator('button').boundingBox();expect(bounds?.height).toBeGreaterThanOrEqual(48);
});

test('earned dagger is displayed in real SDF, saved, retrieved once and the empty stand refunds on desktop and touch',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);await activate(page.locator('#start'),isMobile);const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,16,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,12,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
  await controls.walkTo(-3.5,5.3);await controls.aim({x:-3,y:.9,z:4});await expect.poll(async()=>(await read(page)).target).toBe('hearth');await controls.action('[data-action=interact]','KeyE');await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(1);
  await controls.menu('crafting');await controls.row('dagger','craft');const before=(await read(page)).inventory;await activate(page.locator('[data-tab=homestead]'),isMobile);await controls.row('display-build','homestead');expect((await read(page)).inventory[4]).toBe(before[4]-4);expect((await read(page)).inventory[3]).toBe(before[3]-3);
  await controls.row('display-deposit:dagger','homestead');expect((await read(page)).campaign.items.dagger).toBe(0);expect((await displayRead(page)).home.storage.items.dagger).toBe(1);await expect(page.locator('[data-item=display-status]')).toContainText('短剣');await expect(page.locator('[data-item=display-remove] button')).toBeDisabled();
  await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(page.locator('[data-item=dagger] [data-command=craft]')).toBeDisabled();await controls.resume();await controls.walkTo(0,5.3);await controls.walkTo(0,4.1);await controls.aim({x:-1.125,y:1.875,z:2.375});await expect.poll(async()=>(await read(page)).target).toBe('build:home:display-item');await page.screenshot({path:testInfo.outputPath('earned-dagger-on-sdf-display.png')});
  await controls.menu('settings');await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');const stored=(await displayRead(page)).display;
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');expect((await displayRead(page)).display).toEqual(stored);
  await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=homestead]'),isMobile);await expect(page.locator('[data-item=display-withdraw]')).toContainText('耐久 100/100');await controls.row('display-withdraw','homestead');expect((await read(page)).campaign.items.dagger).toBe(1);expect((await displayRead(page)).home.storage.items.dagger).toBe(0);await expect(page.locator('[data-item=display-withdraw]')).toHaveCount(0);await controls.row('display-remove','homestead');expect((await read(page)).inventory).toEqual(before);await expect(page.locator('[data-item=display-remove]')).toHaveCount(0);await page.screenshot({path:testInfo.outputPath('display-retrieved-and-refunded.png')});
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
