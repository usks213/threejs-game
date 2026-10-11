import {test,expect,type Page} from '@playwright/test';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {expectOpeningJourneyFits} from '../helpers/journey-layout';
test.use({deviceScaleFactor:.5,viewport:{width:844,height:390}});
test.afterEach(async({page},info)=>{
 if(!info.title.includes('fresh arrival'))return;
 const evidence=await page.evaluate(()=>{const app=document.querySelector<HTMLElement>('#app');return {state:(window as typeof window&{openingState?:unknown}).openingState,aim:app?.dataset.aim,streaming:app?.dataset.streaming,notice:document.querySelector('#notice')?.textContent};}).catch(()=>null);
 await info.attach('opening-authority-and-render-evidence',{body:JSON.stringify(evidence),contentType:'application/json'});
});
const sky=async(page:Page)=>JSON.parse(await page.locator('#app').getAttribute('data-skybound')??'null') as {parts:{id:number;position:{x:number;y:number;z:number};lease?:unknown}[];blueprints:unknown[]}|null;
test('voxel adventure exposes original journey, usable room entry, abilities and persistent accessibility settings',async({page},info)=>{
 test.setTimeout(120000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await expect(page).toHaveTitle(/空と灯の大地/);await expect(page.locator('#journey')).toContainText('木材で最初の灯をつなごう');await expect(page.locator('#session-menu')).toBeVisible();await expect(page.locator('#powers-menu')).toBeVisible();
 await page.locator('#powers-menu').click();await expect(page.getByRole('dialog',{name:'創作能力',exact:true})).toBeVisible();await expect(page.locator('#power-kind option')).toHaveCount(13);await expect(page.locator('#power-kind option[value=storage]')).toHaveCount(1);await expect(page.locator('#power-kind option[value=bed]')).toHaveCount(1);await page.locator('#powers-close').click();
 await page.locator('#system-menu').click();await page.locator('#reduced-motion').check();await page.locator('#invert-camera').check();await page.locator('#system-close').click();
 await expect(page.locator('#app')).toHaveAttribute('data-motion','reduced');await page.screenshot({path:info.outputPath('original-adventure.png'),scale:'css'});
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await page.locator('#system-menu').click();await expect(page.locator('#reduced-motion')).toBeChecked();await expect(page.locator('#invert-camera')).toBeChecked();expect(errors).toEqual([]);
});
test('voxel adventure creates, holds, moves, records and releases a visible authoritative part through controls',async({page},info)=>{
 test.setTimeout(150000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|THREE/.test(m.text()))errors.push(m.text());});
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 // A saved-world fixture supplies crafting materials; actions still use the real UI and simulation.
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.resources=[];sim.adventure.state.enemies=[];sim.adventure.state.inventory={ragTunic:1,glider:1,club:1,wood:20,stone:12,resin:4};
 await page.locator('#system-menu').click();await page.locator('#import-file').setInputFiles({name:'ability-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});await page.locator('#system-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await page.locator('#powers-menu').click();await page.getByRole('button',{name:'照準の先に作る',exact:true}).click();await expect(page.locator('#power-preview')).toBeVisible();await expect.poll(async()=>(await sky(page))?.parts.length).toBe(0);await page.locator('#power-preview [data-power=preview-confirm]').click();await expect.poll(async()=>(await sky(page))?.parts.length).toBe(1);
 await page.getByRole('button',{name:'選んだ部品を掴む',exact:true}).click();await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(true);const y=(await sky(page))!.parts[0].position.y;
 await page.locator('#powers-close').click();await expect(page.locator('#powers-quick')).toBeVisible();await expect(page.locator('#compass')).toBeHidden();await expect(page.locator('#journey')).toBeHidden();
 const holdTick=Number(await page.locator('#app').getAttribute('data-tick'));
 // Stay held beyond the original 150-tick expiry without extra grab/move input.
 await expect.poll(async()=>Number(await page.locator('#app').getAttribute('data-tick')),{timeout:20000}).toBeGreaterThan(holdTick+180);
 await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(true);
 const tray=await page.locator('#powers-quick').boundingBox(),reticle=await page.locator('.reticle').boundingBox();expect(tray).not.toBeNull();expect(reticle).not.toBeNull();expect(tray!.y+tray!.height).toBeLessThan(reticle!.y);
 await expect(page.locator('#power-quick-release')).toBeVisible();await expect(page.locator('#water-cast')).toBeVisible();await expect(page.locator('#jump')).toBeVisible();
 await page.screenshot({path:info.outputPath('held-part-layout.png'),scale:'css'});
 if(info.project.name==='android-chromium'){
  await page.setViewportSize({width:568,height:320});
  // Resize completion and the game's logical-landscape listener are separate.
  // Do not send coordinates from the preceding wide frame into a small viewport.
  await expect(page.locator('#game')).toHaveJSProperty('clientWidth',568);
  await expect(page.locator('#game')).toHaveJSProperty('clientHeight',320);
  await expect(page.locator('#app')).toHaveAttribute('data-rotated','false');
  await expect.poll(()=>page.locator('#power-quick-actions').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(60);
  const compact=await page.locator('#powers-quick').boundingBox(),aimBox=await page.locator('.reticle').boundingBox();expect(compact!.y+compact!.height).toBeLessThan(aimBox!.y);
  await expect(page.locator('#power-quick-release')).toBeVisible();let area=await page.locator('#power-quick-actions').boundingBox();if(!area)throw Error('Carry controls missing');
  const beforeSwipe=await page.locator('#power-quick-actions').evaluate(el=>{const r=el.getBoundingClientRect(),x=r.right-12,y=r.top+24,target=document.elementFromPoint(x,y);return {rect:r.toJSON(),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,appWidth:document.querySelector('#game')!.clientWidth,target:target?.closest('button')?.getAttribute('data-power')??target?.tagName,touchAction:getComputedStyle(el).touchAction};});
  await info.attach('compact-carry-before-swipe.json',{body:JSON.stringify(beforeSwipe),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('held-part-compact-before-swipe.png'),scale:'css'});
  expect(beforeSwipe.rect.right).toBeLessThan(568);expect(['up','down','forward','back','rotate','throw']).toContain(beforeSwipe.target);
  await page.evaluate(()=>{const w=window as typeof window&{carryGesture?:unknown[]};w.carryGesture=[];for(const type of ['pointerdown','pointercancel','touchstart','touchend','touchcancel'])document.addEventListener(type,event=>{const target=event.target instanceof Element?event.target:null;w.carryGesture!.push({type:event.type,trusted:event.isTrusted,time:event.timeStamp,power:target?.closest<HTMLButtonElement>('button')?.dataset.power??null,inStrip:!!target?.closest('#power-quick-actions')});},{capture:true,passive:true});});
  area=await page.locator('#power-quick-actions').boundingBox();if(!area)throw Error('Carry controls missing');
  const touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:area.x+area.width-12,y:area.y+24,id:71}]});
  for(let step=1;step<=8;step++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.x+area.width-12-(area.width-24)*step/8,y:area.y+24,id:71}]});await page.waitForTimeout(35);}
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const nativeEvents=await page.evaluate(()=>(window as typeof window&{carryGesture?:{type:string;trusted:boolean;inStrip:boolean}[]}).carryGesture??[]);
  await info.attach('compact-carry-native-events.json',{body:JSON.stringify(nativeEvents),contentType:'application/json'});
  expect(nativeEvents.some(e=>e.type==='touchstart'&&e.trusted&&e.inStrip)).toBe(true);
  await page.screenshot({path:info.outputPath('held-part-compact-after-swipe.png'),scale:'css'});
  await expect.poll(()=>page.locator('#power-quick-actions').evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
  await expect(page.locator('#power-preview')).toBeHidden();await expect(page.locator('#power-quick-release')).toBeVisible();await page.screenshot({path:info.outputPath('held-part-compact.png'),scale:'css'});
  await page.setViewportSize({width:844,height:390});
 }
 await page.locator('#powers-menu').click();

 await page.getByRole('button',{name:'持ち上げる',exact:true}).click();await expect(page.locator('#power-preview')).toBeVisible();await page.locator('#power-preview [data-power=preview-confirm]').click();await expect.poll(async()=>(await sky(page))!.parts[0].position.y).toBeGreaterThan(y+.3);
 await page.locator('[data-power-page=plans]').click();await page.getByRole('button',{name:'設計帳に記録',exact:true}).click();await expect.poll(async()=>(await sky(page))?.blueprints.length).toBe(1);
 await page.locator('[data-power-page=build]').click();await page.getByRole('button',{name:'手を放す',exact:true}).click();await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(false);await page.locator('#powers-close').click();
 await page.screenshot({path:info.outputPath('constructed-voxel-part.png'),scale:'css'});expect(errors).toEqual([]);
});
test('voxel adventure protects a corrupted local save until an explicit recovery choice',async({page})=>{
 test.setTimeout(120000);await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await page.locator('#system-menu').click();await page.locator('#save').click();await expect(page.locator('#save-status')).toContainText('保存済み',{timeout:15000});
 // Fault injection only changes the saved manifest; no gameplay state or network is mocked.
 await page.evaluate(async()=>{await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('voxel-coop-adventure-v1',3);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put({storageVersion:999},'single-player');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('dialog',{name:'保存データの復旧'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#recovery-panel')).toBeVisible();
 await page.getByRole('button',{name:'元データを保護して新しく始める'}).click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await expect(page.locator('#recovery-panel')).toBeHidden();
});

test('voxel adventure fresh arrival aims at the cache, assembles two beams and lights the first beacon',async({page},info)=>{
 test.setTimeout(180000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Passive snapshot observation supplies an aim target, never inventory/position edits.
 await page.addInitScript(()=>{window.Worker=new Proxy(window.Worker,{construct(Target,args,newTarget){const worker=Reflect.construct(Target,args,newTarget) as Worker;worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.type==='snapshot')(window as typeof window&{openingState?:unknown}).openingState=event.data.state;});return worker;}});});
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await expect(page.locator('#journey')).toContainText('木材で最初の灯をつなごう');
 await expectOpeningJourneyFits(page);
 await page.screenshot({path:info.outputPath('fresh-arrival-cache.png'),scale:'css'});
 const aimAt=async(id?:number,height=.35)=>{
 const aim=await page.evaluate(({id,height})=>{
  type V={x:number;y:number;z:number};type S={player:V;adventure:{resources:(V&{kind:string;drop?:boolean;id:number})[]}};
  const state=(window as typeof window&{openingState:S}).openingState,p=state.player,wood=state.adventure.resources.find(n=>id===undefined?n.kind==='wood'&&n.drop:n.id===id)!;
  let yaw=0;for(let i=0;i<12;i++)yaw=Math.atan2(p.x+.6*Math.cos(yaw)-wood.x,p.z-.6*Math.sin(yaw)-wood.z);
  const pitch=Math.atan2(p.y+1.35-wood.y-height,Math.hypot(p.x+.6*Math.cos(yaw)-wood.x,p.z-.6*Math.sin(yaw)-wood.z));
  const app=document.querySelector<HTMLElement>('#app')!;return {id:wood.id,dx:-(yaw-Number(app.dataset.cameraYaw))/.006,dy:(pitch-Number(app.dataset.cameraPitch))/.006};
 },{id,height});
 if(info.project.name==='android-chromium'){
  const touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:430,y:150,id:63}]});
  for(let i=1;i<=8;i++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:430+aim.dx*i/8,y:150+aim.dy*i/8,id:63}]});await page.waitForTimeout(20);}
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(430,150);await page.mouse.down({button:'middle'});await page.mouse.move(430+aim.dx,150+aim.dy,{steps:8});await page.mouse.up({button:'middle'});}
 return aim;
 };
 const aim=await aimAt();
 await expect(page.locator('#app')).toHaveAttribute('data-interaction','r:'+aim.id);await expect(page.locator('#interact')).toContainText('拾う');
 await page.screenshot({path:info.outputPath('aimed-opening-cache.png'),scale:'css'});await page.locator('#interact').click();
 await expect(page.locator('#journey')).toContainText('木の梁を二つ作ろう');
 await page.locator('#journey').click();await expect(page.locator('#power-kind')).toBeVisible();
 await page.locator('#powers-panel [data-power=create]').click();await expect(page.locator('#power-preview')).toBeVisible();
 await page.locator('#powers-panel [data-power=preview-confirm]').click();await expect.poll(async()=>(await sky(page))?.parts.filter(p=>p.id>0).length).toBeGreaterThan(0);
 await page.locator('#powers-close').click();await expect(page.locator('#journey')).toContainText('もう一つ、木の梁を作ろう');
 await page.screenshot({path:info.outputPath('first-real-construction.png'),scale:'css'});
 await page.locator('#journey').click();await page.locator('#powers-panel [data-power=create-adjacent]').click();
 await expect(page.locator('#power-preview')).toBeVisible();await page.locator('#powers-panel [data-power=preview-confirm]').click();
 await expect.poll(async()=>(await sky(page))?.parts.length).toBe(2);
 await page.locator('#powers-panel [data-power=grab]').click();await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(true);
 await page.locator('#powers-panel [data-power=glue]').click();await page.locator('#powers-panel [data-power=preview-confirm]').click();
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{openingState:{adventure:{skybound:{parts:{links:number[]}[]}}}}).openingState.adventure.skybound.parts.every(p=>p.links.length>0))).toBe(true);
 await page.locator('#powers-panel [data-power=release]').click();await page.locator('#powers-close').click();
 await expect(page.locator('#journey')).toContainText('最初の灯をともそう');
 const distanceToBeacon=()=>page.evaluate(()=>{const s=(window as typeof window&{openingState:{player:{x:number;z:number}}}).openingState;return Math.hypot(s.player.x,s.player.z-3);});
 if(info.project.name==='android-chromium'){
  const touch=await page.context().newCDPSession(page),stick=await page.locator('#stick').boundingBox();if(!stick)throw Error('Movement stick missing');const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:64}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-40,id:64}]});
  try{await expect.poll(distanceToBeacon).toBeLessThan(2.3);}finally{await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 }else{await page.keyboard.down('KeyW');try{await expect.poll(distanceToBeacon).toBeLessThan(2.3);}finally{await page.keyboard.up('KeyW');}}
 await aimAt(810001,.8);await expect(page.locator('#app')).toHaveAttribute('data-interaction','r:810001');await expect(page.locator('#interact')).toContainText('灯をともす');await page.locator('#interact').click();
 await expect(page.locator('#journey')).toContainText('斜路');await page.screenshot({path:info.outputPath('first-beacon-lit-through-play.png'),scale:'css'});expect(errors).toEqual([]);
});
