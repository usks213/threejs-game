import {test,expect,type BrowserContext,type Page} from '@playwright/test';
test.describe.serial('two real browsers',()=>{
 let contexts:BrowserContext[]=[],a:Page,b:Page,code='',identity='',errors:string[]=[],failed=false;
 const stage=(name:string)=>console.log('COOP_BROWSER_PHASE',name);
 const running=(page:Page)=>expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const diagnostics=async(page:Page)=>{
  console.log('COOP_BROWSER_LOCATION',page.url());
  for(const [selector,attribute]of [['#app','data-diagnostics'],['#app','data-aim'],['#session-status','data-last-ack'],['#session-status','data-last-command']]as const)console.log('COOP_DIAGNOSTIC',attribute,await page.locator(selector).getAttribute(attribute,{timeout:1000}).catch(()=>null));
  console.log('COOP_NOTICE',await page.locator('#notice').textContent({timeout:1000}).catch(()=>null));
 };
 test.beforeAll(async({browser})=>{
  test.setTimeout(180000);stage('startup and room join');errors=[];
  contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5})));
  await Promise.all(contexts.map(context=>context.tracing.start({screenshots:true,snapshots:true,sources:true})));
  [a,b]=await Promise.all(contexts.map(context=>context.newPage()));
  for(const page of[a,b]){page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>{socket.on('framereceived',frame=>{try{const packet=JSON.parse(String(frame.payload));if(packet.type==='ack'||packet.type==='notice')console.log('COOP_SERVER_REPLY',JSON.stringify(packet));}catch{}});socket.on('framesent',frame=>{try{const packet=JSON.parse(String(frame.payload));if(packet.type==='action')console.log('COOP_UI_ACTION',JSON.stringify(packet.message));}catch{}});});page.on('requestfailed',r=>console.log('COOP_REQUEST_FAILED',r.url().split('?')[0],r.failure()?.errorText));await page.goto('/',{waitUntil:'domcontentloaded',timeout:45000});await running(page);await page.locator('#session-menu').click();}
  stage('create room');await a.locator('#session-host').click();await expect(a.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});code=await a.locator('#session-code').inputValue();
  stage('join second browser');await b.locator('#session-code').fill(code);await b.locator('#session-join').click();await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});
  identity=(await b.locator('#session-status').getAttribute('data-player'))!;expect(identity).not.toBe(await a.locator('#session-status').getAttribute('data-player'));
  // Both connections remain live; only one software-GPU view renders at a time.
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-players','2');await page.locator('#session-close').click();await running(page);if(page===a)await a.locator('#session-menu').click();}
  stage('two browsers ready');
 });
 test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus){failed=true;for(const page of[a,b].filter(Boolean))await diagnostics(page);}});
 test.afterAll(async()=>{await Promise.allSettled(contexts.map((c,i)=>Promise.race([c.tracing.stop(failed?{path:`test-results/coop-browser-${i}.zip`}:undefined),new Promise<void>(r=>setTimeout(r,5000))])));await Promise.allSettled(contexts.map(c=>Promise.race([c.close(),new Promise<void>(r=>setTimeout(r,5000))])));});
 test('move and observe each other through the public authority',async()=>{
  test.setTimeout(45000);stage('move and observe');const before=Number(await b.locator('#position').getAttribute('data-x'));
  await b.keyboard.down('KeyD');try{await expect.poll(async()=>Number(await b.locator('#position').getAttribute('data-x'))).toBeGreaterThan(before+.4);}finally{await b.keyboard.up('KeyD');}
  await expect.poll(async()=>{const peers=JSON.parse(await a.locator('#session-status').getAttribute('data-peers')??'[]');return peers.find((p:{id:string})=>p.id===identity)?.x??-999;}).toBeGreaterThan(before+.4);
  await b.locator('#session-menu').click();expect(errors).toEqual([]);stage('movement verified');
 });
 test('commit a visible terrain edit and converge on both clients',async()=>{
  test.setTimeout(90000);stage('visible terrain tool');await a.locator('#session-close').click();await a.locator('#adventure-menu').click();await a.locator('[data-tab=build]').click();await a.locator('[data-game-action=tool][data-id=dig]').click();
  await a.mouse.move(400,150);await a.mouse.down({button:'middle'});await a.mouse.move(400,220,{steps:4});await a.mouse.up({button:'middle'});await expect(a.locator('#use-tool')).toBeEnabled();
  console.log('COOP_PRE_EDIT_AIM',await a.locator('#app').getAttribute('data-aim'));await a.locator('#use-tool').click();
  await expect(a.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:20000});await expect(b.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:20000});
  console.log('COOP_EDIT_ACK',await a.locator('#session-status').getAttribute('data-last-ack'));await a.locator('#session-menu').click();expect(errors).toEqual([]);stage('shared edit verified');
 });
 test('reconnect, restore a late browser and continue after the creator leaves',async({browser})=>{
  test.setTimeout(180000);stage('disconnect and reconnect');await contexts[1].setOffline(true);await expect(b.locator('#session-status')).toHaveAttribute('data-connection','reconnecting',{timeout:25000});await contexts[1].setOffline(false);
  await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:45000});await expect(b.locator('#session-status')).toHaveAttribute('data-player',identity);await expect(b.locator('#edit-count')).toHaveAttribute('data-count','1');
  stage('fresh late join');const lateContext=await browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5});
  try{const late=await lateContext.newPage();late.setDefaultTimeout(20000);await late.goto('/#join='+code,{waitUntil:'domcontentloaded',timeout:45000});await late.locator('#session-join').click();await expect(late.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:30000});await expect(late.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:30000});await late.locator('#session-leave').click();}finally{await Promise.race([lateContext.close(),new Promise<void>(r=>setTimeout(r,5000))]);}
  stage('creator leaves');await a.locator('#session-leave').click();await expect(b.locator('#session-status')).toHaveAttribute('data-players','1');const tick=Number(await b.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await b.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThan(tick);
  await b.locator('#session-close').click();await running(b);await b.screenshot({path:'test-results/coop-two-browser.png'});expect(errors).toEqual([]);stage('reconnect and persistence verified');
 });
});
