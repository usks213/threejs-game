import {desktopInputLabel} from './helpers/native-input';
import {test,expect,type Page} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
import type {WatermillState} from '../../src/prototype/core/watermill';
const mill=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe').watermill as WatermillState&{flow:number;blockedReason:string});
const waitSeconds=async(page:Page,seconds:number)=>{const start=(await read(page)).seconds;await expect.poll(async()=>(await read(page)).seconds,{timeout:120000}).toBeGreaterThanOrEqual(start+seconds);};

test('H15 waterwheel menu explains finite basin, cost and actual flow; controls survive repeated reopening',async({page,isMobile})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 const tap=async(selector:string)=>isMobile?page.locator(selector).tap():page.locator(selector).click();await tap('#restart');await tap('[data-tab=homestead]');
 await expect(page.locator('[data-item="watermill-status"]')).toContainText('静水・満水');await expect(page.locator('[data-item="watermill-status"]')).toContainText('水門レバー');
 const build=page.locator('[data-item="watermill-build"] [data-command=homestead]');await expect(build).toBeDisabled();await expect(page.locator('[data-item="watermill-build"]')).toContainText('木材8・石4・金属2');const b=await build.boundingBox();expect(b!.height).toBeGreaterThanOrEqual(48);
 const before=await mill(page);await tap('[data-tab=inventory]');await tap('[data-tab=homestead]');await expect(build).toBeDisabled();expect(await mill(page)).toEqual(before);expect(errors).toEqual([]);
});

test('H15 zero-grant waterwheel build, real valve, pause, stop/resume, single claim and saved reload',async({page,isMobile},info)=>{
 test.setTimeout(900000);info.annotations.push({type:'input-mode',description:isMobile?'Production Android touch':desktopInputLabel()});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?streaming=1&test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);const c=new PlayerControls(page,isMobile);await c.activate('#start');await c.initialize();
 try{
  expect(Object.values((await read(page)).inventory).every(n=>n===0)).toBe(true);await c.walkTo(-.55,6.15);await c.action('#tool-switch','Digit2');await c.gather(4,20,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
  await c.walkTo(-.55,5.25);await c.walkTo(-3.45,5.25);await c.walkTo(-3.45,6.35);await c.gather(3,10,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');await c.walkTo(-3.45,6.65);await c.gather(7,6,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9}],'sample-grass');
  await c.walkTo(-3.45,5.3);await c.walkTo(2.5,5.3);await c.walkTo(2.5,5.75);await c.gather(6,2,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1}],'sample-metal');await c.walkTo(2.5,5.3);await c.walkTo(-3.5,5.3);await c.interact('hearth',{x:-3,y:.9,z:4});
  await c.action('#tool-switch','Digit1');await c.walkTo(0,5.3);await c.walkTo(0,3.2);await c.interact('door',{x:0,y:1.4,z:1});await c.walkTo(0,1.6);await c.fight(0);await c.healFromInventory();
  // Face the approaching warden before turning into the artisan alcove.
  // The prior trace died during that unguarded return turn. Use the same
  // finite shield/counter encounter as the normal first-chapter route.
  await c.walkTo(0,0);await c.fight(1);await c.healFromInventory();
  await c.walkTo(0,0);await c.walkTo(-2.4,-1.8);await c.interact('artisan',{x:-2.5,y:1.1,z:-3.5});await expect.poll(async()=>(await read(page)).campaign.artisanRescued).toBe(true);await c.walkTo(0,0);await c.walkTo(0,3.2);await c.walkTo(0,5.3);await c.walkTo(-3.5,5.3);
  await c.menu('crafting');for(const id of ['iron-blade','hide-coat','bandage','bandage'])await c.row(id,'craft');await c.activate('[data-tab=inventory]');for(const id of ['iron-blade','hide-coat'])await c.row(id,'equip');await c.resume();await c.healFromInventory();await c.walkTo(0,5.3);await c.walkTo(0,3.2);await c.walkTo(0,-3);expect((await read(page)).enemies[1].hp).toBe(0);await c.walkTo(0,0);await c.walkTo(2.5,0);await c.walkTo(2.5,-1.3);
  const before=(await read(page)).inventory;await c.menu('homestead');await c.row('watermill-build','homestead');await c.row('watermill-start','homestead');expect((await read(page)).inventory[7]).toBe(before[7]-6);expect((await mill(page)).job!.remaining).toBe(8);await c.resume();
  const valve=()=>c.interact('valve',{x:3.25,y:.8,z:-2.75});await valve();await expect.poll(async()=>(await mill(page)).job!.remaining).toBeLessThan(8);await c.menu('homestead');const paused=await mill(page);await page.waitForTimeout(500);expect(await mill(page)).toEqual(paused);await c.resume();await valve();await waitSeconds(page,2);const stopped=await mill(page);expect(stopped.job!.remaining).toBeGreaterThan(0);await waitSeconds(page,1);expect((await mill(page)).job!.remaining).toBe(stopped.job!.remaining);
  await valve();await expect.poll(async()=>(await mill(page)).job!.remaining,{timeout:120000}).toBe(0);await valve();const id=(await mill(page)).job!.id;await c.menu('homestead');await c.row('watermill-claim:'+id,'homestead');expect((await read(page)).inventory[10]).toBe(before[10]+2);expect((await mill(page)).job).toBeNull();await page.screenshot({path:info.outputPath('watermill-claimed.png')});
  await c.activate('[data-tab=settings]');await expect.poll(async()=>(await read(page)).worldReady).toBe(true);const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');await c.dispose();await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');expect((await mill(page)).job).toBeNull();expect((await read(page)).inventory[10]).toBe(before[10]+2);expect((await read(page)).campaign.deaths).toBe(0);
 }finally{await c.dispose();}expect(errors).toEqual([]);
});
