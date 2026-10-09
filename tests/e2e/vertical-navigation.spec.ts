import {expect,test,type Page} from '@playwright/test';
import {firstBeaconSave} from '../helpers/first-beacon-save';
import {expectJourneyTextFits} from '../helpers/journey-layout';
import type {Snapshot} from '../../src/simulation/protocol';

// Same functional-test pixel budget as the separate 180s fresh-arrival case.
// This continuation has its own clock; it never extends that opening deadline.
test.use({deviceScaleFactor:.5,viewport:{width:844,height:390}});
const state=(page:Page)=>page.evaluate(()=>(window as typeof window&{routeState:Snapshot}).routeState);

test('voxel adventure continues by walking the ramp, Ascending and gliding via a surface rest into the cave',async({page},info)=>{
 test.setTimeout(240000);page.setDefaultTimeout(20000);const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 // Passive observation only. All browser movement uses trusted pointer input;
 // power, wing and beacon actions go through their ordinary UI controls.
 await page.addInitScript(()=>{window.Worker=new Proxy(window.Worker,{construct(Target,args,newTarget){const worker=Reflect.construct(Target,args,newTarget) as Worker;worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.type==='snapshot')(window as typeof window&{routeState:unknown}).routeState=event.data.state;});return worker;}});});
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const fixture=firstBeaconSave(),epoch=await page.locator('#app').getAttribute('data-world-epoch');
 await info.attach('continuation-fixture-boundary.txt',{body:'Starts from an imported first-beacon save earned in the real GameSimulation via pickup, two constructions, grab/glue/release, walking and beacon activation. No direct position, inventory, terrain, water, enemy or ready-flag edits. Native browser coverage starts with walking from that saved surface position. The separate fresh-arrival test covers earning this state in the browser.',contentType:'text/plain'});
 await page.locator('#import-file').setInputFiles({name:'earned-first-beacon.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect.poll(()=>page.locator('#app').getAttribute('data-world-epoch')).not.toBe(epoch);
 await expect(page.locator('#journey')).toContainText('斜路');
 const touch=info.project.name==='android-chromium'?await page.context().newCDPSession(page):undefined;
 const box=await page.locator('#stick').boundingBox();if(!box)throw Error('Movement stick missing');
 const center={x:box.x+box.width/2,y:box.y+box.height/2,id:81},radius=Math.min(box.width,box.height)*.3;
 let held=false,point={...center},opens=0;
 const release=async()=>{if(!held)return;if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();held=false;};
 const steer=async(target:{x:number;z:number})=>{
  const s=await state(page),yaw=Number(await page.locator('#app').getAttribute('data-camera-yaw'));
  const dx=target.x-s.player.x,dz=target.z-s.player.z,scale=Math.max(1,Math.hypot(dx,dz));
  point={x:center.x+(dx*Math.cos(yaw)-dz*Math.sin(yaw))/scale*radius,y:center.y+(dx*Math.sin(yaw)+dz*Math.cos(yaw))/scale*radius,id:center.id};
  if(!held){if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});else{await page.mouse.move(center.x,center.y);await page.mouse.down();}held=true;}
  if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});else await page.mouse.move(point.x,point.y);
 };
 const openWing=async()=>{
  if(touch){const b=await page.locator('#traverse-glide').boundingBox();if(!b)throw Error('Wing button missing');const wing={x:b.x+b.width/2,y:b.y+b.height/2,id:82};await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,wing]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});}
  else await page.keyboard.press('KeyG');
  opens++;await expect(page.locator('#traverse-glide')).toHaveAttribute('aria-pressed','true');
 };
 const walk=async(target:{x:number;z:number},timeout=30000)=>{
  try{await expect.poll(async()=>{await steer(target);const p=(await state(page)).player;return Math.hypot(p.x-target.x,p.z-target.z);},{timeout,intervals:[80]}).toBeLessThan(.4);}finally{await release();}
 };
 const glide=async(target:{x:number;z:number},name:string)=>{
  let opened=false,minimum=50,closedMidair=false;const start=(await state(page)).tick;
  try{await expect.poll(async()=>{
   await steer(target);let s=await state(page);minimum=Math.min(minimum,s.adventure.stamina);
   if(!opened&&!s.player.grounded&&s.player.vy<-1){await openWing();opened=true;s=await state(page);}
   else if(opened&&!s.player.grounded&&!s.adventure.traversal?.gliding)closedMidair=true;
   return opened&&s.player.grounded;
  },{timeout:45000,intervals:[60]}).toBe(true);}finally{await release();}
  const landed=await state(page);expect(closedMidair).toBe(false);expect(minimum).toBeGreaterThan(0);expect(landed.adventure.health).toBe(25);
  // Assert the short-lived recovery instruction before screenshot/attachment
  // latency lets normal ground regeneration advance to the next stage.
  if(name==='surface-landing')await expect(page.locator('#journey')).toContainText('スタミナ');
  await info.attach(name+'.json',{body:JSON.stringify({start,landed,minimum,opens}),contentType:'application/json'});
  await page.screenshot({path:info.outputPath(name+'.png'),scale:'css'});
 };
 await walk({x:10,z:14});await expect(page.locator('#journey')).toContainText('斜路を上まで');
 if(touch)await walk({x:10,z:-17},45000);
 else{await page.keyboard.down('KeyW');try{await expect.poll(async()=>(await state(page)).player.z,{timeout:45000}).toBeLessThan(-16.8);}finally{await page.keyboard.up('KeyW');}}
 expect((await state(page)).player.y).toBeGreaterThan(17);
 await expect(page.locator('#journey')).toContainText('天抜け');await expect(page.locator('#journey small')).toContainText(/上\d+m/);await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('ramp-to-ascend.png'),scale:'css'});
 await page.locator('#journey').click();await page.locator('[data-power-page=travel]').click();
 await page.locator('[data-power=ascend-preview]').click();await expect.poll(async()=>(await state(page)).adventure.skybound?.ascendPreview?.exit.y??0).toBeGreaterThan(24);
 await page.locator('[data-power=ascend]').click();await expect.poll(async()=>(await state(page)).player.y).toBeGreaterThan(24);await page.locator('#powers-close').click();
 await walk({x:16,z:-18});
 // Aim the native camera at each beacon. No direct interaction commands.
 const aimBeacon=async(id:number)=>{
 const aim=await page.evaluate(id=>{const s=(window as typeof window&{routeState:Snapshot}).routeState,p=s.player,b=s.adventure.resources.find(n=>n.id===id)!;let yaw=0;for(let n=0;n<12;n++)yaw=Math.atan2(p.x+.6*Math.cos(yaw)-b.x,p.z-.6*Math.sin(yaw)-b.z);const pitch=Math.atan2(p.y+1.35-b.y-.8,Math.hypot(p.x+.6*Math.cos(yaw)-b.x,p.z-.6*Math.sin(yaw)-b.z)),app=document.querySelector<HTMLElement>('#app')!;return {dx:-(yaw-Number(app.dataset.cameraYaw))/.006,dy:(pitch-Number(app.dataset.cameraPitch))/.006};},id);
 if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:430,y:150,id:83}]});for(let n=1;n<=12;n++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:430+aim.dx*n/12,y:150+aim.dy*n/12,id:83}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await page.mouse.move(430,150);await page.mouse.down({button:'middle'});await page.mouse.move(430+aim.dx,150+aim.dy,{steps:12});await page.mouse.up({button:'middle'});}
 await expect(page.locator('#app')).toHaveAttribute('data-interaction','r:'+id);await expect(page.locator('#interact')).toContainText('灯をともす');await page.locator('#interact').click();
 await expect.poll(async()=>(await state(page)).adventure.resources.find(n=>n.id===id)?.ready??0).toBeGreaterThanOrEqual(1e9);
 };
 await aimBeacon(810002);
 await expect(page.locator('#journey')).toContainText('大穴の手前');await expect(page.locator('#journey small')).toContainText(/下\d+m/);await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('sky-to-surface-guidance.png'),scale:'css'});
 await glide({x:22,z:8},'surface-landing');expect((await state(page)).player.y).toBeGreaterThan(2.5);
 await expect.poll(async()=>(await state(page)).adventure.stamina).toBeGreaterThanOrEqual(40);
 await expect(page.locator('#journey')).toContainText('翼を開こう');await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('surface-rest-before-cave.png'),scale:'css'});
 await glide({x:28,z:8},'continuous-cave-landing');expect((await state(page)).player.y).toBeLessThan(-10);
 // Step off the beacon footprint, then aim from a real usable floor position.
 await walk({x:26,z:8});await aimBeacon(810003);
 await page.screenshot({path:info.outputPath('cave-beacon-lit-through-play.png'),scale:'css'});
 expect(opens).toBe(2);expect(errors).toEqual([]);
});
