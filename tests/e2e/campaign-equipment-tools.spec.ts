import {test,expect,type Locator} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
const activate=(button:Locator,mobile:boolean)=>mobile?button.tap():button.click();

test('I04/I06/I08 recipes and equipment slots explain real controls and restrictions on desktop and touch',async({page,isMobile})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);
 for(const id of ['wood-axe','stone-pick','terrain-rake','build-hammer','greatsword','dagger','cloth-hood','cloth-leggings','copper-shield','traveler-ring']){
  const row=page.locator('[data-item="'+id+'"]');await expect(row).toBeVisible();await expect(row.locator('[data-command=craft]')).toBeDisabled();
 }
 await expect(page.locator('[data-item=greatsword]')).toContainText('盾は併用不可');await expect(page.locator('[data-item=terrain-rake]')).toContainText('土・草だけ');
 await activate(page.locator('[data-tab=equipment]'),isMobile);
 for(const slot of ['head','armor','legs','shield','tool','charm'])await expect(page.locator('[data-item="unequip:'+slot+'"]')).toBeVisible();
 await expect(page.locator('[data-item="unequip:shield"]')).toContainText('旅の木盾');
});

test('crafted pick is selected through normal inventory, uses actual attack input, and survives menu save/reload',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);await activate(page.locator('#start'),isMobile);
 const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,6,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8}],'sample-stone');
  await controls.menu('crafting');await controls.row('stone-pick','craft');await activate(page.locator('[data-tab=inventory]'),isMobile);await controls.row('stone-pick','equip');
  expect((await read(page)).campaign.equipment.tool).toBe('stone-pick');await controls.resume();await expect(page.locator('#tool-switch')).toContainText('つるはし');
  await controls.walkTo(-3.45,5.25);await controls.walkTo(2.5,5.25);await controls.walkTo(2.5,5.75);await controls.gather(6,4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1}],'sample-metal');
  await controls.menu('equipment');await expect(page.locator('[data-item="repair:stone-pick"]')).not.toContainText('耐久 100/100');
  await activate(page.locator('[data-tab=settings]'),isMobile);await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
  const before=await read(page);await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');expect((await read(page)).campaign.equipment.tool).toBe('stone-pick');expect((await read(page)).inventory).toEqual(before.inventory);
  await page.screenshot({path:testInfo.outputPath('crafted-pick-restored.png')});
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
