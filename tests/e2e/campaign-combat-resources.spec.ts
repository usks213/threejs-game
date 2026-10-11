import {test,expect,type Page} from '@playwright/test';
import {PlayerControls} from './helpers/campaign-controls';
import {chargeHeavy} from './helpers/charge-heavy';
import {observeAttack} from './helpers/transient-observation';
const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as {phase:string;combat:{mana:number;charging:boolean;charge:number;pending:string|null};burning:number;campaign:{items:Record<string,number>}});
async function start(page:Page){await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true');await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');}
test('held heavy requires readiness, releases a real swing and cancels safely on pause',async({page,isMobile})=>{
 await start(page);const observed=await observeAttack(page);try{await chargeHeavy(page,isMobile);await expect.poll(()=>observed.read()).not.toBeNull();}finally{await observed.dispose();}await expect.poll(async()=>(await read(page)).phase).toBe('idle');
 if(!isMobile){await page.keyboard.down('KeyR');await expect.poll(async()=>(await read(page)).combat.charging).toBe(true);await page.keyboard.press('Escape');await page.keyboard.up('KeyR');}else{const button=page.locator('[data-action=heavy]'),box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(48);expect(box!.height).toBeGreaterThanOrEqual(48);const session=await page.context().newCDPSession(page);try{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});await expect.poll(async()=>(await read(page)).combat.charging).toBe(true);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}finally{await session.detach();}await page.locator('#menu-toggle').tap();}
 await expect.poll(async()=>(await read(page)).combat.charging).toBe(false);await page.locator('#start').click();await expect.poll(async()=>(await read(page)).phase).toBe('idle');
});
test('magic exposes finite mana and delayed effects with a discoverable recovery recipe',async({page,isMobile})=>{
 test.setTimeout(300000);await start(page);const controls=new PlayerControls(page,isMobile);await controls.initialize();try{
  await controls.aim({x:-1.7,y:.58,z:6.25});await controls.action('#cast','KeyG');await expect.poll(async()=>(await read(page)).combat.mana).toBe(80);await expect.poll(async()=>(await read(page)).burning).toBeGreaterThan(0);await expect(page.locator('#combat-status')).toContainText('マナ 80/100');
  await expect.poll(async()=>(await read(page)).phase).toBe('idle');await controls.action('#element-switch','KeyF');await controls.aim({x:0,y:.23,z:4.5});await controls.action('#cast','KeyG');await expect.poll(async()=>(await read(page)).combat.mana).toBe(60);await expect.poll(async()=>(await read(page)).phase).toBe('idle');
  // The resource recipe is visible from the ordinary crafting interface. Unit
  // and fresh Core routes verify its finite material transaction and depletion.
  await controls.menu('crafting');await expect(page.locator('[data-item=mana-draught]')).toContainText('草晶の魔力薬');
 }finally{await controls.dispose();}
});
