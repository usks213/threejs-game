import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {installCoopBrowserImpairment} from '../helpers/coop-browser-impairment';
import type {SkyboundSnapshot} from '../../src/game/skybound/types';
import type {EditOperation} from '../../src/world/types';
import type {PeerRenderSample} from '../../src/rendering/scene/peer-render-probe';
import {COOP_PROTOCOL,type CoopAction,type CoopServerPacket} from '../../src/networking/coop-protocol';
import type {CoopActionResult} from '../../src/networking/coop-client';
declare global {interface Window {coopActionSubmissions:{message:CoopAction;result:CoopActionResult}[]}}
// These contexts span tests. Keep their traces under this file's control,
// including retries; the runner would otherwise start a second trace.
test.use({trace:'off'});
test.describe.serial('two real browsers',()=>{
 type Ack=Extract<CoopServerPacket,{type:'ack'}>;
 const wire=new Map<Page,{actions:{commandId:string;action:string;id?:string}[];acks:Map<string,Ack>;edits:Map<number,EditOperation>;welcomeEdits:EditOperation[]}>();
 let contexts:BrowserContext[]=[],a:Page,b:Page,code='',identity='',expectedEditCount=0,errors:string[]=[],failed=false,tracePaths:string[]=[];
 const stage=(name:string)=>console.log('COOP_BROWSER_PHASE',name);
 const running=(page:Page)=>expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const diagnostics=async(page:Page)=>{
  console.log('COOP_BROWSER_LOCATION',page.url());
  for(const [selector,attribute]of [['#app','data-diagnostics'],['#app','data-aim'],['#app','data-combat'],['#app','data-skybound'],['#app','data-streaming'],['#game','data-rendered-peers'],['#game','data-peer-render-error'],['#session-status','data-last-ack'],['#session-status','data-last-command'],['#session-status','data-last-command-result']]as const)console.log('COOP_DIAGNOSTIC',attribute,await page.locator(selector).getAttribute(attribute,{timeout:1000}).catch(()=>null));
  console.log('COOP_NOTICE',await page.locator('#notice').textContent({timeout:1000}).catch(()=>null));
 };
 test.beforeAll(async({browser},info)=>{
  test.setTimeout(180000);stage('startup and room join');errors=[];failed=false;wire.clear();tracePaths=[0,1].map(i=>info.outputPath(`coop-browser-${i}.zip`));try{
  contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5})));
  await Promise.all(contexts.map(context=>context.tracing.start({screenshots:true,snapshots:true,sources:true})));
  [a,b]=await Promise.all(contexts.map(context=>context.newPage()));
  for(const page of[a,b]){
   page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(installCoopBrowserImpairment);
   // Observe the production submission receipt. No action or packet is
   // synthesized; a queued receipt remains final even before native framesent.
   await page.addInitScript(()=>{window.coopActionSubmissions=[];document.addEventListener('coop-action-submission',event=>window.coopActionSubmissions.push((event as CustomEvent<Window['coopActionSubmissions'][number]>).detail));});
   const observed={actions:[] as {commandId:string;action:string;id?:string}[],acks:new Map<string,Ack>(),edits:new Map<number,EditOperation>(),welcomeEdits:[] as EditOperation[]};wire.set(page,observed);
   // Observe the actual transport before navigation, including reconnects. Keep
   // only action IDs/results; never retain or log handshake/resume capabilities.
   page.on('websocket',socket=>{
    socket.on('framereceived',frame=>{try{
     const packet=JSON.parse(String(frame.payload));
     if(packet.type==='welcome')observed.welcomeEdits=packet.save.edits;
     if(packet.type==='welcome')console.log('COOP_BASELINE',JSON.stringify({epoch:packet.epoch,tick:packet.state?.tick,ack:packet.state?.ack,edits:packet.state?.edits,playerId:packet.playerId}));
     if(packet.type==='welcome'||packet.type==='frame'||packet.type==='delta')for(const edit of packet.edits??packet.save?.edits??[])observed.edits.set(edit.id,edit);
     if(packet.type==='ack'&&typeof packet.commandId==='string'&&typeof packet.accepted==='boolean'&&typeof packet.message==='string')observed.acks.set(packet.commandId,{type:'ack',commandId:packet.commandId,accepted:packet.accepted,message:packet.message});
     if(packet.type==='ack'||packet.type==='notice')console.log('COOP_SERVER_REPLY',JSON.stringify(packet));
    }catch{}});
    socket.on('framesent',frame=>{try{
     const packet=JSON.parse(String(frame.payload));
     if(packet.type==='action'){
      if(typeof packet.commandId==='string'&&packet.message?.type==='game-action'&&typeof packet.message.action==='string')observed.actions.push({commandId:packet.commandId,action:packet.message.action,id:packet.message.id});
      console.log('COOP_UI_ACTION',JSON.stringify(packet.message));
     }
    }catch{}});
   });
   page.on('requestfailed',r=>console.log('COOP_REQUEST_FAILED',r.url().split('?')[0],r.failure()?.errorText));await page.goto('/?coopRenderProbe=1',{waitUntil:'domcontentloaded',timeout:45000});await running(page);await page.locator('#session-menu').click();
  }
  stage('create room');await a.locator('#session-host').click();await expect(a.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await running(a);await expect(a.locator('#session-panel')).toBeVisible();code=await a.locator('#session-code').inputValue();
  stage('join second browser');await b.locator('#session-code').fill(code);await b.locator('#session-join').click();await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await running(b);await expect(b.locator('#session-panel')).toBeVisible();
  identity=(await b.locator('#session-status').getAttribute('data-player'))!;expect(identity).not.toBe(await a.locator('#session-status').getAttribute('data-player'));
  // Both connections remain live; only one software-GPU view renders at a time.
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-players','2');await page.keyboard.press('Escape');await running(page);await page.locator('#session-menu').click();}
  for(const page of[a,b])await page.evaluate(()=>{window.coopDeliveryFault.enabled=true;});
  stage('two browsers ready with 150ms injected RTT');}catch(error){failed=true;await Promise.all([a,b].filter(Boolean).map(diagnostics));throw error;}
 });
 test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus){failed=true;for(const page of[a,b].filter(Boolean))await diagnostics(page);}});
 test.afterAll(async()=>{await Promise.allSettled(contexts.map((c,i)=>Promise.race([c.tracing.stop(failed?{path:tracePaths[i]}:undefined),new Promise<void>(r=>setTimeout(r,5000))])));await Promise.allSettled(contexts.map(c=>Promise.race([c.close(),new Promise<void>(r=>setTimeout(r,5000))])));});
 test('resolve a simultaneous shared supply pickup without duplicating inventory',async()=>{
  test.setTimeout(90000);stage('shared pickup conflict');
  for(const page of[a,b]){await page.keyboard.press('Escape');await page.locator('#adventure-menu').click();await page.locator('[data-tab=bag]').click();await expect(page.locator('[data-drop-kind=wood]')).toBeVisible();}
  const targetA=await a.locator('[data-drop-kind=wood]').getAttribute('data-id'),targetB=await b.locator('[data-drop-kind=wood]').getAttribute('data-id');expect(targetA).toBe(targetB);
  await a.locator('[data-drop-kind=wood]').focus();await b.locator('[data-drop-kind=wood]').focus();
  await Promise.all([a.keyboard.press('Enter'),b.keyboard.press('Enter')]);
  await expect.poll(async()=>Number(await a.locator('#bag-material-counts [data-item=wood]').getAttribute('data-count'))+Number(await b.locator('#bag-material-counts [data-item=wood]').getAttribute('data-count'))).toBe(12);
  const replay=()=>{for(const page of[a,b]){const actions=wire.get(page)!.actions.filter(action=>action.action==='gather');for(const action of actions)if(actions.filter(other=>other.commandId===action.commandId).length>1)return {page,id:action.commandId};}return undefined;};
  await expect.poll(()=>replay()?.id).toBeTruthy();const retried=replay()!;await expect.poll(()=>wire.get(retried.page)!.acks.get(retried.id)?.accepted).toBe(false);
  // The retry's receipt has arrived: the original successful transfer still
  // appears exactly once in the real UI, not just before a delayed replay.
  await expect.poll(async()=>Number(await a.locator('#bag-material-counts [data-item=wood]').getAttribute('data-count'))+Number(await b.locator('#bag-material-counts [data-item=wood]').getAttribute('data-count'))).toBe(12);
  await expect(a.locator('[data-drop-kind=wood]')).toHaveCount(0);await expect(b.locator('[data-drop-kind=wood]')).toHaveCount(0);
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-last-command',new RegExp('gather'));await page.keyboard.press('Escape');await page.locator('#session-menu').click();}
  stage('single transfer verified');
 });
 test('move one shared creative block, reject a competing grab and recover expired or disconnected leases',async({},info)=>{
  test.setTimeout(180000);stage('NET-A02 shared creative block');
  const pages=[a,b],playerIds=await Promise.all(pages.map(page=>page.locator('#session-status').getAttribute('data-player')));
  const sky=async(page:Page)=>JSON.parse(await page.locator('#app').getAttribute('data-skybound')??'null') as SkyboundSnapshot|null;
  const nextAck=async(page:Page,commandId:string,action:string,id:string)=>{
   const observed=wire.get(page)!;
   await expect.poll(()=>observed.actions.some(command=>command.commandId===commandId&&command.action===action&&command.id===id),{message:`The UI sends queued ${action} for ${id} with its original command ID`,timeout:20000}).toBe(true);
   // Menu/blur release commands can receive delayed ACKs. Only this exact
   // outgoing action's ACK is evidence, even if another ACK arrives afterward.
   await expect.poll(()=>observed.acks.has(commandId),{message:`Authority acknowledges ${action} for ${id}`,timeout:30000}).toBe(true);
   return observed.acks.get(commandId)!;
  };
  const actionGap=async(page:Page)=>{
   const tick=Number(await page.locator('#session-status').getAttribute('data-tick'));
   await expect.poll(async()=>Number(await page.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThanOrEqual(tick+4);
  };
  const submit=async(page:Page,control:string,action:string,id:string,activate=()=>page.locator(control).click())=>{
   const deadline=Date.now()+30000;
   while(Date.now()<deadline){
    await expect(page.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:Math.max(1,deadline-Date.now())});
    const start=await page.evaluate(()=>window.coopActionSubmissions.length);await activate();
    const result=await page.evaluate(({start,action,id})=>window.coopActionSubmissions.slice(start).find(submission=>submission.message.type==='game-action'&&submission.message.action===action&&submission.message.id===id)?.result,{start,action,id});
    if(result?.status==='queued')return result.commandId;
    // Resync may begin between the online check and real input. Retry only a
    // proven refusal or a draft whose commit callback never ran. Missing native
    // framesent/ACK alone cannot justify another potentially destructive click.
    if(!result&&control.includes('preview-confirm')&&await page.locator('#power-preview').isVisible())continue;
    expect(result,`The ${action} click must report whether it entered the replay queue`).toEqual({status:'refused',reason:'offline'});
   }
   throw Error(`The UI could not submit ${action} for ${id} after resync`);
  };
  const command=async(page:Page,control:string,action:string,id:string)=>{
   await actionGap(page);const commandId=await submit(page,control,action,id);
   const ack=await nextAck(page,commandId,action,id);expect(ack,ack.message).toMatchObject({accepted:true});
  };
  // Spend only the winning player's actual shared pickup from the preceding
  // case. No save import, world-state injection or synthetic game actions.
  const wood=await Promise.all(pages.map(async page=>Number(await page.locator('#bag-material-counts [data-item=wood]').getAttribute('data-count'))));
  expect([...wood].sort((x,y)=>x-y)).toEqual([0,12]);const creator=pages[wood.indexOf(12)],creatorId=playerIds[wood.indexOf(12)]!;
  for(const page of pages){await page.keyboard.press('Escape');await page.locator('#powers-menu').click();await expect(page.locator('#powers-panel')).toBeVisible();}
  // Both real connections stay live while their open panels park GPU rendering.
  const originalIds=(await sky(creator))!.parts.map(part=>part.id);
  await creator.locator('#power-kind').selectOption('block');await creator.locator('#power-material').selectOption('wood');await creator.locator('#powers-panel [data-power=create]').click();
  await expect(creator.locator('#power-preview')).toBeVisible();await expect(creator.locator('#power-preview-description')).toContainText('3個');expect((await sky(creator))!.parts.map(part=>part.id)).toEqual(originalIds);
  await command(creator,'#power-preview [data-power=preview-confirm]','sky-part','block:wood');
  await expect.poll(async()=>(await sky(creator))?.parts.length).toBe(originalIds.length+1);
  const created=(await sky(creator))!.parts.find(part=>!originalIds.includes(part.id))!;expect(created).toMatchObject({kind:'block',material:'wood',creator:creatorId});const partId=String(created.id);
  const part=async(page:Page)=>(await sky(page))?.parts.find(part=>part.id===created.id);
  for(const page of pages){await expect.poll(async()=>(await part(page))?.id).toBe(created.id);await page.locator('#power-part').selectOption(partId);await expect(page.locator('#power-part')).toHaveValue(partId);await expect(page.locator('#powers-current')).toContainText(page===creator?'木 9 /':'木 0 /');}
  await command(creator,'#power-share','sky-share',partId+':on');
  for(const page of pages)await expect.poll(async()=>(await part(page))?.shared).toBe(true);

  stage('real lost-delta recovery while powers stays open');
  const epochs=await Promise.all(pages.map(page=>page.locator('#app').getAttribute('data-world-epoch'))),welcomes=await Promise.all(pages.map(async page=>Number(await page.locator('#session-status').getAttribute('data-welcome-count'))));
  for(const page of pages)await page.evaluate(()=>{(window as typeof window&{coopDeliveryFault:{skipNextDelta:boolean}}).coopDeliveryFault.skipNextDelta=true;});
  for(const [i,page]of pages.entries()){
   await expect.poll(()=>page.evaluate(()=>(window as typeof window&{coopDeliveryFault:{skipped:number}}).coopDeliveryFault.skipped)).toBe(1);
   await expect.poll(async()=>Number(await page.locator('#session-status').getAttribute('data-welcome-count'))).toBeGreaterThan(welcomes[i]);
   await expect(page.locator('#session-status')).toHaveAttribute('data-welcome-mode','continued');await expect(page.locator('#app')).toHaveAttribute('data-world-epoch',epochs[i]!);await running(page);await expect(page.locator('#powers-panel')).toBeVisible();
   await expect.poll(async()=>(await part(page))?.id).toBe(created.id);await page.locator('#power-part').selectOption(partId);
  }
  stage('same part concurrent grab after full resync');await Promise.all(pages.map(actionGap));
  for(const page of pages)await page.locator('#powers-panel [data-power=grab]').focus();
  const commandIds=await Promise.all(pages.map(page=>submit(page,'#powers-panel [data-power=grab]','sky-grab',partId,()=>page.keyboard.press('Enter'))));
  const replies=await Promise.all(pages.map((page,i)=>nextAck(page,commandIds[i],'sky-grab',partId)));
  expect(replies.map(reply=>reply.accepted).sort()).toEqual([false,true]);
  const holderIndex=replies.findIndex(reply=>reply.accepted),holder=pages[holderIndex],other=pages[1-holderIndex],holderId=playerIds[holderIndex]!,otherId=playerIds[1-holderIndex]!;
  expect(replies[1-holderIndex].message).toBe('別の冒険者が操作しています');await expect(other.locator('#notice')).toContainText(replies[1-holderIndex].message);
  for(const page of pages)await expect.poll(async()=>(await part(page))?.lease?.owner).toBe(holderId);
  const before={...(await part(holder))!.position};
  // A loose box can settle beside the starting runestone. Move up and toward
  // the players (+z at their unchanged heading), away from its protected core.
  const holderPose=JSON.parse(await other.locator('#session-status').getAttribute('data-peers')??'[]').find((peer:{id:string;heading:number})=>peer.id===holderId) as {heading:number};expect(holderPose.heading).toBeCloseTo(0,6);
  await holder.locator('#powers-panel [data-power=up]').click();await expect(holder.locator('#power-preview')).toBeVisible();await holder.locator('#powers-panel [data-power=forward]').click();
  for(const page of pages)expect((await part(page))!.position).toEqual(before);
  await command(holder,'#power-preview [data-power=preview-confirm]','sky-move',partId);
  const moved={x:Math.round((before.x+Math.sin(holderPose.heading)*.5)*8)/8,y:Math.round((before.y+.5)*8)/8,z:Math.round((before.z+Math.cos(holderPose.heading)*.5)*8)/8};
  for(const page of pages)await expect.poll(async()=>(await part(page))?.position).toEqual(moved);
  stage('shared block position converged');

  await command(holder,'#powers-panel [data-power=release]','sky-release',partId);
  for(const page of pages)await expect.poll(async()=>!!(await part(page))?.lease).toBe(false);
  await command(other,'#powers-panel [data-power=grab]','sky-grab',partId);
  for(const page of pages)await expect.poll(async()=>(await part(page))?.lease?.owner).toBe(otherId);
  const expiresTick=(await part(other))!.lease!.expiresTick;
  // Let the real authority clock expire an idle lease; do not advance fake time.
  for(const page of pages){await expect.poll(async()=>!!(await part(page))?.lease,{timeout:20000}).toBe(false);expect(Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThanOrEqual(expiresTick);}
  stage('idle lease expired and reusable');await command(other,'#powers-panel [data-power=grab]','sky-grab',partId);
  for(const page of pages)await expect.poll(async()=>(await part(page))?.lease?.owner).toBe(otherId);
  await other.context().setOffline(true);
  try{
   await expect(other.locator('#session-status')).toHaveAttribute('data-connection','reconnecting',{timeout:25000});
   await expect.poll(async()=>!!(await part(holder))?.lease,{timeout:20000}).toBe(false);
   await command(holder,'#powers-panel [data-power=grab]','sky-grab',partId);await expect.poll(async()=>(await part(holder))?.lease?.owner).toBe(holderId);
   await command(holder,'#powers-panel [data-power=release]','sky-release',partId);
  }finally{await other.context().setOffline(false);}
  await expect(other.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:45000});await expect(other.locator('#session-status')).toHaveAttribute('data-player',otherId);
  for(const page of pages){await expect(page.locator('#session-status')).toHaveAttribute('data-players','2');await expect.poll(async()=>!!(await part(page))?.lease).toBe(false);await page.locator('#power-part').selectOption(partId);}
  await command(other,'#powers-panel [data-power=grab]','sky-grab',partId);
  for(const page of pages)await expect.poll(async()=>(await part(page))?.lease?.owner).toBe(otherId);
  const restoredPosition=(await part(other))!.position;await expect.poll(async()=>(await part(holder))?.position).toEqual(restoredPosition);
  await command(other,'#powers-panel [data-power=release]','sky-release',partId);
  for(const page of pages){await expect.poll(async()=>!!(await part(page))?.lease).toBe(false);await page.locator('#powers-close').click();await page.locator('#session-menu').click();}
  stage('NET-A09 release despite one lost idle packet');
  await b.locator('#session-close').click();await running(b);
  const delayedPeer=async()=>JSON.parse(await a.locator('#session-status').getAttribute('data-peers')??'[]').find((peer:{id:string})=>peer.id===identity) as {x:number;z:number};
  const beforeMotion=(await delayedPeer()).x;await b.keyboard.down('KeyD');
  try{await expect.poll(async()=>(await delayedPeer()).x,{intervals:[50,100]}).toBeGreaterThan(beforeMotion+.35);await b.evaluate(()=>{window.coopDeliveryFault.dropNextIdle=true;});}finally{await b.keyboard.up('KeyD');}
  await expect.poll(()=>b.evaluate(()=>window.coopDeliveryFault.stats.droppedIdleInputs)).toBe(1);
  const releasedTick=Number(await a.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await a.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThanOrEqual(releasedTick+20);
  const stopped={...await delayedPeer()},settledTick=Number(await a.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await a.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThanOrEqual(settledTick+20);
  const afterStop=await delayedPeer();expect(Math.hypot(afterStop.x-stopped.x,afterStop.z-stopped.z)).toBeLessThan(.03);await b.locator('#session-menu').click();
  // The preceding ordinary pickup and all original lease assertions ran under
  // this profile. Count actual loss/retry events; never infer them from setup.
  for(const page of pages){await expect.poll(()=>page.evaluate(()=>window.coopDeliveryFault.stats.droppedDeltas),{timeout:20000}).toBe(2);await expect.poll(()=>page.evaluate(()=>window.coopDeliveryFault.stats.pingRttMs.length)).toBeGreaterThan(0);}
  const impairment=await Promise.all(pages.map(page=>page.evaluate(()=>window.coopDeliveryFault.stats)));
  expect(impairment.reduce((sum,stats)=>sum+stats.duplicatedActions,0)).toBe(1);
  for(const stats of impairment){expect(stats.delayedIncoming).toBeGreaterThan(0);expect(stats.delayedOutgoing).toBeGreaterThan(0);expect(Math.min(...stats.incomingDelayMs)).toBeGreaterThanOrEqual(70);expect(Math.min(...stats.outgoingDelayMs)).toBeGreaterThanOrEqual(70);expect(Math.min(...stats.pingRttMs)).toBeGreaterThanOrEqual(140);}
  await info.attach('impaired-browser-transport.json',{body:JSON.stringify({injectedOneWayMs:75,jitterMs:[0,25],note:'150ms added application RTT, plus actual internet and browser scheduling delay; not TCP packet loss or phone performance',clients:impairment,stopped,afterStop},null,2),contentType:'application/json'});
  for(const page of pages)await page.evaluate(()=>{window.coopDeliveryFault.enabled=false;});
  for(const page of pages)await expect.poll(()=>page.evaluate(()=>window.coopDeliveryFault.stats.queued)).toBe(0);
  expect(errors).toEqual([]);stage('NET-A02 lease and NET-A09 impaired transport verified');
 });
 test('move, turn and jump with mutually visible rendered avatars through the public authority',async({},info)=>{
  test.setTimeout(180000);stage('NET-A01 actual peer pixels');
  const rendered=async(page:Page)=>JSON.parse(await page.locator('#game').getAttribute('data-rendered-peers')??'[]') as PeerRenderSample[];
  const pan=async(page:Page,dx:number)=>{
   await page.bringToFront();await page.mouse.move(320,180);await page.mouse.down({button:'middle'});
   try{await page.mouse.move(320+dx,180,{steps:4});}finally{await page.mouse.up({button:'middle'});}
  };
  const evidence:unknown[]=[];
  for(const [actor,observer,key,direction]of [[b,a,'KeyD',1],[a,b,'KeyA',-1]] as const){
   const id=(await actor.locator('#session-status').getAttribute('data-player'))!;
   const peer=async()=>JSON.parse(await observer.locator('#session-status').getAttribute('data-peers')??'[]').find((p:{id:string})=>p.id===id) as {x:number;y:number;z:number;heading:number;grounded:boolean}|undefined;
   for(const page of[actor,observer]){await page.keyboard.press('Escape');await running(page);}
   // The lost-idle case already moved B east. The next westward run otherwise
   // leaves A beyond B's left frustum before its heading settles. Look toward
   // the peer with ordinary camera input; keep the real pixel/pose thresholds.
   await expect(observer.locator('#app')).toHaveAttribute('data-camera-yaw',/^-?\d/);await expect(observer.locator('#camera-sensitivity')).toHaveValue('1');
   const originalYaw=Number(await observer.locator('#app').getAttribute('data-camera-yaw'));
   await pan(observer,direction*100);await expect.poll(async()=>Number(await observer.locator('#app').getAttribute('data-camera-yaw'))).toBeCloseTo(originalYaw-direction*.6,5);
   const before=(await peer())!,start=await observer.evaluate(()=>performance.now());
   await actor.bringToFront();await actor.keyboard.down(key);try{await expect.poll(async()=>direction*((await peer())!.x-before.x),{intervals:[50,100],timeout:15000}).toBeGreaterThan(.45);}finally{await actor.keyboard.up(key);}
   // Park the moving client after release; the observing client draws the
   // interpolated model and asynchronously checks actual depth-passing pixels.
   await actor.locator('#session-menu').click();await observer.bringToFront();const moved=(await peer())!;
   await expect.poll(async()=>await observer.locator('#game').getAttribute('data-peer-render-error')).toBeNull();
   await expect.poll(async()=>(await rendered(observer)).some(p=>p.id===id&&p.at>start&&p.visible&&direction*(p.x-before.x)>.35&&Math.abs(Math.atan2(Math.sin(p.heading-moved.heading),Math.cos(p.heading-moved.heading)))<.25),{timeout:25000}).toBe(true);
   await observer.screenshot({path:info.outputPath(`peer-${direction===1?'east':'west'}-visible.png`),timeout:60000,scale:'css',animations:'disabled'});
   const ground=(await peer())!.y;
   // Each attempt is an ordinary grounded jump. Park the actor with the normal
   // Tab menu immediately after Space: a locator click waits two animation
   // frames, and running both SwiftShader views missed the entire jump in CI.
   // Authority input latches a received jump across the menu's idle release.
   let airborne=false;
   for(let attempt=0;attempt<3&&!airborne;attempt++){
    const jumpStart=await observer.evaluate(()=>performance.now());let observedPeak=ground,landedAt:number|undefined;
    try{
     await actor.bringToFront();await actor.keyboard.press('Escape');await actor.keyboard.press('Space');await actor.keyboard.press('Tab');await observer.bringToFront();
     await expect(actor.locator('#adventure-panel')).toBeVisible();
     await expect.poll(async()=>{const y=(await peer())!.y;observedPeak=Math.max(observedPeak,y);return y;},{intervals:[50,100]}).toBeGreaterThan(ground+.15);
     await expect.poll(async()=>{const state=(await peer())!;observedPeak=Math.max(observedPeak,state.y);return state.grounded;},{intervals:[50,100],timeout:15000}).toBe(true);
     landedAt=await observer.evaluate(()=>performance.now());
     // Visibility queries in the recorded software-GPU runs completed 7.55–10.16s
     // after the actual color draw. Drain through a post-landing draw before
     // calling this a missed airborne frame; FIFO collection retires all older
     // queries first. A stalled/unsupported readout remains an explicit failure.
     const visibleJump=(samples:PeerRenderSample[])=>samples.some(p=>p.id===id&&p.at>jumpStart&&p.visible&&p.y>ground+.15);
     await expect.poll(async()=>{const samples=await rendered(observer);return visibleJump(samples)||samples.some(p=>p.id===id&&p.at>=landedAt!);},{message:'GPU visibility results complete through the real jump and landing',intervals:[100,200],timeout:15000}).toBe(true);
     airborne=visibleJump(await rendered(observer));
    }finally{
     await info.attach(`peer-${direction===1?'east':'west'}-jump-${attempt+1}.json`,{body:JSON.stringify({ground,jumpStart,landedAt,observedPeak,airborne,rendered:await rendered(observer),diagnostics:JSON.parse(await observer.locator('#app').getAttribute('data-diagnostics')??'{}'),skippedQueries:await observer.locator('#game').getAttribute('data-peer-render-skipped')},null,2),contentType:'application/json'});
    }
   }
   expect(airborne,'The remote jump must produce visible canvas pixels, not only a received snapshot').toBe(true);
   evidence.push({direction,authoritativeBefore:before,authoritativeMoved:moved,rendered:await rendered(observer)});
   // Movement is camera-relative. Restore this observer before it becomes the
   // next actor or performs the following real terrain-tool walk.
   await pan(observer,-direction*100);await expect.poll(async()=>Number(await observer.locator('#app').getAttribute('data-camera-yaw'))).toBeCloseTo(originalYaw,5);
   await observer.locator('#session-menu').click();
  }
  await info.attach('mutual-avatar-render-evidence.json',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});expect(errors).toEqual([]);stage('mutual movement heading and airborne pixels verified');
 });
 test('commit a terrain edit and verify remote rendered surface and collision',async({},info)=>{
  test.setTimeout(210000);stage('visible terrain tool');await a.keyboard.press('Escape');await running(a);
  // The initial camera aimed into the protected arrival/landmark cores. Walk
  // east using real input before digging; keep both clients on the same world.
  const creator=await a.locator('#session-status').getAttribute('data-player');
  await a.keyboard.down('KeyD');try{await expect.poll(async()=>JSON.parse(await b.locator('#session-status').getAttribute('data-peers')??'[]').find((p:{id:string})=>p.id===creator)?.x??-999).toBeGreaterThan(4.2);}finally{await a.keyboard.up('KeyD');}
  await expect.poll(async()=>Number(await a.locator('#position').getAttribute('data-x'))).toBeGreaterThan(4.2);
  await a.locator('#adventure-menu').click();await a.locator('[data-tab=build]').click();await a.locator('[data-game-action=tool][data-id=dig]').click();
  await a.mouse.move(400,150);await a.mouse.down({button:'middle'});await a.mouse.move(400,220,{steps:4});await a.mouse.up({button:'middle'});await expect(a.locator('#use-tool')).toBeEnabled();
  const priorEditCount=Number(await a.locator('#edit-count').getAttribute('data-count'));console.log('COOP_PRE_EDIT_AIM',await a.locator('#app').getAttribute('data-aim'));await a.locator('#use-tool').click();
  await expect.poll(async()=>Number(await a.locator('#edit-count').getAttribute('data-count')),{timeout:20000}).toBeGreaterThan(priorEditCount);expectedEditCount=Number(await a.locator('#edit-count').getAttribute('data-count'));await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount),{timeout:20000});
  const edit=wire.get(a)!.edits.get(priorEditCount+1)!;expect(edit?.kind).toBe('dig');await expect.poll(()=>wire.get(b)!.edits.get(priorEditCount+1)).toEqual(edit);
  console.log('COOP_EDIT_ACK',await a.locator('#session-status').getAttribute('data-last-ack'));await a.locator('#session-menu').click();
  const peer=async()=>JSON.parse(await a.locator('#session-status').getAttribute('data-peers')??'[]').find((p:{id:string})=>p.id===identity) as {x:number;y:number;z:number;grounded:boolean};
  await b.keyboard.press('Escape');await running(b);
  // Walk B to the actual server-accepted excavation using ordinary controls.
  // Receiving an edit count alone cannot prove either collision or rendering.
  for(const axis of ['x','z'] as const){
   const from=(await peer())[axis],to=edit.position[axis],direction=Math.sign(to-from);if(Math.abs(to-from)<.25)continue;
   const key=axis==='x'?(direction>0?'KeyD':'KeyA'):(direction>0?'KeyS':'KeyW');
   await b.keyboard.down(key);try{await expect.poll(async()=>direction*((await peer())[axis]-to),{intervals:[30,50,100],timeout:15000}).toBeGreaterThan(-.2);}finally{await b.keyboard.up(key);}
  }
  await expect.poll(async()=>Math.hypot((await peer()).x-edit.position.x,(await peer()).z-edit.position.z),{timeout:10000}).toBeLessThan(1.1);
  await expect.poll(async()=>(await peer()).grounded,{timeout:15000}).toBe(true);
  await expect.poll(async()=>(await peer()).y,{timeout:15000}).toBeLessThan(edit.position.y-.4);
  const collided=await peer();await expect.poll(async()=>Number(await b.locator('#position').getAttribute('data-y'))).toBeLessThan(edit.position.y-.4);
  // Looking steeply down makes the production renderer raycast the excavated
  // surface that supports B. No CPU fixture or test-only ray is substituted.
  await b.mouse.move(400,130);await b.mouse.down({button:'middle'});await b.mouse.move(400,300,{steps:4});await b.mouse.up({button:'middle'});
  const renderedAim=async()=>JSON.parse(await b.locator('#app').getAttribute('data-aim')??'{}') as {target?:{x:number;y:number;z:number}};
  await expect.poll(async()=>Number(await b.locator('#app').getAttribute('data-camera-pitch'))).toBeCloseTo(1.2,5);
  const firstAim=await renderedAim();let turnedAroundDebris=false;
  if(!firstAim.target||firstAim.target.y>=edit.position.y-.3||Math.hypot(firstAim.target.x-edit.position.x,firstAim.target.z-edit.position.z)>=2.3){
   // This real dig can release loose fragments on the east rim. They correctly
   // block the shoulder camera's original ray before it reaches the floor. Look
   // from the opposite side with normal middle drags; never ignore the debris.
   await b.bringToFront();await expect(b.locator('#app')).toHaveAttribute('data-camera-yaw',/^-?\d/);
   const yaw=Number(await b.locator('#app').getAttribute('data-camera-yaw'));
   for(let turn=0;turn<2;turn++){await b.mouse.move(400,150);await b.mouse.down({button:'middle'});try{await b.mouse.move(140,150,{steps:4});}finally{await b.mouse.up({button:'middle'});}}
   await expect.poll(async()=>Number(await b.locator('#app').getAttribute('data-camera-yaw'))).toBeCloseTo(yaw+3.12,5);turnedAroundDebris=true;
  }
  await expect.poll(async()=>(await renderedAim()).target?.y??Infinity,{timeout:20000}).toBeLessThan(edit.position.y-.3);
  const target=(await renderedAim()).target!;expect(Math.hypot(target.x-edit.position.x,target.z-edit.position.z)).toBeLessThan(2.3);
  await b.screenshot({path:info.outputPath('remote-excavation-collision.png'),timeout:60000,scale:'css',animations:'disabled'});
  await info.attach('terrain-render-collision-evidence.json',{body:JSON.stringify({edit,collided,firstAim,turnedAroundDebris,cameraYaw:await b.locator('#app').getAttribute('data-camera-yaw'),renderedAim:await renderedAim(),streaming:JSON.parse(await b.locator('#app').getAttribute('data-streaming')??'{}')},null,2),contentType:'application/json'});
  stage('NET-A04 leave and re-enter the same excavated floor');
  const beforeReentryEdits=[...wire.get(b)!.edits.values()].sort((left,right)=>left.id-right.id);expect(beforeReentryEdits).toHaveLength(expectedEditCount);
  const beforeReentryEpoch=await b.locator('#app').getAttribute('data-world-epoch');await b.locator('#session-menu').click();await b.locator('#session-leave').click();await expect(a.locator('#session-status')).toHaveAttribute('data-players','1');await b.locator('#session-close').click();await running(b);
  await b.locator('#session-menu').click();await b.locator('#session-code').fill(code);await b.locator('#session-join').click();await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await expect(b.locator('#session-status')).toHaveAttribute('data-player',identity);await running(b);await expect(b.locator('#app')).not.toHaveAttribute('data-world-epoch',beforeReentryEpoch!);await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount));await expect(a.locator('#session-status')).toHaveAttribute('data-players','2');expect(wire.get(b)!.welcomeEdits).toEqual(beforeReentryEdits);
  await b.locator('#session-close').click();await expect.poll(async()=>(await peer()).grounded).toBe(true);await expect.poll(async()=>(await peer()).y).toBeCloseTo(collided.y,1);const restoredFloor=(await peer()).y;
  // A real jump and landing distinguish rebuilt collision from merely loading
  // a saved coordinate inside the hole. No teleport or fixture is introduced.
  await b.keyboard.press('Space');await expect.poll(async()=>(await peer()).y,{intervals:[50,100]}).toBeGreaterThan(restoredFloor+.15);await expect.poll(async()=>(await peer()).grounded).toBe(true);await expect.poll(async()=>(await peer()).y).toBeCloseTo(restoredFloor,1);await expect.poll(async()=>Number(await b.locator('#position').getAttribute('data-y'))).toBeCloseTo(restoredFloor,1);
  await expect.poll(async()=>(await renderedAim()).target?.y??Infinity).toBeLessThan(edit.position.y-.3);const reentryTarget=(await renderedAim()).target!;expect(Math.hypot(reentryTarget.x-edit.position.x,reentryTarget.z-edit.position.z)).toBeLessThan(2.3);
  await b.screenshot({path:info.outputPath('remote-excavation-reentry.png'),timeout:60000,scale:'css',animations:'disabled'});await info.attach('terrain-reentry-evidence.json',{body:JSON.stringify({edit,beforeReentryEpoch,afterReentryEpoch:await b.locator('#app').getAttribute('data-world-epoch'),restoredFloor,landed:await peer(),renderedAim:await renderedAim()},null,2),contentType:'application/json'});
  await b.locator('#session-menu').click();expect(errors).toEqual([]);stage('shared edit rendered and collision verified before and after re-entry');
 });
 test('reconnect, restore a late browser and continue after the creator leaves',async({browser})=>{
  test.setTimeout(180000);stage('disconnect and reconnect');await contexts[1].setOffline(true);
  try{
   await expect(b.locator('#session-status')).toHaveAttribute('data-connection','reconnecting',{timeout:25000});
   stage('NET-A05 terrain edit while second browser is offline');const before=expectedEditCount;
   // A retains the real dig tool and clear camera position from the preceding
   // case. Deepen that visible excavation while B cannot receive any frames.
   await a.keyboard.press('Escape');await running(a);await expect(a.locator('#use-tool')).toBeEnabled();await a.locator('#use-tool').click();
   await expect.poll(async()=>Number(await a.locator('#edit-count').getAttribute('data-count')),{timeout:20000}).toBeGreaterThan(before);
   expectedEditCount=Number(await a.locator('#edit-count').getAttribute('data-count'));await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(before));await a.locator('#session-menu').click();
  }finally{await contexts[1].setOffline(false);}
  await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:45000});await expect(b.locator('#session-status')).toHaveAttribute('data-player',identity);await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount));
  stage('fresh late join');const lateContext=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5});
  try{const late=await lateContext.newPage();late.setDefaultTimeout(20000);await late.goto('/#join='+code,{waitUntil:'domcontentloaded',timeout:45000});await late.locator('#session-join').click();await expect(late.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await expect(late.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount),{timeout:30000});await late.locator('#session-leave').click();}finally{await Promise.race([lateContext.close(),new Promise<void>(r=>setTimeout(r,5000))]);}
  stage('creator leaves');await a.locator('#session-leave').click();await expect(b.locator('#session-status')).toHaveAttribute('data-players','1');const tick=Number(await b.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await b.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThan(tick);
  await b.keyboard.press('Escape');await running(b);await b.screenshot({path:'test-results/coop-two-browser.png',timeout:60000,scale:'css',animations:'disabled'});expect(errors).toEqual([]);stage('reconnect and persistence verified');
 });
});

