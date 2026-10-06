import {desktopInputLabel} from './helpers/native-input';
import {test,expect,type Locator} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();

test('C08 quantity controls keep drafts through search, tab changes, and unavailable recipes',async({page,isMobile})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);
 const arrows=page.locator('[data-item=arrows]'),quantity=arrows.getByRole('spinbutton'),max=arrows.locator('[data-craft-select=max]'),submit=arrows.locator('[data-command=craft]');
 await expect(quantity).toHaveValue('1');await expect(max).toBeDisabled();await expect(max).toHaveText('最大 0回');await expect(submit).toBeDisabled();
 for(const control of [quantity,arrows.locator('[data-craft-select=one]'),max,submit]){const box=await control.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(48);expect(box?.width).toBeGreaterThanOrEqual(48);}
 await quantity.fill('7');await expect(arrows.locator('.campaign-craft-output')).toContainText('石先の矢 ×56');await expect(arrows.locator('.campaign-craft-cost')).toContainText('木材 ×7');
 await page.getByRole('searchbox',{name:'レシピを検索'}).fill('木材');await expect(quantity).toHaveValue('7');
 await activate(page.locator('[data-tab=inventory]'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(quantity).toHaveValue('7');
 await activate(page.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(quantity).toHaveValue('7');
 for(const value of ['0','1.5','999999999','']){await quantity.fill(value);await expect(quantity).toHaveAttribute('aria-invalid','true');await expect(submit).toBeDisabled();await expect(arrows.locator('.campaign-craft-output')).toContainText('×—');}
 await activate(arrows.locator('[data-craft-select=one]'),isMobile);await expect(quantity).toHaveValue('1');await expect(quantity).toHaveAttribute('aria-invalid','false');
 expect((await read(page)).inventory[4]).toBe(0);expect((await read(page)).campaign.items.arrows??0).toBe(0);expect(errors).toEqual([]);
});

test('C08 one, specified and maximum crafting consume real gathered materials exactly once',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);testInfo.annotations.push({type:'input-mode',description:isMobile?'Production Android touch controls':desktopInputLabel()});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);
 await activate(page.locator('#start'),isMobile);const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,6,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
  await controls.menu('crafting');const arrows=page.locator('[data-item=arrows]'),quantity=arrows.getByRole('spinbutton');
  const craft=async(count:number)=>{
   const before=await read(page);await expect(quantity).toHaveValue(String(count));await expect(arrows.locator('.campaign-craft-output')).toContainText('石先の矢 ×'+count*8);await expect(arrows.locator('.campaign-craft-cost')).toContainText('木材 ×'+count);
   await controls.row('arrows','craft');await expect.poll(async()=>(await read(page)).campaign.items.arrows).toBe((before.campaign.items.arrows??0)+count*8);
   const after=await read(page);expect(after.inventory[3]).toBe(before.inventory[3]-count);expect(after.inventory[4]).toBe(before.inventory[4]-count);await expect(quantity).toHaveValue(String(count));
  };
  await quantity.fill('2');await activate(arrows.locator('[data-craft-select=one]'),isMobile);await craft(1);
  await quantity.fill('2');await activate(page.locator('[data-tab=inventory]'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);await craft(2);
  const beforeMax=await read(page),maximum=Math.min(20,beforeMax.inventory[3],beforeMax.inventory[4],Math.floor((200-(beforeMax.campaign.items.arrows??0))/8));expect(maximum).toBeGreaterThan(0);
  await activate(arrows.locator('[data-craft-select=max]'),isMobile);await craft(maximum);
  await page.screenshot({path:testInfo.outputPath('bulk-crafting-result.png')});
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
