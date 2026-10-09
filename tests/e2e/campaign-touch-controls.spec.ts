import {test,expect,type Page} from '@playwright/test';
import {PlayerControls,choosePerformance,read} from './helpers/campaign-controls';
import {readRegionalMotion} from './helpers/regional-evidence';

const input=(page:Page)=>page.evaluate(()=>(Reflect.get(window,'__inputProbe') as {controls:{x:number;z:number;block:boolean}}).controls);

test('Q07 Android touch driver: concurrent contacts retain movement and shield through look and actions',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'This contact-lifetime check requires Chromium touch emulation.');
 testInfo.annotations.push({type:'input-mode',description:'Actual CDP touches in Android Chromium emulation; physical-device validation remains separate'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 const controls=new PlayerControls(page,true);
 // Observe native input and transient states only. Nothing dispatches DOM
 // events, invokes game actions, changes the world, or accelerates time.
 const observed=await page.evaluateHandle(()=>{
  const events:{type:string;pointerType:string;trusted:boolean;target:string}[]=[],clicks:{target:string;trusted:boolean}[]=[],phases=new Set<string>();let jumped=false;
  const pointer=(e:PointerEvent)=>{if(e.type==='pointerdown')events.push({type:e.type,pointerType:e.pointerType,trusted:e.isTrusted,target:(e.target as HTMLElement).closest('[id],[data-action]')?.getAttribute('data-action')||(e.target as HTMLElement).id});};
  const keyboard=()=>events.push({type:'keydown',pointerType:'',trusted:true,target:''});
  const click=(e:MouseEvent)=>clicks.push({target:(e.target as HTMLElement).id,trusted:e.isTrusted});
  document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',keyboard);document.addEventListener('click',click);
  const timer=setInterval(()=>{const p=Reflect.get(window,'__regionalInputProbe') as {grounded:boolean;phase:string};if(!p.grounded)jumped=true;phases.add(p.phase);},10);
  return {read:()=>({events,clicks,phases:[...phases],jumped}),stop:()=>{clearInterval(timer);document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',keyboard);document.removeEventListener('click',click);}};
 });
 try{
  expect((await read(page)).settings.graphics).toBe('balanced');await choosePerformance(page,true);
  expect(await observed.evaluate(v=>v.read().clicks.filter(e=>e.target==='quality-toggle'&&e.trusted).length)).toBe(1);
  await controls.activate('#start');await controls.initialize();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  await controls.activate('#menu-toggle');await expect(page.locator('#menu')).toBeVisible();await expect(page.locator('#game')).toHaveAttribute('data-running','false');
  await controls.activate('#start');await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  expect(await input(page)).toMatchObject({x:0,z:0,block:false});
  expect(await observed.evaluate(v=>v.read().clicks.filter(e=>e.target==='start'&&e.trusted).length)).toBe(2);
  expect(await observed.evaluate(v=>v.read().clicks.filter(e=>e.target==='menu-toggle'&&e.trusted).length)).toBe(1);
  await controls.action('#tool-switch','Digit1');await controls.shield(true);await controls.moveAxes(.1,0);const beforeLook=await readRegionalMotion(page);
  await Promise.all([controls.fineLook(.08,.04),controls.action('[data-action=jump]','Space')]);
  const afterLook=await readRegionalMotion(page);expect(afterLook.yaw-beforeLook.yaw).toBeCloseTo(.08,2);expect(afterLook.pitch-beforeLook.pitch).toBeCloseTo(.04,2);
  await controls.fineLook(.08,.04);const repeatedLook=await readRegionalMotion(page);expect(repeatedLook.yaw-afterLook.yaw).toBeCloseTo(.08,2);expect(repeatedLook.pitch-afterLook.pitch).toBeCloseTo(.04,2);
  await expect.poll(async()=>(await input(page)).x).toBeCloseTo(.1,3);await controls.assertShieldHeld();await expect.poll(()=>observed.evaluate(v=>v.read().jumped)).toBe(true);
  for(const [key,tool] of [['Digit2',true],['Digit1',false]] as const){await controls.action('#tool-switch',key);expect((await read(page)).tool).toBe(tool);await controls.assertShieldHeld();await expect.poll(async()=>(await input(page)).x).toBeCloseTo(.1,3);}
  await controls.action('#element-switch','KeyF');expect((await readRegionalMotion(page)).selectedElement).toBe('water');await controls.assertShieldHeld();
  await controls.moveAxes(0,0);expect(await input(page)).toMatchObject({x:0,z:0,block:true});
  await expect.poll(async()=>(await readRegionalMotion(page)).grounded).toBe(true);await controls.action('[data-action=jump]','Space');await controls.assertShieldHeld();
  expect(await observed.evaluate(v=>v.read().events.filter(e=>e.target==='jump').length)).toBe(2);await controls.shield(false);expect((await input(page)).block).toBe(false);
  await expect.poll(async()=>(await readRegionalMotion(page)).grounded).toBe(true);
  await controls.moveAxes(.1,0);await controls.action('[data-action=dodge]','ControlLeft');await expect.poll(()=>observed.evaluate(v=>v.read().phases)).toContain('dodge');
  await expect.poll(async()=>(await input(page)).x).toBeCloseTo(.1,3);await controls.moveAxes(0,0);await expect.poll(async()=>(await readRegionalMotion(page)).phase).toBe('idle');
  // The genuine dodge displaced the player to x1.76 in CI, putting this
  // sample outside the 2.75m reticle range. Walk back through normal controls;
  // do not reset coordinates or pretend the distant surface was targeted.
  await controls.walkTo(beforeLook.position.x,beforeLook.position.z);
  await controls.aim({x:-1.7,y:.58,z:6.25});await expect(page.locator('#game')).toHaveAttribute('data-target','sample-wood');
  expect((await readRegionalMotion(page)).selectedElement).toBe('water');
  const mana=(await readRegionalMotion(page)).mana;await controls.moveAxes(.1,0);await controls.action('#cast','KeyG');await controls.fineLook(.02,0);
  await expect.poll(async()=>(await readRegionalMotion(page)).mana).toBe(mana-20);await expect.poll(async()=>(await input(page)).x).toBeCloseTo(.1,3);await controls.moveAxes(0,0);
  const evidence=await observed.evaluate(v=>v.read());expect(evidence.events.some(e=>e.type==='keydown')).toBe(false);expect(evidence.events.every(e=>e.pointerType==='touch'&&e.trusted)).toBe(true);
  for(const target of ['block','jump','dodge','cast','look-pad'])expect(evidence.events.some(e=>e.target===target),`Real touch must reach ${target}`).toBe(true);
  await testInfo.attach('android-touch-driver-evidence',{body:JSON.stringify({inputMode:'Android Chromium emulation',...evidence,state:await readRegionalMotion(page)},null,2),contentType:'application/json'});
  expect((await readRegionalMotion(page)).hp).toBeGreaterThan(0);expect(errors).toEqual([]);
 }finally{await observed.evaluate(v=>v.stop());await observed.dispose();await controls.dispose();}
});
