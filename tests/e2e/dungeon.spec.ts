import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import type {Snapshot} from '../../src/dungeon/types';
// Raw traces can retain private room invitations and WebSocket credentials.
test.use({trace:'off',screenshot:'off'});
import {dungeonApproachDeflection, dungeonApproachWait} from './helpers/dungeon-touch-approach';
const read=(page:Page)=>page.evaluate(()=>window.__dungeonProbe?.()??null) as Promise<Snapshot|null>;
const own=(s:Snapshot)=>s.actors.find(a=>a.id===s.you)!;
async function tap(page:Page,selector:string,mobile:boolean){const target=page.locator(selector);if(mobile)await target.tap();else await target.click();}
async function walk(page:Page,mobile:boolean,x:number,z:number){
 const session=mobile?await page.context().newCDPSession(page):null;
 try{for(let step=0;step<45;step++){
  const s=await read(page);if(!s)throw new Error('No authoritative snapshot');
  const a=own(s);expect(a.status).toBe('alive');
  const dx=x-a.position.x,dz=z-a.position.z;if(Math.hypot(dx,dz)<.35)return;
  const horizontal=Math.abs(dx)>Math.abs(dz),positive=horizontal?dx>0:dz<0;
  const axisDistance=horizontal?Math.abs(dx):Math.abs(dz);
  if(session){
   const bounds=await page.locator('[data-dungeon-pad=move]').boundingBox();if(!bounds)throw new Error('Move pad missing');
   const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
   const deflection=dungeonApproachDeflection(axisDistance);
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:cx,y:cy,radiusX:4,radiusY:4,force:1}]});
   const started=Date.now();
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:cx+(horizontal?(positive?deflection:-deflection):0),y:cy+(!horizontal?(positive?-deflection:deflection):0),radiusX:4,radiusY:4,force:1}]});
   // A slow acknowledgement has already held the real stick. Do not add the
   // requested duration again; near the target use its real analog range.
   const remaining=dungeonApproachWait(Date.now()-started);
   if(remaining)await page.waitForTimeout(remaining);
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   const ms=Math.max(70,Math.min(250,axisDistance/3*850));
   const key=horizontal?(positive?'KeyD':'KeyA'):(positive?'KeyW':'KeyS');
   await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);
  }
  await page.waitForTimeout(130);
 }throw new Error('Ordinary input did not reach the requested point');
 }finally{if(session){await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}).catch(()=>{});await session.detach();}}
}

