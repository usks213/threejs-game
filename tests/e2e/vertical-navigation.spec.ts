import {expect,test,type Page} from '@playwright/test';
import {firstBeaconSave} from '../helpers/first-beacon-save';
import {expectJourneyTextFits} from '../helpers/journey-layout';
import type {Snapshot} from '../../src/simulation/protocol';
import {installRouteObserver,readRouteSample,readGlideEvidence,nativeRouteAxis,RouteCadence,type RouteSample} from '../helpers/vertical-route-driver';

// Same functional-test pixel budget as the separate 180s fresh-arrival case.
// This continuation has its own clock; it never extends that opening deadline.
test.use({deviceScaleFactor:.5,viewport:{width:844,height:390}});
const reports=new WeakMap<Page,{phase:string;metadata:{browserScope:string;expectedCommit:string|null;interpretation:string};steps:unknown[];droppedSteps:number;errors:string[]}>();
test.afterEach(async({page},info)=>{
 const report=reports.get(page);
 // A failed first waypoint must retain the same evidence as later successes.
 const final=await readRouteSample(page).catch(error=>({readError:String(error)}));
 const passive=await page.locator('#app').evaluate(()=>{
  const w=window as typeof window&{routeTrace?:unknown;routeState?:Snapshot};
  return {trace:w.routeTrace,finalState:w.routeState};
 },undefined,{timeout:10000}).catch(error=>({readError:String(error)}));
 await info.attach('native-route-ledger.json',{body:JSON.stringify({status:info.status,report,final,passive}),contentType:'application/json'});
 if(info.status!==info.expectedStatus)await page.screenshot({path:info.outputPath('native-route-failure.png'),scale:'css',timeout:10000}).catch(error=>info.attach('failure-capture-error.txt',{body:String(error),contentType:'text/plain'}));
});

