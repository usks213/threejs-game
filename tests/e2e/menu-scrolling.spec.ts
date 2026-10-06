import {expect,test,type CDPSession,type Page} from '@playwright/test';
import {GameSimulation} from '../../src/simulation/game-simulation';

test.use({deviceScaleFactor:.5,viewport:{width:844,height:390}});
type ScrollEvidence={clicks:number;touches:number;cancels:number;catalogMoves:number};
type ObservedWindow=typeof window&{menuScrollEvidence:ScrollEvidence};
async function ready(page:Page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 const sim=new GameSimulation();sim.adventure.state.enemies=[];sim.fluid.restore([]);sim.adventure.state.inventory.wood=30;sim.adventure.state.inventory.stone=30;
 const epoch=await page.locator('#app').getAttribute('data-world-epoch');
 await page.locator('#import-file').setInputFiles({name:'menu-scroll-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});
 await expect.poll(()=>page.locator('#app').getAttribute('data-world-epoch')).not.toBe(epoch);
 await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.evaluate(()=>{
  const evidence:ScrollEvidence={clicks:0,touches:0,cancels:0,catalogMoves:0};(window as ObservedWindow).menuScrollEvidence=evidence;
  document.addEventListener('click',event=>{if(event.isTrusted&&(event.target as Element).closest('[role=dialog] button'))evidence.clicks++;},{capture:true,passive:true});
  document.addEventListener('touchstart',event=>{if(event.isTrusted)evidence.touches++;},{capture:true,passive:true});
  document.addEventListener('pointercancel',event=>{if(event.isTrusted)evidence.cancels++;},{capture:true,passive:true});
 });
}
const scrollState=(page:Page,id:string)=>page.locator('#'+id).evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
/** Native Chromium touch input: logical up becomes physical right in portrait.
 * No synthetic DOM events or scrollTop assignments are used to make menus move. */
async function swipe(page:Page,cdp:CDPSession,id:string,options:{button?:boolean;reverse?:boolean}={}){
 const path=await page.locator('#'+id).evaluate((panel,options)=>{
  const rotated=document.querySelector<HTMLElement>('#app')!.dataset.rotated==='true';
  const logical=(r:DOMRect)=>rotated?{left:r.top,right:r.bottom,top:innerWidth-r.right,bottom:innerWidth-r.left}:r;
  const box=logical(panel.getBoundingClientRect());let x=box.left+(box.right-box.left)*.2,y=options.reverse?box.top+30:box.bottom-30;
  if(options.button){
   const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].map(el=>({el,r:logical(el.getBoundingClientRect())})).filter(({el,r})=>el.getClientRects().length&&r.top>=box.top+75&&r.bottom<=box.bottom-8&&r.left>=box.left&&r.right<=box.right).sort((a,b)=>b.r.bottom-a.r.bottom);
   if(!buttons.length)throw Error('No fully visible button for native swipe in '+panel.id);
   const r=buttons[0].r;x=(r.left+r.right)/2;y=(r.top+r.bottom)/2;
  }
  const endY=options.reverse?Math.min(box.bottom-30,y+140):options.button?box.top+25:Math.max(box.top+25,y-140);
  const physical=(x:number,y:number)=>rotated?{x:innerWidth-y,y:x}:{x,y};
  const start=physical(x,y),end=physical(x,endY),target=document.elementFromPoint(start.x,start.y);
  if(!target||!panel.contains(target))throw Error('Swipe target is outside '+panel.id);
  if(options.button&&!target.closest('button'))throw Error('Swipe must begin on a button');
  return {start,end};
 },options);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...path.start,id:61}]});
 for(let step=1;step<=10;step++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:path.start.x+(path.end.x-path.start.x)*step/10,y:path.start.y+(path.end.y-path.start.y)*step/10,id:61}]});
  await page.waitForTimeout(35);
 }
 // Let the final position settle before release rather than testing fling timing.
 await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
const modes=[{open:'adventure-menu',panel:'adventure-panel',tab:'bag'},{open:'adventure-menu',panel:'adventure-panel',tab:'craft'},{open:'powers-menu',panel:'powers-panel'},{open:'system-menu',panel:'system-panel'}];
async function openMenu(page:Page,mode:typeof modes[number],touch:boolean){
 if(touch)await page.locator('#'+mode.open).tap();else await page.locator('#'+mode.open).click();
 await expect(page.locator('#'+mode.panel)).toBeVisible();
 if(mode.tab){const tab=page.locator('[data-tab='+mode.tab+']');if(touch)await tab.tap();else await tab.click();}
}

