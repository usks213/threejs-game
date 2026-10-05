import {test,expect,type Locator,type Page} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
const activate=(button:Locator,mobile:boolean)=>mobile?button.tap():button.click();
interface RestProbe {seconds:number;worldHour:number;worldDay:number;playerRest:{active:boolean;elapsed:number;remaining:number;target:'dawn'|'dusk'|null};campaign:{restSeconds:number};home:{furniture:string[]}}
const restRead=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as RestProbe);

test('E09/H08 campaign lighting shortcut opens gated bed rest without changing world time',async({page,isMobile})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});const before=await restRead(page);
 await activate(page.locator('#day-toggle'),isMobile);await expect(page.locator('#campaign-panel')).toBeVisible();await expect(page.locator('[data-tab=homestead]')).toHaveAttribute('aria-pressed','true');
 for(const target of ['dawn','dusk'])await expect(page.locator(`[data-item="player-rest:${target}"] button`)).toBeDisabled();
 await expect(page.locator('[data-item="furniture:player-bed"]')).toContainText('木材 10');await expect(page.locator('[data-item="furniture:player-bed"]')).toContainText('布 3');
 expect((await restRead(page)).worldHour).toBe(before.worldHour);expect((await restRead(page)).seconds).toBe(before.seconds);
 const size=await page.locator('[data-item="player-rest:dawn"] button').boundingBox();expect(size?.height).toBeGreaterThanOrEqual(48);
});

test('earned canopy bed advances dusk, cancels dawn honestly and reloads without queued waiting using real PC/touch input',async({page,isMobile},testInfo)=>{
 test.setTimeout(1200000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);await activate(page.locator('#start'),isMobile);const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,18,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
  await controls.walkTo(-3.5,5.3);await controls.interact('hearth',{x:-3,y:.9,z:4});
  for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-4.5],[-12.4,-4.5]])await controls.walkTo(x,z);await controls.interact('forest-chest',{x:-14.1,y:.65,z:-5.1});await expect.poll(async()=>(await read(page)).inventory[10]).toBe(4);
  for(const [x,z] of [[-10,-4.5],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])await controls.walkTo(x,z);await controls.menu('homestead');const paid=(await read(page)).inventory;await controls.row('furniture:player-bed','homestead');expect((await read(page)).inventory[4]).toBe(paid[4]-10);expect((await read(page)).inventory[10]).toBe(1);
  await controls.resume();await controls.walkTo(-1.7,5.15);await controls.aim({x:-.5,y:.65,z:5.25});await expect.poll(async()=>(await read(page)).target).toBe('build:home:player-bed');await page.screenshot({path:testInfo.outputPath('earned-player-bed.png')});await controls.menu('homestead');
  const start=await restRead(page);await controls.row('player-rest:dusk','homestead');await expect.poll(async()=>(await restRead(page)).playerRest.active).toBe(true);await expect(page.locator('[data-item="player-rest:cancel"] button')).toBeEnabled();
  await expect.poll(async()=>(await restRead(page)).playerRest.active,{timeout:360000,intervals:[250,500]}).toBe(false);const dusk=await restRead(page);expect(dusk.worldHour).toBeCloseTo(18,6);expect(dusk.seconds-start.seconds).toBeCloseTo((18-start.worldHour)*90,4);expect(dusk.campaign.restSeconds).toBe(240);await page.screenshot({path:testInfo.outputPath('dusk-complete-rest.png')});
  await controls.row('player-rest:dawn','homestead');await expect.poll(async()=>(await restRead(page)).playerRest.elapsed).toBeGreaterThan(0);await controls.row('player-rest:cancel','homestead');const cancelled=await restRead(page);expect(cancelled.seconds).toBeGreaterThan(dusk.seconds);expect(cancelled.playerRest.active).toBe(false);expect(cancelled.worldHour).not.toBeCloseTo(6,1);
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');const loaded=await restRead(page);expect(loaded.playerRest.active).toBe(false);expect(loaded.seconds).toBeCloseTo(cancelled.seconds,7);expect(loaded.worldHour).toBeCloseTo(cancelled.worldHour,7);expect(loaded.home.furniture).toContain('player-bed');
  await activate(page.locator('#start'),isMobile);await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(loaded.seconds);await controls.menu('homestead');await controls.row('player-rest:dawn','homestead');await expect.poll(async()=>(await restRead(page)).playerRest.elapsed).toBeGreaterThan(0);const beforeHide=await restRead(page);await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');const afterHide=await restRead(page);expect(afterHide.playerRest.active).toBe(false);expect(afterHide.seconds).toBeGreaterThanOrEqual(beforeHide.seconds);expect(afterHide.seconds).toBeLessThan(beforeHide.seconds+beforeHide.playerRest.remaining);
 }finally{await controls.dispose();}expect(errors).toEqual([]);
});