test('voxel adventure continues by walking the ramp, Ascending and gliding via a surface rest into the cave',async({page},info)=>{
 test.setTimeout(240000);page.setDefaultTimeout(20000);const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 const browserScope=process.env.BROWSER_SCOPE??'local/unclassified',metadata={browserScope,expectedCommit:process.env.EXPECTED_COMMIT??null,interpretation:browserScope==='route-test-only'?'route-test-only; production unchanged':browserScope};
 const report={phase:'boot',metadata,steps:[] as unknown[],droppedSteps:0,errors};reports.set(page,report);
 const recordStep=(value:unknown)=>{report.steps.push(value);if(report.steps.length>2000){report.steps.splice(0,100);report.droppedSteps+=100;}};
 await info.attach('route-run-metadata.json',{body:JSON.stringify(metadata),contentType:'application/json'});
 // Passive observation only. All browser movement uses trusted pointer input;
 // power, wing and beacon actions go through their ordinary UI controls.
 await installRouteObserver(page);
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 if(metadata.expectedCommit){expect(metadata.expectedCommit).toMatch(/^[a-f0-9]{40}$/);await expect(page.locator('#build-version')).toHaveAttribute('data-commit',metadata.expectedCommit);}
 const fixture=firstBeaconSave(),epoch=await page.locator('#app').getAttribute('data-world-epoch');
 await info.attach('continuation-fixture-boundary.txt',{body:'Starts from an imported first-beacon save earned in the real GameSimulation via pickup, two constructions, grab/glue/release, walking and beacon activation. No direct position, inventory, terrain, water, enemy or ready-flag edits. Native browser coverage starts with walking from that saved surface position. The separate fresh-arrival test covers earning this state in the browser.',contentType:'text/plain'});
 await page.locator('#import-file').setInputFiles({name:'earned-first-beacon.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect.poll(()=>page.locator('#app').getAttribute('data-world-epoch')).not.toBe(epoch);
 await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('#journey')).toContainText('斜路');
 await expect.poll(async()=>{const s=await readRouteSample(page);return s.snapshotEpoch===s.epoch;}).toBe(true);
 report.phase='earned-checkpoint';recordStep(await readRouteSample(page));
 await page.screenshot({path:info.outputPath('earned-checkpoint-before-movement.png'),scale:'css'});
 const touch=info.project.name==='android-chromium'?await page.context().newCDPSession(page):undefined;
 let held=false,point={x:0,y:0,id:81},opens=0;
 const release=async()=>{if(!held)return;held=false;if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();};
 const steer=async(sample:RouteSample,target:{x:number;z:number},cadence:RouteCadence,active:()=>boolean)=>{
  expect(sample.snapshotEpoch,'Controller uses the current imported world').toBe(sample.epoch);
  const feedbackSeconds=cadence.observe(sample.tick),axis=nativeRouteAxis(sample.player,target,sample.yaw,feedbackSeconds,sample.gliding?5.1:3.4);
  const box=sample.stick,center={x:box.x+box.width/2,y:box.y+box.height/2,id:81},radius=Math.min(box.width,box.height)*.3;
  point={x:center.x+axis.x*radius,y:center.y+axis.z*radius,id:center.id};
  recordStep({phase:report.phase,sample,target,axis,feedbackSeconds,point,dispatchedAt:Date.now()});
  if(!active())return;
  if(!held){held=true;if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});else{await page.mouse.move(center.x,center.y);if(!active())return;await page.mouse.down();}}
  if(!active())return;
  if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});else await page.mouse.move(point.x,point.y);
 };
 const openWing=async(active:()=>boolean)=>{
  if(touch){const b=await page.locator('#traverse-glide').boundingBox();if(!b)throw Error('Wing button missing');if(!active())return false;const wing={x:b.x+b.width/2,y:b.y+b.height/2,id:82};await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,wing]});if(!active())return false;await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});}
  else{if(!active())return false;await page.keyboard.press('KeyG');}
  if(!active())return false;opens++;await expect(page.locator('#traverse-glide')).toHaveAttribute('aria-pressed','true');return true;
 };
 const walk=async(target:{x:number;z:number},timeout=30000)=>{
  report.phase=`walk:${target.x},${target.z}`;let active=true;const cadence=new RouteCadence();
  try{await expect.poll(async()=>{
   const sample=await readRouteSample(page),distance=Math.hypot(sample.player.x-target.x,sample.player.z-target.z);
   if(!active)return Infinity;
   // Decide arrival before another move; the old driver moved first and then
   // waited seconds for a second, already-overshot position read.
   if(distance<.4){await release();if(!active)return Infinity;const stopped=await readRouteSample(page),remaining=Math.hypot(stopped.player.x-target.x,stopped.player.z-target.z);recordStep({phase:report.phase,arrival:stopped,distance:remaining});return remaining;}
   await steer(sample,target,cadence,()=>active);return distance;
  },{timeout,intervals:[80]}).toBeLessThan(.4);}finally{active=false;await release();}
 };
 const glide=async(target:{x:number;z:number},name:string)=>{
  report.phase=name;let active=true,opened=false,minimum=50,closedMidair=false;const first=await readRouteSample(page),start=first.tick,cadence=new RouteCadence();
  try{await expect.poll(async()=>{
   const sample=await readRouteSample(page);if(!active)return false;minimum=Math.min(minimum,sample.stamina);expect(sample.health,'The native descent must retain full starter health').toBe(25);
   if(opened&&sample.player.grounded){recordStep({phase:report.phase,arrival:sample});return true;}
   await steer(sample,target,cadence,()=>active);if(!active)return false;
   if(!opened&&!sample.player.grounded&&sample.player.vy<-1)opened=await openWing(()=>active);
   else if(opened&&!sample.player.grounded&&!sample.gliding)closedMidair=true;
   return false;
  },{timeout:45000,intervals:[60]}).toBe(true);}finally{active=false;await release();}
  const landed=await readRouteSample(page);expect(closedMidair).toBe(false);expect(minimum).toBeGreaterThan(0);expect(landed.health).toBe(25);expect(landed.player.grounded).toBe(true);
  const flight=await readGlideEvidence(page,start,first.snapshotEpoch);expect(flight.complete).toBe(true);expect(flight.glidingSamples).toBeGreaterThan(0);expect(flight.landed).toBe(true);expect(flight.closedInAir).toBe(false);expect(flight.minimumHealth).toBe(25);expect(flight.minimumStamina).toBeGreaterThan(0);
  await info.attach(name+'.json',{body:JSON.stringify({start,landed,minimum,opens,flight}),contentType:'application/json'});
  await page.screenshot({path:info.outputPath(name+'.png'),scale:'css'});
 };
 await walk({x:10,z:14});await expect(page.locator('#journey')).toContainText('斜路を上まで');
 if(touch)await walk({x:10,z:-17},45000);
 else{report.phase='keyboard-ramp';await page.keyboard.down('KeyW');try{await expect.poll(async()=>(await readRouteSample(page)).player.z,{timeout:45000}).toBeLessThan(-16.8);}finally{await page.keyboard.up('KeyW');}}
 expect((await readRouteSample(page)).player.y).toBeGreaterThan(17);
 await expect(page.locator('#journey')).toContainText('天抜け');await expect(page.locator('#journey small')).toContainText(/上\d+m/);await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('ramp-to-ascend.png'),scale:'css'});
 report.phase='ascend';await page.locator('#journey').click();await page.locator('[data-power-page=travel]').click();
 await page.locator('[data-power=ascend-preview]').click();await expect.poll(()=>page.evaluate(()=>(window as typeof window&{routeState:Snapshot}).routeState.adventure.skybound?.ascendPreview?.exit.y??0)).toBeGreaterThan(24);
 await page.locator('[data-power=ascend]').click();await expect.poll(async()=>(await readRouteSample(page)).player.y).toBeGreaterThan(24);await page.locator('#powers-close').click();
 await walk({x:16,z:-18});
 // Aim the native camera at each beacon. No direct interaction commands.
 const aimBeacon=async(id:number)=>{report.phase='aim-beacon:'+id;
 const aim=await page.evaluate(id=>{const s=(window as typeof window&{routeState:Snapshot}).routeState,p=s.player,b=s.adventure.resources.find(n=>n.id===id)!;let yaw=0;for(let n=0;n<12;n++)yaw=Math.atan2(p.x+.6*Math.cos(yaw)-b.x,p.z-.6*Math.sin(yaw)-b.z);const pitch=Math.atan2(p.y+1.35-b.y-.8,Math.hypot(p.x+.6*Math.cos(yaw)-b.x,p.z-.6*Math.sin(yaw)-b.z)),app=document.querySelector<HTMLElement>('#app')!;return {dx:-(yaw-Number(app.dataset.cameraYaw))/.006,dy:(pitch-Number(app.dataset.cameraPitch))/.006};},id);
 if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:430,y:150,id:83}]});for(let n=1;n<=12;n++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:430+aim.dx*n/12,y:150+aim.dy*n/12,id:83}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await page.mouse.move(430,150);await page.mouse.down({button:'middle'});await page.mouse.move(430+aim.dx,150+aim.dy,{steps:12});await page.mouse.up({button:'middle'});}
 await expect(page.locator('#app')).toHaveAttribute('data-interaction','r:'+id);await expect(page.locator('#interact')).toContainText('灯をともす');await page.locator('#interact').click();
 await expect.poll(()=>page.evaluate(id=>(window as typeof window&{routeState:Snapshot}).routeState.adventure.resources.find(n=>n.id===id)?.ready??0,id)).toBeGreaterThanOrEqual(1e9);
 };
 await aimBeacon(810002);
 await expect(page.locator('#journey')).toContainText('大穴の手前');await expect(page.locator('#journey small')).toContainText(/下\d+m/);await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('sky-to-surface-guidance.png'),scale:'css'});
 await glide({x:22,z:8},'surface-landing');const surface=await readRouteSample(page);expect(surface.player.y).toBeGreaterThan(2.5);expect(surface.player.y).toBeLessThan(5);
 // Slower observation can report a safe landing short of the marker, or after
 // recovery has already reached40. Finish the actual ground approach normally.
 await walk({x:22,z:8});report.phase='ground-rest';
 await expect.poll(async()=>{
  const sample=await readRouteSample(page),frame=sample.rendered,p=frame.player;
  recordStep({phase:report.phase,sample});
  const atGroundStop=p.grounded&&p.y>-3&&p.y<5&&!frame.gliding&&Math.hypot(p.x-22,p.z-8)<1.5;
  // HUD position, stamina, title and tick come from one actual UI update.
  if(atGroundStop)expect(frame.title).toBe(frame.stamina<40?'地面でスタミナを戻そう':'大穴へ歩き、翼を開こう');
  return atGroundStop&&sample.player.grounded&&sample.stamina>=40;
 }).toBe(true);
 await expectJourneyTextFits(page);
 await page.screenshot({path:info.outputPath('surface-rest-before-cave.png'),scale:'css'});
 await glide({x:28,z:8},'continuous-cave-landing');expect((await readRouteSample(page)).player.y).toBeLessThan(-10);
 // Step off the beacon footprint, then aim from a real usable floor position.
 await walk({x:26,z:8});await aimBeacon(810003);
 await page.screenshot({path:info.outputPath('cave-beacon-lit-through-play.png'),scale:'css'});
 expect(opens).toBe(2);expect(errors).toEqual([]);
});