test('survival adventure menu scrolling uses native swipes from buttons in landscape and rotated portrait',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Chromium native touch protocol');test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);const cdp=await page.context().newCDPSession(page);
 for(const size of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(size);await expect(page.locator('#app')).toHaveAttribute('data-rotated',String(size.height>size.width));
  for(const mode of modes){
   await openMenu(page,mode,true);const panel=page.locator('#'+mode.panel),initial=await scrollState(page,mode.panel);
   expect(initial.max).toBeGreaterThan(60);
   const yaw=await page.locator('#app').getAttribute('data-camera-yaw'),pitch=await page.locator('#app').getAttribute('data-camera-pitch');
   // Start from text/content, then begin a second real swipe on a menu button.
   await swipe(page,cdp,mode.panel);await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeGreaterThan(initial.top+25);
   let before=await scrollState(page,mode.panel);
   // A short inventory may already be near the end after the first swipe.
   // Move back with a real gesture to leave room for the button-start check.
   if(before.max-before.top<50){await swipe(page,cdp,mode.panel,{reverse:true});before=await scrollState(page,mode.panel);}
   expect(before.max-before.top).toBeGreaterThan(20);
   const clicks=await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence.clicks);
   await swipe(page,cdp,mode.panel,{button:true});await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeGreaterThan(before.top+Math.min(20,(before.max-before.top)/2));
   expect(await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence.clicks),'A scroll beginning on a button must not activate it').toBe(clicks);
   await expect(panel).toBeVisible();expect(await page.locator('#app').getAttribute('data-camera-yaw')).toBe(yaw);expect(await page.locator('#app').getAttribute('data-camera-pitch')).toBe(pitch);
   const down=await scrollState(page,mode.panel);await swipe(page,cdp,mode.panel,{reverse:true});await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeLessThan(down.top-20);
   await page.keyboard.press('Escape');await expect(panel).toBeHidden();
  }
 }
 // Returning to gameplay still reserves camera drags and a held stick + second finger.
 await page.setViewportSize({width:844,height:390});await expect(page.locator('#app')).toHaveAttribute('data-rotated','false');
 const yaw=await page.locator('#app').getAttribute('data-camera-yaw');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:420,y:170,id:62}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:470,y:170,id:62}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.locator('#app').getAttribute('data-camera-yaw')).not.toBe(yaw);
 const stick=await page.locator('#stick').boundingBox(),sprint=await page.locator('#sprint').boundingBox();if(!stick||!sprint)throw Error('Gameplay controls missing');
 const left={x:stick.x+stick.width*.72,y:stick.y+stick.height/2,id:63},right={x:sprint.x+sprint.width/2,y:sprint.y+sprint.height/2,id:64};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});
 await expect(page.locator('#sprint')).toHaveAttribute('aria-pressed','true');
 // As in game.spec.ts, CDP releases the IDs supplied to a nonempty touchEnd.
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[right]});
 expect(await page.locator('#knob').evaluate(el=>(el as HTMLElement).style.transform)).not.toBe('translate(0px, 0px)');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await expect.poll(()=>page.locator('#knob').evaluate(el=>(el as HTMLElement).style.transform)).toBe('translate(0px, 0px)');
 const evidence=await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence);expect(evidence.touches).toBeGreaterThan(20);expect(evidence.cancels).toBeGreaterThan(0);
 expect(await page.locator('#game,#stick,#attack').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).touchAction))).toEqual(['none','none','none']);
 await expect(page.locator('#error')).toBeHidden();expect(errors).toEqual([]);
});

test('survival adventure menu scrolling preserves desktop wheel input and stable catalog nodes during live snapshots',async({page},info)=>{
 test.skip(info.project.name!=='desktop-chromium','Desktop wheel and live DOM stability');test.setTimeout(120000);await ready(page);
 for(const mode of modes){
  await openMenu(page,mode,false);const panel=page.locator('#'+mode.panel),box=await panel.boundingBox();if(!box)throw Error('Menu missing');
  const before=await scrollState(page,mode.panel);await page.mouse.move(box.x+box.width*.65,box.y+box.height*.7);await page.mouse.wheel(0,180);
  await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeGreaterThan(before.top+25);
  if(mode.tab==='craft'){
   await page.locator('#adventure-content').evaluate(content=>{
    const evidence=(window as ObservedWindow).menuScrollEvidence;
    const observer=new MutationObserver(records=>{for(const record of records)if(record.type==='childList')evidence.catalogMoves+=record.removedNodes.length;});
    observer.observe(content,{subtree:true,childList:true});
   });
   const tick=Number(await page.locator('#app').getAttribute('data-tick'));
   await expect.poll(async()=>Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThan(tick+40);
   expect(await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence.catalogMoves),'Unchanged catalog refreshes must never detach buttons').toBe(0);
  }
  await page.keyboard.press('Escape');await expect(panel).toBeHidden();
 }
});
