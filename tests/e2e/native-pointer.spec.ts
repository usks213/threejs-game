import {test,expect,type Page} from '@playwright/test';
import {observeAttack} from './helpers/transient-observation';
import {nativeCommand,nativeKeyboard,nativeWalkPulse,moveNativePointerIntoPage} from './helpers/native-input';

interface InputProbe {yaw:number;pitch:number;phase:string;seconds:number;position:{x:number;y:number;z:number};controls:{x:number;z:number;block:boolean};running:boolean}
const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__inputProbe') as InputProbe);
const nativeMouse=(...args:string[])=>nativeCommand(args);

test('native desktop pointer turns both camera axes, attacks, holds shield and releases at menus',async({page,isMobile},info)=>{
 test.skip(process.env.E2E_NATIVE_MOUSE!=='1'||isMobile,'Runs only in the independent headed X11 native-input job');
 test.setTimeout(240000);
 expect(info.project.use.headless,'XTEST must target a headed browser').toBe(false);
 const errors:string[]=[],checkpoints:{label:string;state:InputProbe}[]=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?trial=1&test=1');
 await expect(page.locator('#game')).toHaveAttribute('data-ready','true');
 // The existing production quality button keeps this input check inexpensive.
 await page.locator('#quality-toggle').click();
 const observed=await page.evaluateHandle(()=>{
  const events:{sequence:number;type:string;dx:number;dy:number;button:number;buttons:number;x:number;y:number;locked:string;trusted:boolean}[]=[];let sequence=0;
  const record=(event:MouseEvent)=>{events.push({sequence:++sequence,type:event.type,dx:event.movementX,dy:event.movementY,button:event.button,buttons:event.buttons,x:event.clientX,y:event.clientY,locked:document.pointerLockElement?.id??'',trusted:event.isTrusted});if(events.length>128)events.shift();};
  for(const type of ['mousemove','mousedown','mouseup'])document.addEventListener(type,record as EventListener,true);
  return {read:()=>({sequence,events}),stop:()=>{for(const type of ['mousemove','mousedown','mouseup'])document.removeEventListener(type,record as EventListener,true);}};
 });
 const events=()=>observed.evaluate(value=>value.read());
 const checkpoint=async(label:string)=>{const state=await read(page);checkpoints.push({label,state});return state;};
 const move=async(dx:number,dy:number,warmup=false)=>{
  const {sequence}=await events();
  await nativeMouse('mousemove_relative','--',String(dx),String(dy));
  await expect.poll(async()=>(await events()).events.some(event=>event.sequence>sequence&&event.type==='mousemove'&&event.trusted&&event.locked==='game'&&(warmup?event.dx!==0||event.dy!==0:event.dx*dx>0&&event.dy*dy>0)), 'The browser must receive new trusted, locked native relative motion').toBe(true);
 };
 const button=async(type:'mousedown'|'mouseup',button:1|3)=>{
  const {sequence}=await events();
  await nativeMouse(type,String(button));
  await expect.poll(async()=>(await events()).events.some(event=>event.sequence>sequence&&event.type===type&&event.trusted&&event.locked==='game'&&event.button===(button===1?0:2)), 'The locked canvas must receive the native mouse button').toBe(true);
 };
 const attack=async()=>{
  const observation=await observeAttack(page);
  try{await button('mousedown',1);await button('mouseup',1);await expect.poll(()=>observation.read()).not.toBeNull();}
  finally{await observation.dispose();}
  await expect.poll(async()=>(await read(page)).phase).toBe('idle');
 };
 try{
  await page.bringToFront();await page.locator('#start').click();
  await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('game');
  // Production deliberately ignores the first movement after each lock. Consume
  // that transition through XTEST too, then measure independent native moves.
  await move(1,1,true);
  const before=await checkpoint('locked-after-native-warmup'),dy=before.pitch<0?-20:20;
  await move(70,dy);
  await expect.poll(async()=>(await read(page)).yaw).toBeLessThan(before.yaw-.08);
  await expect.poll(async()=>((await read(page)).pitch-before.pitch)*Math.sign(dy)).toBeLessThan(-.015);
  const turned=await checkpoint('native-forward-motion');
  await move(-70,-dy);
  await expect.poll(async()=>(await read(page)).yaw).toBeGreaterThan(turned.yaw+.08);
  await expect.poll(async()=>((await read(page)).pitch-turned.pitch)*Math.sign(dy)).toBeGreaterThan(.015);
  await checkpoint('native-reverse-motion');
  await attack();await checkpoint('native-left-attack-recovered');
  const walkStart=await read(page),dx=-Math.sin(walkStart.yaw),dz=-Math.cos(walkStart.yaw);
  await nativeWalkPulse(page,{x:walkStart.position.x+dx,z:walkStart.position.z+dz,dx,dz,length:1,brake:.12,seconds:.15},60000);
  const walked=await checkpoint('native-simulation-observed-key-hold');
  expect(Math.hypot(walked.position.x-walkStart.position.x,walked.position.z-walkStart.position.z)).toBeGreaterThan(.02);
  await expect.poll(async()=>(await read(page)).controls.z).toBe(0);
  await button('mousedown',3);await expect.poll(async()=>(await read(page)).controls.block).toBe(true);
  const held=await checkpoint('native-right-held');
  await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(held.seconds+.3);
  expect((await read(page)).controls.block,'Shield must remain held across simulation frames').toBe(true);
  await button('mouseup',3);await expect.poll(async()=>(await read(page)).controls.block).toBe(false);

  await button('mousedown',3);await nativeKeyboard.down('KeyW');
  const moving=await read(page);
  await expect.poll(async()=>{const p=(await read(page)).position;return Math.hypot(p.x-moving.position.x,p.z-moving.position.z);}).toBeGreaterThan(.1);
  await nativeKeyboard.pulse('Escape',40);await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-running','false');
  await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id??'')).toBe('');
  const paused=await checkpoint('menu-clears-held-input');
  expect(paused.controls).toMatchObject({x:0,z:0,block:false});
  // OS button and key remain held until after the neutral assertion.
  await nativeMouse('mouseup','3');await nativeKeyboard.up('KeyW');
  const menuSequence=(await events()).sequence;
  const viewport=page.viewportSize()!;
  await moveNativePointerIntoPage(page);
  await expect.poll(async()=>(await events()).events.some(event=>event.sequence>menuSequence&&event.type==='mousemove'&&event.trusted&&event.locked===''&&event.x>20&&event.x<viewport.width-20&&event.y>20&&event.y<viewport.height-20&&(event.dx!==0||event.dy!==0)), 'Native motion must also reach the unlocked menu').toBe(true);
  const menuMotion=await read(page);expect(menuMotion.yaw).toBe(paused.yaw);expect(menuMotion.pitch).toBe(paused.pitch);
  await page.locator('#start').click();await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.id)).toBe('game');
  const resumed=await read(page);await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(resumed.seconds+.3);
  const settled=await checkpoint('resumed-with-neutral-controls');
  expect(settled.controls).toMatchObject({x:0,z:0,block:false});
  expect(Math.hypot(settled.position.x-resumed.position.x,settled.position.z-resumed.position.z),'A released menu must not preserve movement').toBeLessThan(.08);
  await move(1,1,true);await attack();await checkpoint('native-attack-after-resume');
  await expect(page.locator('#error')).toBeHidden();expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('native-pointer-resumed.png')});
 }finally{
  // Always release OS-held buttons, even if an assertion failed mid-gesture.
  await nativeMouse('mouseup','1','mouseup','3').catch(()=>{});await nativeKeyboard.up('KeyW').catch(()=>{});
  const delivery=await events().catch(()=>null);
  await info.attach('native-pointer-input.json',{body:JSON.stringify({source:'Ubuntu X11 XTEST via xdotool, headed Chromium on isolated Xvfb',scope:'Relative mouse motion, combat buttons and held/action keys use XTEST; menu clicks use Playwright. CI input emulation, not a physical mouse, hardware-GPU or real-device performance result.',checkpoints,delivery,errors},null,2),contentType:'application/json'});
  await observed.evaluate(value=>value.stop()).catch(()=>{});await observed.dispose();
 }
});
