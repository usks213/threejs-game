import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import type {SkyboundSnapshot} from '../../src/game/skybound/types';
import type {CoopServerPacket} from '../../src/networking/coop-protocol';
// These contexts span tests. Keep their traces under this file's control,
// including retries; the runner would otherwise start a second trace.
test.use({trace:'off'});
test.describe.serial('two real browsers',()=>{
 let contexts:BrowserContext[]=[],a:Page,b:Page,code='',identity='',expectedEditCount=0,errors:string[]=[],failed=false,tracePaths:string[]=[];
 const stage=(name:string)=>console.log('COOP_BROWSER_PHASE',name);
 const running=(page:Page)=>expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const diagnostics=async(page:Page)=>{
  console.log('COOP_BROWSER_LOCATION',page.url());
  for(const [selector,attribute]of [['#app','data-diagnostics'],['#app','data-aim'],['#app','data-combat'],['#app','data-skybound'],['#session-status','data-last-ack'],['#session-status','data-last-command']]as const)console.log('COOP_DIAGNOSTIC',attribute,await page.locator(selector).getAttribute(attribute,{timeout:1000}).catch(()=>null));
  console.log('COOP_NOTICE',await page.locator('#notice').textContent({timeout:1000}).catch(()=>null));
 };
 test.beforeAll(async({browser},info)=>{
  test.setTimeout(180000);stage('startup and room join');errors=[];failed=false;tracePaths=[0,1].map(i=>info.outputPath(`coop-browser-${i}.zip`));try{
  contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5})));
  await Promise.all(contexts.map(context=>context.tracing.start({screenshots:true,snapshots:true,sources:true})));
  [a,b]=await Promise.all(contexts.map(context=>context.newPage()));
  for(const page of[a,b]){page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>{socket.on('framereceived',frame=>{try{const packet=JSON.parse(String(frame.payload));if(packet.type==='ack'||packet.type==='notice')console.log('COOP_SERVER_REPLY',JSON.stringify(packet));}catch{}});socket.on('framesent',frame=>{try{const packet=JSON.parse(String(frame.payload));if(packet.type==='action')console.log('COOP_UI_ACTION',JSON.stringify(packet.message));}catch{}});});page.on('requestfailed',r=>console.log('COOP_REQUEST_FAILED',r.url().split('?')[0],r.failure()?.errorText));await page.goto('/',{waitUntil:'domcontentloaded',timeout:45000});await running(page);await page.locator('#session-menu').click();}
  stage('create room');await a.locator('#session-host').click();await expect(a.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});code=await a.locator('#session-code').inputValue();
  stage('join second browser');await b.locator('#session-code').fill(code);await b.locator('#session-join').click();await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});
  identity=(await b.locator('#session-status').getAttribute('data-player'))!;expect(identity).not.toBe(await a.locator('#session-status').getAttribute('data-player'));
  // Both connections remain live; only one software-GPU view renders at a time.
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-players','2');await page.keyboard.press('Escape');await running(page);await page.locator('#session-menu').click();}
  stage('two browsers ready');}catch(error){failed=true;await Promise.all([a,b].filter(Boolean).map(diagnostics));throw error;}
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
  await expect(a.locator('[data-drop-kind=wood]')).toHaveCount(0);await expect(b.locator('[data-drop-kind=wood]')).toHaveCount(0);
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-last-command',new RegExp('gather'));await page.keyboard.press('Escape');await page.locator('#session-menu').click();}
  stage('single transfer verified');
 });
 test('move one shared creative block, reject a competing grab and recover expired or disconnected leases',async()=>{
  test.setTimeout(180000);stage('NET-A02 shared creative block');
  const pages=[a,b],playerIds=await Promise.all(pages.map(page=>page.locator('#session-status').getAttribute('data-player')));
  const sky=async(page:Page)=>JSON.parse(await page.locator('#app').getAttribute('data-skybound')??'null') as SkyboundSnapshot|null;
  type Ack=Extract<CoopServerPacket,{type:'ack'}>;
  const lastAck=async(page:Page)=>JSON.parse(await page.locator('#session-status').getAttribute('data-last-ack')??'null') as Ack|null;
  const nextAck=async(page:Page,previous:Ack|null)=>{
   await expect.poll(async()=>{const ack=await lastAck(page);return !!ack&&ack.commandId!==previous?.commandId;},{timeout:30000}).toBe(true);
   return (await lastAck(page))!;
  };
  const actionGap=async(page:Page)=>{
   const tick=Number(await page.locator('#session-status').getAttribute('data-tick'));
   await expect.poll(async()=>Number(await page.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThanOrEqual(tick+4);
  };
  const command=async(page:Page,control:string,action:string,id:string)=>{
   await actionGap(page);const previous=await lastAck(page);await page.locator(control).click();
   await expect.poll(async()=>JSON.parse(await page.locator('#session-status').getAttribute('data-last-command')??'null')).toMatchObject({type:'game-action',action,id});
   const ack=await nextAck(page,previous);expect(ack,ack.message).toMatchObject({accepted:true});
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

  stage('same part concurrent grab');await Promise.all(pages.map(actionGap));const previous=await Promise.all(pages.map(lastAck));
  for(const page of pages)await page.locator('#powers-panel [data-power=grab]').focus();
  await Promise.all(pages.map(page=>page.keyboard.press('Enter')));
  const replies=await Promise.all(pages.map((page,i)=>nextAck(page,previous[i])));
  expect(replies.map(reply=>reply.accepted).sort()).toEqual([false,true]);
  const holderIndex=replies.findIndex(reply=>reply.accepted),holder=pages[holderIndex],other=pages[1-holderIndex],holderId=playerIds[holderIndex]!,otherId=playerIds[1-holderIndex]!;
  expect(replies[1-holderIndex].message).toBe('別の冒険者が操作しています');await expect(other.locator('#notice')).toContainText(replies[1-holderIndex].message);
  for(const page of pages){expect(JSON.parse(await page.locator('#session-status').getAttribute('data-last-command')??'null')).toMatchObject({action:'sky-grab',id:partId});await expect.poll(async()=>(await part(page))?.lease?.owner).toBe(holderId);}
  const before={...(await part(holder))!.position};await holder.locator('#powers-panel [data-power=up]').click();await expect(holder.locator('#power-preview')).toBeVisible();
  for(const page of pages)expect((await part(page))!.position).toEqual(before);
  await command(holder,'#power-preview [data-power=preview-confirm]','sky-move',partId);
  const moved={x:Math.round(before.x*8)/8,y:Math.round((before.y+.5)*8)/8,z:Math.round(before.z*8)/8};
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
  expect(errors).toEqual([]);stage('NET-A02 conflict movement expiry and reconnect verified');
 });
 test('move and observe each other through the public authority',async()=>{
  test.setTimeout(45000);stage('move and observe');await b.keyboard.press('Escape');await running(b);const before=Number(await b.locator('#position').getAttribute('data-x'));
  const peer=async()=>JSON.parse(await a.locator('#session-status').getAttribute('data-peers')??'[]').find((p:{id:string})=>p.id===identity);
  // The parked observer receives authority snapshots without drawing. Stop the
  // held key on that evidence so a slow active renderer cannot cause a long run.
  await b.keyboard.down('KeyD');try{await expect.poll(async()=>(await peer())?.x??-999).toBeGreaterThan(before+.4);}finally{await b.keyboard.up('KeyD');}
  await expect.poll(async()=>Number(await b.locator('#position').getAttribute('data-x'))).toBeGreaterThan(before+.4);
  await expect.poll(async()=>Math.abs((await peer())?.heading??0)).toBeGreaterThan(.3);
  const ground=(await peer()).y;await b.keyboard.press('Space');await expect.poll(async()=>(await peer())?.y??ground).toBeGreaterThan(ground+.15);
  await b.locator('#session-menu').click();expect(errors).toEqual([]);stage('movement verified');
 });
 test('commit a visible terrain edit and converge on both clients',async()=>{
  test.setTimeout(90000);stage('visible terrain tool');await a.keyboard.press('Escape');await running(a);
  // The initial camera aimed into the protected arrival/landmark cores. Walk
  // east using real input before digging; keep both clients on the same world.
  const creator=await a.locator('#session-status').getAttribute('data-player');
  await a.keyboard.down('KeyD');try{await expect.poll(async()=>JSON.parse(await b.locator('#session-status').getAttribute('data-peers')??'[]').find((p:{id:string})=>p.id===creator)?.x??-999).toBeGreaterThan(4.2);}finally{await a.keyboard.up('KeyD');}
  await expect.poll(async()=>Number(await a.locator('#position').getAttribute('data-x'))).toBeGreaterThan(4.2);
  await a.locator('#adventure-menu').click();await a.locator('[data-tab=build]').click();await a.locator('[data-game-action=tool][data-id=dig]').click();
  await a.mouse.move(400,150);await a.mouse.down({button:'middle'});await a.mouse.move(400,220,{steps:4});await a.mouse.up({button:'middle'});await expect(a.locator('#use-tool')).toBeEnabled();
  const priorEditCount=Number(await a.locator('#edit-count').getAttribute('data-count'));console.log('COOP_PRE_EDIT_AIM',await a.locator('#app').getAttribute('data-aim'));await a.locator('#use-tool').click();
  await expect.poll(async()=>Number(await a.locator('#edit-count').getAttribute('data-count')),{timeout:20000}).toBeGreaterThan(priorEditCount);expectedEditCount=Number(await a.locator('#edit-count').getAttribute('data-count'));await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount),{timeout:20000});
  console.log('COOP_EDIT_ACK',await a.locator('#session-status').getAttribute('data-last-ack'));await a.locator('#session-menu').click();expect(errors).toEqual([]);stage('shared edit verified');
 });
 test('reconnect, restore a late browser and continue after the creator leaves',async({browser})=>{
  test.setTimeout(180000);stage('disconnect and reconnect');await contexts[1].setOffline(true);await expect(b.locator('#session-status')).toHaveAttribute('data-connection','reconnecting',{timeout:25000});await contexts[1].setOffline(false);
  await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:45000});await expect(b.locator('#session-status')).toHaveAttribute('data-player',identity);await expect(b.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount));
  stage('fresh late join');const lateContext=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5});
  try{const late=await lateContext.newPage();late.setDefaultTimeout(20000);await late.goto('/#join='+code,{waitUntil:'domcontentloaded',timeout:45000});await late.locator('#session-join').click();await expect(late.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await expect(late.locator('#edit-count')).toHaveAttribute('data-count',String(expectedEditCount),{timeout:30000});await late.locator('#session-leave').click();}finally{await Promise.race([lateContext.close(),new Promise<void>(r=>setTimeout(r,5000))]);}
  stage('creator leaves');await a.locator('#session-leave').click();await expect(b.locator('#session-status')).toHaveAttribute('data-players','1');const tick=Number(await b.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await b.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThan(tick);
  await b.keyboard.press('Escape');await running(b);await b.screenshot({path:'test-results/coop-two-browser.png'});expect(errors).toEqual([]);stage('reconnect and persistence verified');
 });
});
