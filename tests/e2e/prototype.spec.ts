import {test,expect,type Page} from '@playwright/test';
interface Probe {position:{x:number;y:number;z:number};phase:string;seconds:number;yaw:number;pitch:number;door:boolean;tool:boolean;stats:{shUpdates:number;exposure:number}}
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as Probe);
test('landscape first-person input, aimed door, attack and HDR render',async({page,isMobile})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#error')).toBeHidden();await page.locator('#start').click();await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 expect((await probe(page)).door).toBe(false);
 if(!isMobile){await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.z,{timeout:60000}).toBeLessThan(3.6);await page.keyboard.up('KeyW');await expect(page.locator('#game')).toHaveAttribute('data-target','door');await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe(page)).door).toBe(true);
  const yaw=(await probe(page)).yaw;await page.mouse.move(520,270);await page.mouse.move(540,270);await expect.poll(async()=>(await probe(page)).yaw).not.toBe(yaw);await page.mouse.click(540,270);await expect.poll(async()=>(await probe(page)).phase).not.toBe('idle');await expect.poll(async()=>(await probe(page)).phase).toBe('idle');await page.keyboard.press('Digit2');await expect.poll(async()=>(await probe(page)).tool).toBe(true);
 }else{
  const session=await page.context().newCDPSession(page),r=(await page.locator('#move-pad').boundingBox())!,attack=(await page.locator('[data-action=attack]').boundingBox())!,cx=r.x+r.width/2,cy=r.y+r.height/2;
  const finger={x:cx,y:cy-30,id:1};await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});await expect.poll(async()=>(await probe(page)).position.z,{timeout:60000}).toBeLessThan(3.6);
  const yaw=(await probe(page)).yaw,look={x:560,y:160,id:2};await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,look]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger,{...look,x:570}]});await expect.poll(async()=>(await probe(page)).yaw).not.toBe(yaw);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,{...look,x:570},{x:attack.x+attack.width/2,y:attack.y+attack.height/2,id:3}]});await expect.poll(async()=>(await probe(page)).phase).not.toBe('idle');await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#game')).toHaveAttribute('data-target','door');await page.locator('[data-action=interact]').tap();await expect.poll(async()=>(await probe(page)).door).toBe(true);
  // Blur releases all held pointers; resuming must not keep the stick moving.
  await page.locator('#menu-toggle').tap();const stopped=(await probe(page)).position.z;await expect(page.locator('#menu')).toBeVisible();await page.locator('#start').tap();await expect.poll(async()=>(await probe(page)).seconds).toBeGreaterThan(.5);expect((await probe(page)).position.z).toBeCloseTo(stopped,1);
 }
 await expect.poll(async()=>(await probe(page)).stats.shUpdates,{timeout:60000}).toBeGreaterThan(0);expect(Number.isFinite((await probe(page)).stats.exposure)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-core.png`});
});
test('portrait stops play and landscape requires an explicit resume',async({page})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#rotate')).toBeVisible();await expect(page.locator('#game')).toHaveAttribute('data-running','false');const time=(await probe(page)).seconds;await page.waitForTimeout(300);expect((await probe(page)).seconds).toBe(time);
 await page.setViewportSize({width:844,height:390});await expect(page.locator('#rotate')).toBeHidden();await expect(page.locator('#menu')).toBeVisible();await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
});