test('two real browsers acceptance: room error UI explains refusals and allows safe recovery',async({page},info)=>{
 test.setTimeout(150000);page.setDefaultTimeout(20000);
 type Fault='none'|'version'|'room'|'malformed';let fault:Fault='none',welcomes=0,connections=0;
 const notices:{fault:Fault;message:string}[]=[],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 // The game still talks to the real endpoint. Only the outgoing handshake is
 // deliberately damaged, one clause at a time; server replies are untouched.
 await page.routeWebSocket(/\/coop\/[a-f0-9]{48}$/,socket=>{
  connections++;const selected=fault,server=socket.connectToServer();
  socket.onMessage(message=>{
   try{const packet=JSON.parse(String(message));if(packet.type==='hello'){
    if(selected==='version')packet.protocol=-1;
    if(selected==='room')packet.roomId=packet.roomId==='f'.repeat(48)?'e'.repeat(48):'f'.repeat(48);
    if(selected==='malformed')packet.resumeKey='invalid';
    server.send(JSON.stringify(packet));return;
   }}catch{/* Unmodified non-JSON messages still exercise the real server. */}
   server.send(message);
  });
  server.onMessage(message=>{try{const packet=JSON.parse(String(message));if(packet.type==='welcome')welcomes++;if(packet.type==='notice')notices.push({fault:selected,message:packet.message});}catch{}socket.send(message);});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const originalEdits=await page.locator('#edit-count').getAttribute('data-count');
 await page.locator('#session-menu').click();await page.locator('#session-code').fill('invalid-code');await page.locator('#session-join').click();
 await expect(page.locator('#notice')).toContainText('招待コードが不正');await expect(page.locator('#session-status')).toHaveAttribute('data-connection','closed');expect(connections).toBe(0);
 const code=await page.evaluate(()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join(''));
 await page.locator('#session-code').fill(code);await page.context().setOffline(true);
 try{await page.locator('#session-join').click();await expect(page.locator('#session-status')).toContainText('再接続中');await page.locator('#session-leave').click();await expect(page.locator('#session-status')).toHaveAttribute('data-connection','closed');}
 finally{await page.context().setOffline(false);}
 await page.locator('#session-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await expect(page.locator('#edit-count')).toHaveAttribute('data-count',originalEdits!);expect(connections).toBe(0);
 for(const selected of ['version','room','malformed'] as const){
  fault=selected;await page.locator('#session-menu').click();await page.locator('#session-code').fill(code);await page.locator('#session-join').click();
  if(selected==='room')await expect(page.locator('#notice')).toContainText('部屋と接続先が一致しません');
  else{await expect(page.locator('#session-status')).toHaveAttribute('data-connection','closed',{timeout:25000});await expect(page.locator('#notice')).toContainText('接続情報またはゲームの版を確認');}
  expect(welcomes).toBe(0);await expect(page.locator('#session-status')).not.toHaveAttribute('data-player',/.+/);
  await page.locator('#session-leave').click();await page.locator('#session-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 }
 fault='none';
 // Four real, idle WebSockets exercise the capacity refusal without booting
 // four more GPU renderers. This is not a four-player performance result.
 try{
  await page.evaluate(async({room,protocol})=>{
   const clients:WebSocket[]=[];(window as typeof window&{acceptancePeers?:WebSocket[]}).acceptancePeers=clients;
   for(let i=0;i<4;i++)await new Promise<void>((resolve,reject)=>{
    const url=new URL('/coop/'+room,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(url);clients.push(socket);
    const timer=setTimeout(()=>reject(Error('Capacity client handshake timeout')),15000);
    socket.onopen=()=>socket.send(JSON.stringify({type:'hello',protocol,roomId:room,resumeKey:Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')}));
    socket.onmessage=event=>{const packet=JSON.parse(String(event.data));if(packet.delivery)socket.send(JSON.stringify({type:'delivery',token:packet.delivery}));if(packet.type==='welcome'){clearTimeout(timer);resolve();}else if(packet.type==='notice'){clearTimeout(timer);reject(Error(packet.message));}};
    socket.onerror=()=>{clearTimeout(timer);reject(Error('Capacity client connection failed'));};
   });
  },{room:code,protocol:COOP_PROTOCOL});
  expect(welcomes).toBe(4);await page.locator('#session-menu').click();await page.locator('#session-code').fill(code);await page.locator('#session-join').click();await expect(page.locator('#notice')).toContainText('この部屋は4人まで');expect(welcomes).toBe(4);await expect(page.locator('#session-status')).not.toHaveAttribute('data-player',/.+/);await page.locator('#session-leave').click();
 }finally{await page.evaluate(async()=>{const state=window as typeof window&{acceptancePeers?:WebSocket[]};await Promise.all((state.acceptancePeers??[]).map(socket=>new Promise<void>(resolve=>{if(socket.readyState===WebSocket.CLOSED){resolve();return;}socket.addEventListener('close',()=>resolve(),{once:true});socket.close();})));delete state.acceptancePeers;});}
 await page.locator('#session-code').fill(code);await page.locator('#session-join').click();await expect(page.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});expect(welcomes).toBe(5);await expect(page.locator('#session-status')).toHaveAttribute('data-players','1');
 await info.attach('room-refusal-and-recovery.json',{body:JSON.stringify({notices,welcomes,connections,invalidCodeRejectedBeforeConnection:true,offlineCancelled:true,capacityRefusalWithFourIdleSockets:true},null,2),contentType:'application/json'});
 await page.locator('#session-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await page.screenshot({path:info.outputPath('room-recovered.png'),timeout:60000,scale:'css'});await page.locator('#session-menu').click();await page.locator('#session-leave').click();expect(errors).toEqual([]);
});