test('dungeon legacy launch and save isolation smoke',async({page,isMobile})=>{test.setTimeout(180000);await page.goto('/?trial=1&test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await page.evaluate(()=>localStorage.setItem('ash-campaign-v1','preserved-campaign-sentinel'));await page.goto('/?mode=dungeon&test=1');await expect(page.getByTestId('dungeon-create')).toBeVisible();await expect(page.locator('.dungeon-canvas')).toHaveAttribute('data-ready','true');expect(await page.evaluate(()=>localStorage.getItem('ash-campaign-v1'))).toBe('preserved-campaign-sentinel');await page.screenshot({path:test.info().outputPath('dungeon-lobby.png')});});

test('dungeon two-client server movement loot extraction and persistent reconnect',async({page,browser,isMobile},testInfo)=>{test.skip(process.env.E2E_DUNGEON!=='1','Requires the deployed same-origin dungeon server');test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error'&&/WebGL|shader/i.test(message.text()))errors.push(message.text());});let rivalContext:BrowserContext|undefined;
 try{const deployment=await (await page.request.get('/deployment.json')).json();expect(deployment.commit).toBe(process.env.EXPECTED_COMMIT);const health=await (await page.request.get('/dungeon-room/health')).json();expect(health).toMatchObject({enabled:true,authority:'server',protocol:1,stashScope:'room-player'});await page.goto('/?mode=dungeon&test=1');await page.evaluate(()=>localStorage.setItem('ash-campaign-v1','untouched-legacy'));await page.getByTestId('dungeon-name').fill('探索A');await tap(page,'[data-testid=dungeon-create]',isMobile);await expect.poll(async()=>(await read(page))?.actors.length).toBe(1);const invite=await page.getByTestId('dungeon-invite').inputValue();expect(invite).not.toContain('identity');rivalContext=await browser.newContext({viewport:{width:960,height:540}});const rival=await rivalContext.newPage();rival.on('pageerror',error=>errors.push(String(error)));const url=new URL(invite);url.searchParams.set('test','1');await rival.goto(url.href);expect(await read(rival)).toBeNull();await rival.getByTestId('dungeon-name').fill('探索B');await rival.getByTestId('dungeon-join').click();await expect.poll(async()=>(await read(page))?.actors.length).toBe(2);await tap(page,'[data-testid=dungeon-ready]',isMobile);await rival.getByTestId('dungeon-ready').click();await tap(page,'[data-testid=dungeon-start]',isMobile);await expect.poll(async()=>(await read(page))?.phase).toBe('raid');await expect(page.locator('.dungeon-canvas')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('dungeon-raid-guide')).toContainText('最初の戦利品');const me=own((await read(page))!).id;await page.waitForTimeout(1200);await page.screenshot({path:testInfo.outputPath('dungeon-active-spawn.png')});
 await walk(page,isMobile,-12,8);await expect.poll(async()=>(await read(rival))?.actors.find(a=>a.id===me)?.position.z).toBeLessThan(9.2);await page.screenshot({path:testInfo.outputPath('dungeon-active-chest.png')});if(isMobile)await tap(page,'[data-testid=dungeon-action-interact]',true);else await page.keyboard.press('KeyE');await expect.poll(async()=>(await read(page))?.containers.find(c=>c.id==='chest0')?.opened).toBe(true);if(isMobile)await tap(page,'[data-testid=dungeon-action-interact]',true);else await page.keyboard.press('KeyE');await expect(page.getByTestId('dungeon-inventory')).toBeVisible();await expect(page.getByTestId('dungeon-loot-section')).toBeVisible();await expect(page.getByTestId('dungeon-supply-section')).toBeHidden();const loot=page.locator('[data-loot-target=chest0]').first();await expect(loot).toBeVisible();await expect(loot).toBeInViewport();await page.screenshot({path:testInfo.outputPath('dungeon-loot-first-inventory.png')});const item=await loot.getAttribute('data-loot-item');if(isMobile)await loot.tap();else await loot.click();await expect.poll(async()=>own((await read(page))!).bag.some(i=>i.id===item)).toBe(true);if(isMobile)await page.getByRole('button',{name:'閉じる · I / Esc',exact:true}).tap();else await page.getByRole('button',{name:'閉じる · I / Esc',exact:true}).click();await walk(page,isMobile,-12,11.8);await expect.poll(async()=>(await read(page))?.elapsed,{timeout:60000}).toBeGreaterThan(45);await tap(page,'[data-target=exit-west]',isMobile);await expect.poll(async()=>own((await read(page))!).status,{timeout:15000}).toBe('extracted');expect((await read(page))!.stash.filter(i=>i.id===item)).toHaveLength(1);await page.screenshot({path:testInfo.outputPath('extracted-stash.png')});const before=(await read(page))!.stash.map(i=>i.id);await page.reload();await tap(page,'[data-testid=dungeon-join]',isMobile);await expect.poll(async()=>(await read(page))?.stash.map(i=>i.id)).toEqual(before);expect(own((await read(page))!).id).toBe(me);expect(await page.evaluate(()=>localStorage.getItem('ash-campaign-v1'))).toBe('untouched-legacy');expect(errors).toEqual([]);
 }finally{await rivalContext?.close();}
});

// This route intentionally follows only visible guidance and controls. It does
// not read the snapshot probe or inject positions, inventory, HP or server state.
test('dungeon newcomer follows visible directions to first loot and return',async({page,isMobile},info)=>{
 test.skip(process.env.E2E_DUNGEON!=='1','Requires the deployed same-origin dungeon server');test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?mode=dungeon');
 await page.getByTestId('dungeon-name').fill('初めての探索者');
 await tap(page,'[data-testid=dungeon-create]',isMobile);
 await expect(page.getByTestId('dungeon-ready')).toBeEnabled();
 await tap(page,'[data-testid=dungeon-ready]',isMobile);await expect(page.getByTestId('dungeon-start')).toBeEnabled();
 await tap(page,'[data-testid=dungeon-start]',isMobile);
 const guide=page.getByTestId('dungeon-raid-guide');await expect(guide).toContainText('最初の戦利品');
 let contacts:import('@playwright/test').CDPSession|undefined;
 const direction:Record<string,[number,number]>={'↑':[0,1],'↗':[1,1],'→':[1,0],'↘':[1,-1],'↓':[0,-1],'↙':[-1,-1],'←':[-1,0],'↖':[-1,1]};
 async function followUntilVisible(pattern:RegExp){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
   const nearby=page.locator('.dungeon-nearby button').filter({hasText:pattern}).first();
   if(await nearby.isVisible())return nearby;
   const line=await guide.locator('span').last().innerText(),axes=direction[line.trim()[0]];
   expect(axes,'Visible guidance must provide an actionable direction').toBeTruthy();
   const [x,z]=axes;
   if(isMobile){
    contacts??=await page.context().newCDPSession(page);
    const box=await page.getByTestId('dungeon-move-pad').boundingBox();if(!box)throw Error('Movement pad is not visible');
    const cx=box.x+box.width/2,cy=box.y+box.height/2,scale=Math.hypot(x,z)>1?25:35;
    await contacts.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:71,x:cx,y:cy,radiusX:4,radiusY:4,force:1}]});
    await contacts.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:71,x:cx+x*scale,y:cy-z*scale,radiusX:4,radiusY:4,force:1}]});
    await page.waitForTimeout(160);await contacts.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
    const held=[...(x?[x>0?'KeyD':'KeyA']:[]),...(z?[z>0?'KeyW':'KeyS']:[])];
    for(const key of held)await page.keyboard.down(key);await page.waitForTimeout(160);for(const key of held)await page.keyboard.up(key);
   }
   await page.waitForTimeout(250);
  }
  throw Error('The visible directions did not lead to a reachable interaction');
 }
 try{
  const chest=await followUntilVisible(/調べる · 1.5秒/);if(isMobile)await chest.tap();else await chest.click();
  const opened=page.locator('.dungeon-nearby button').filter({hasText:'戦利品を見る'}).first();await expect(opened).toBeVisible();
  if(isMobile)await opened.tap();else await opened.click();
  const pickup=page.getByTestId('dungeon-loot-section').getByRole('button').first();await expect(pickup).toBeInViewport();
  await expect(page.getByTestId('dungeon-stash-section')).toBeHidden();await expect(page.getByTestId('dungeon-supply-section')).toBeHidden();
  await page.screenshot({path:info.outputPath('newcomer-loot-without-scrolling.png')});
  if(isMobile)await pickup.tap();else await pickup.click();
  const close=page.getByRole('button',{name:'閉じる · I / Esc',exact:true});if(isMobile)await close.tap();else await close.click();
  await expect(guide).toHaveAttribute('data-goal','return');
  await followUntilVisible(/開くまで|抽出 · 4秒/);
  const extraction=page.locator('.dungeon-nearby button').filter({hasText:/抽出 · 4秒/}).first();await expect(extraction).toBeEnabled({timeout:60000});
  await page.screenshot({path:info.outputPath('newcomer-visible-return-direction.png')});
  if(isMobile)await extraction.tap();else await extraction.click();
  await expect(page.getByTestId('dungeon-result')).toContainText('帰還の灯は消えなかった',{timeout:15000});
  expect(errors).toEqual([]);
 }finally{
  if(contacts){await contacts.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}).catch(()=>{});await contacts.detach();}
  for(const key of ['KeyW','KeyA','KeyS','KeyD'])await page.keyboard.up(key).catch(()=>{});
 }
});
