import {test,expect,type Page} from '@playwright/test';
interface Probe {position:{x:number;y:number;z:number};phase:string;phaseTime:number;attack:string;timeScale:number;hp:number;stamina:number;enemies:{position:{x:number;y:number;z:number};phase:string;time:number;hp:number}[];weapon:{tip:{x:number;y:number;z:number}};seconds:number;yaw:number;pitch:number;door:boolean;tool:boolean;stats:{shUpdates:number;exposure:number;remeshes:number;triangles:number;reflectionSources:number}}
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as Probe);
test('landscape first-person input, aimed door, attack and HDR render',async({page,isMobile})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#error')).toBeHidden();await page.locator('#start').click();await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 expect((await probe(page)).door).toBe(false);
 if(!isMobile){await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.z,{timeout:60000}).toBeLessThan(3.6);await page.keyboard.up('KeyW');await expect(page.locator('#game')).toHaveAttribute('data-target','door');await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe(page)).door).toBe(true);
  const yaw=(await probe(page)).yaw;
  // Playwright's CDP mouse move sends absolute x/y, not OS relative motion under Pointer Lock.
  // Exercise the production event binding while the real browser lock is acquired.
  await page.evaluate(()=>{for(let i=0;i<2;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementX:24,movementY:0,bubbles:true}));});
  await expect.poll(async()=>(await probe(page)).yaw).not.toBe(yaw);await page.mouse.down();await page.mouse.up();await expect.poll(async()=>(await probe(page)).phase).not.toBe('idle');await expect.poll(async()=>(await probe(page)).phase).toBe('idle');await page.keyboard.press('Digit2');await expect.poll(async()=>(await probe(page)).tool).toBe(true);
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

test('motion review: windup, moving blade, follow-through and recovery',async({page,isMobile})=>{
 test.setTimeout(300000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await page.locator('#motion-toggle').click();await page.locator('#start').click();expect((await probe(page)).timeScale).toBe(.25);
 const prefix=isMobile?'mobile':'desktop';await page.screenshot({path:`test-results/${prefix}-motion-0-guard.png`});
 if(isMobile)await page.locator('[data-action=attack]').tap();else await page.mouse.down();await page.mouse.up();
 await expect.poll(async()=>(await probe(page)).phase).toBe('windup');await expect.poll(async()=>(await probe(page)).phaseTime,{timeout:60000}).toBeGreaterThan(.17);await page.screenshot({path:`test-results/${prefix}-motion-1-windup.png`});
 await expect.poll(async()=>(await probe(page)).phase,{timeout:60000}).toBe('strike');const start=(await probe(page)).weapon.tip;await page.screenshot({path:`test-results/${prefix}-motion-2-strike.png`});
 await expect.poll(async()=>(await probe(page)).phase,{timeout:60000}).toBe('recover');const finish=(await probe(page)).weapon.tip;expect(Math.hypot(start.x-finish.x,start.y-finish.y,start.z-finish.z)).toBeGreaterThan(.3);await page.screenshot({path:`test-results/${prefix}-motion-3-followthrough.png`});
 await expect.poll(async()=>(await probe(page)).phase,{timeout:60000}).toBe('idle');if(isMobile)await page.locator('[data-action=heavy]').tap();else await page.keyboard.press('KeyR');await expect.poll(async()=>(await probe(page)).phaseTime,{timeout:60000}).toBeGreaterThan(.35);expect((await probe(page)).attack).toBe('overhead');await page.screenshot({path:`test-results/${prefix}-motion-4-overhead.png`});expect(errors).toEqual([]);
});

test('desktop duel: read enemy windup, raise shield, then punish recovery',async({page,isMobile})=>{
 test.setTimeout(300000);
 test.skip(isMobile,'Shared motion rendering is covered on mobile; keyboard duel is desktop-specific.');const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await page.locator('#start').click();await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.z,{timeout:60000}).toBeLessThan(3.6);await page.keyboard.up('KeyW');await page.keyboard.press('KeyE');await expect.poll(async()=>(await probe(page)).door).toBe(true);
 await page.keyboard.down('KeyW');await expect.poll(async()=>{const p=await probe(page);return Math.hypot(p.position.x-p.enemies[0].position.x,p.position.z-p.enemies[0].position.z);},{timeout:60000}).toBeLessThan(1.65);await page.keyboard.up('KeyW');await page.keyboard.press('F4');
 await expect.poll(async()=>(await probe(page)).enemies[0].phase,{timeout:60000}).toBe('windup');await page.screenshot({path:'test-results/desktop-duel-1-anticipation.png'});await page.mouse.down({button:'right'});
 await expect.poll(async()=>['recover','stagger'].includes((await probe(page)).enemies[0].phase),{timeout:60000}).toBe(true);await page.screenshot({path:'test-results/desktop-duel-2-guard.png'});expect((await probe(page)).hp).toBe(100);expect((await probe(page)).stamina).toBeLessThan(100);await page.mouse.up({button:'right'});await page.mouse.down();await page.mouse.up();
 await expect.poll(async()=>(await probe(page)).enemies[0].hp,{timeout:60000}).toBeLessThan(100);await page.screenshot({path:'test-results/desktop-duel-3-counter.png'});expect(errors).toEqual([]);
});
test('desktop SDF carve changes the visible mesh and the aimed obstruction together',async({page,isMobile})=>{
 test.setTimeout(300000);
 test.skip(isMobile,'SDF remeshing is shared; this probe uses keyboard equipment selection.');const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:60000});await page.locator('#start').click();await page.keyboard.down('KeyW');await expect.poll(async()=>(await probe(page)).position.z,{timeout:60000}).toBeLessThan(3.4);await page.keyboard.up('KeyW');await page.keyboard.press('Digit2');await expect(page.locator('#game')).toHaveAttribute('data-target','door');const meshes=(await probe(page)).stats.remeshes;await page.screenshot({path:'test-results/desktop-sdf-before.png'});await page.keyboard.press('KeyR');
 await expect.poll(async()=>(await probe(page)).stats.remeshes,{timeout:60000}).toBeGreaterThan(meshes);await expect(page.locator('#game')).toHaveAttribute('data-target','');await page.screenshot({path:'test-results/desktop-sdf-after.png'});await expect.poll(async()=>(await probe(page)).phase,{timeout:60000}).toBe('idle');await page.keyboard.down('KeyD');await expect.poll(async()=>(await probe(page)).position.x,{timeout:60000}).toBeGreaterThan(5.25);await page.keyboard.up('KeyD');await expect.poll(async()=>(await probe(page)).stats.reflectionSources,{timeout:60000}).toBeGreaterThan(0);await page.screenshot({path:'test-results/desktop-water-reflection.png'});expect(errors).toEqual([]);
});
