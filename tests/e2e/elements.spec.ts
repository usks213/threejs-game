import {chargeHeavy} from './helpers/charge-heavy';
import {test,expect,type Page} from '@playwright/test';
interface Probe {position:{x:number;y:number;z:number};yaw:number;pitch:number;phase:string;selectedElement:string;selectedRecipe:string;inventory:Record<number,number>;burning:number;wet:number;charged:number;seconds:number;target:string;stats:{remeshes:number}}
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as Probe);
async function aim(page:Page,isMobile:boolean,point:{x:number;y:number;z:number}){
 const p=await probe(page),dx=point.x-p.position.x,dy=point.y-p.position.y-1.52,dz=point.z-p.position.z;
 const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),yawDelta=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
 if(!isMobile){await page.evaluate(({dx,dy})=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:dx,movementY:dy,bubbles:true})),{dx:-yawDelta/.0022,dy:(p.pitch-pitch)/.0022});}
 else {
  const session=await page.context().newCDPSession(page),mx=-yawDelta/.004,my=(p.pitch-pitch)/.004,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx)/280,Math.abs(my)/100)));
  for(let i=0;i<steps;i++){const start={x:550,y:170,id:7};await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...start,x:start.x+mx/steps,y:start.y+my/steps}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await session.detach();
 }
}
async function start(page:Page,slow=false){await page.goto('/?trial=1&test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});if(slow)await page.locator('#motion-toggle').click();await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 // Consume the lock's first ignored motion without changing view.
 if(!await page.evaluate(()=>matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0))await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
 await expect.poll(async()=>(await probe(page)).seconds).toBeGreaterThan(.25);
 await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:0,movementY:0,bubbles:true})));
}
const action=async(page:Page,mobile:boolean,id:string,key:string)=>{if(mobile)await page.locator('#'+id).tap();else await page.keyboard.press(key);};
test('elemental fire and water use real aimed controls and pause safely',async({page,isMobile})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await start(page);await aim(page,isMobile,{x:-1.8,y:.58,z:6.25});
 await expect(page.locator('#game')).toHaveAttribute('data-target','sample-wood');await action(page,isMobile,'cast','KeyG');await expect.poll(async()=>(await probe(page)).burning).toBeGreaterThan(0);
 await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-elemental-fire.png`});await expect.poll(async()=>(await probe(page)).phase).toBe('idle');await action(page,isMobile,'element-switch','KeyF');expect((await probe(page)).selectedElement).toBe('water');
 await action(page,isMobile,'cast','KeyG');await expect.poll(async()=>(await probe(page)).wet).toBeGreaterThan(0);await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-elemental-water.png`});
 await expect.poll(async()=>(await probe(page)).phase).toBe('idle');await action(page,isMobile,'recipe-switch','KeyV');expect((await probe(page)).selectedRecipe).toBe('wall');const materialsBefore=(await probe(page)).inventory[4];await action(page,isMobile,'build','KeyB');expect((await probe(page)).inventory[4]).toBe(materialsBefore);
 if(isMobile)await page.locator('#menu-toggle').tap();else await page.keyboard.press('Escape');const old=(await probe(page)).selectedElement;await page.keyboard.press('KeyF');expect((await probe(page)).selectedElement).toBe(old);expect(errors).toEqual([]);
});
test('elemental harvesting turns broken wood into a placed SDF workbench',async({page,isMobile})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await start(page,true);await aim(page,isMobile,{x:-1.8,y:.58,z:6.25});
 if(!isMobile){await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.x).toBeLessThan(-.4);await page.keyboard.up('KeyW');}
 else {const session=await page.context().newCDPSession(page),r=(await page.locator('#move-pad').boundingBox())!;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+12,id:1}]});await expect.poll(async()=>(await probe(page)).position.x).toBeLessThan(-.4);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
 if(!isMobile)await page.keyboard.press('F4');
 await aim(page,isMobile,{x:-1.7,y:.58,z:6.25});if(isMobile)await page.locator('#tool-switch').tap();else await page.keyboard.press('Digit2');
 const beforeMeshes=(await probe(page)).stats.remeshes;await chargeHeavy(page,isMobile);
 await expect.poll(async()=>(await probe(page)).inventory[4],{timeout:90000}).toBeGreaterThan(0);await expect.poll(async()=>(await probe(page)).phase).toBe('idle');
 await aim(page,isMobile,{x:-1.7,y:.58,z:6.95});await chargeHeavy(page,isMobile);await expect.poll(async()=>(await probe(page)).phase).not.toBe('idle');await expect.poll(async()=>(await probe(page)).phase).toBe('idle');expect((await probe(page)).inventory[4]).toBeGreaterThanOrEqual(8);
 await aim(page,isMobile,{x:.1,y:.25,z:4.8});const before=(await probe(page)).inventory[4];await action(page,isMobile,'build','KeyB');await expect.poll(async()=>(await probe(page)).inventory[4]).toBe(before-8);expect((await probe(page)).stats.remeshes).toBeGreaterThan(beforeMeshes);
 await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-elemental-workbench.png`});expect(errors).toEqual([]);
});
test('elemental mobile controls keep 48px targets without overlapping movement or combat',async({page,isMobile})=>{
 test.skip(!isMobile,'Mobile layout only');await start(page);
 for(const size of [{width:568,height:320},{width:667,height:375},{width:844,height:390}]){await page.setViewportSize(size);await expect(page.locator('#rotate')).toBeHidden();
  const buttons=await page.locator('.survival-actions button:visible').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  const blockers=await page.locator('#move-pad,.touch-actions,.equipment').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const a of buttons){expect(a.w).toBeGreaterThanOrEqual(48);expect(a.h).toBeGreaterThanOrEqual(48);expect(a.x+a.w).toBeLessThanOrEqual(size.width);for(const b of blockers)expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y).toBe(false);}
 }
});
test('elemental enemies burn and extinguish through real input',async({page,isMobile})=>{
 test.setTimeout(300000);await start(page);if(isMobile){const session=await page.context().newCDPSession(page),r=(await page.locator('#move-pad').boundingBox())!;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+10,id:1}]});await expect.poll(async()=>(await probe(page)).position.z).toBeLessThan(3.6);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await page.locator('[data-action=interact]').tap();}else{await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.z).toBeLessThan(3.6);await page.keyboard.up('KeyW');await page.keyboard.press('KeyE');}
 const enemy=()=>page.evaluate(()=>Reflect.get(window,'__coreProbe').enemies[0] as {position:{x:number;y:number;z:number};burning:number;wet:number;hp:number});
 await expect.poll(async()=>{const p=await probe(page),e=await enemy();return Math.hypot(p.position.x-e.position.x,p.position.z-e.position.z);},{timeout:90000}).toBeLessThan(6);
 const point=(e:Awaited<ReturnType<typeof enemy>>)=>({...e.position,y:e.position.y+1.1});await aim(page,isMobile,point(await enemy()));await action(page,isMobile,'cast','KeyG');await expect.poll(async()=>(await enemy()).burning).toBeGreaterThan(0);await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-elemental-enemy.png`});await expect.poll(async()=>(await probe(page)).phase).toBe('idle');await action(page,isMobile,'element-switch','KeyF');await aim(page,isMobile,point(await enemy()));await action(page,isMobile,'cast','KeyG');await expect.poll(async()=>(await enemy()).wet).toBeGreaterThan(0);expect((await enemy()).burning).toBe(0);
});
