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
const gestureEvidence=new WeakMap<Page,Record<string,unknown>[]>();
type SwipeOptions={button?:string;reverse?:boolean};
const scrollState=(page:Page,id:string)=>page.locator('#'+id).evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
/** Native Chromium touch input: logical up becomes physical right in portrait.
 * No synthetic DOM events or scrollTop assignments are used to make menus move. */
async function swipePath(page:Page,id:string,options:SwipeOptions={}){
 return page.locator('#'+id).evaluate((panel,options)=>{
  const rotated=document.querySelector<HTMLElement>('#app')!.dataset.rotated==='true';
  const logical=(r:DOMRect)=>rotated?{left:r.top,right:r.bottom,top:innerWidth-r.right,bottom:innerWidth-r.left}:r;
  const physical=(x:number,y:number)=>rotated?{x:innerWidth-y,y:x}:{x,y};
  const box=logical(panel.getBoundingClientRect());let x=box.left+(box.right-box.left)*.2,y=options.reverse?box.top+30:box.bottom-30;
  if(options.button){
   // A button can be touched when only part of it is visible. Use the clipped
   // touchable region, not a fully-contained bounding box or a header cutoff.
   const buttons=[...panel.querySelectorAll<HTMLButtonElement>(options.button)].filter(el=>!el.disabled&&el.getClientRects().length).map(el=>{
    const r=logical(el.getBoundingClientRect()),left=Math.max(r.left,box.left+3),right=Math.min(r.right,box.right-3),top=Math.max(r.top,box.top+3),bottom=Math.min(r.bottom,box.bottom-3);
    return {el,left,right,top,bottom,x:(left+right)/2,y:(top+bottom)/2};
   }).filter(r=>r.right-r.left>=8&&r.bottom-r.top>=8&&r.y-(box.top+25)>=60).sort((a,b)=>b.y-a.y);
   const target=buttons.find(candidate=>{const point=physical(candidate.x,candidate.y);return document.elementFromPoint(point.x,point.y)?.closest('button')===candidate.el;});
   if(!target)return null;
   x=target.x;y=target.y;
  }else{
   // The panel's text/background gesture must not start on a native slider,
   // checkbox, button or select. A fixed x fraction can land on any of those.
   const xs=[box.right-7,box.left+7,box.left+(box.right-box.left)*.8,box.left+(box.right-box.left)*.5,box.left+(box.right-box.left)*.2];
   const ys=options.reverse?[box.top+30,box.top+55,box.top+80]:[box.bottom-30,box.bottom-55,box.bottom-80];
   const candidates=ys.flatMap(y=>xs.map(x=>({x,y}))),safe=candidates.find(candidate=>{const point=physical(candidate.x,candidate.y),target=document.elementFromPoint(point.x,point.y);return target&&panel.contains(target)&&!target.closest('button,input,select,textarea,a,summary,[role=slider],[contenteditable=true]');});
   if(!safe)throw Error('No non-control native swipe start in '+panel.id);
   x=safe.x;y=safe.y;
  }
  const endY=options.reverse?Math.min(box.bottom-30,y+140):options.button?box.top+25:Math.max(box.top+25,y-140);
  const start=physical(x,y),end=physical(x,endY),target=document.elementFromPoint(start.x,start.y);
  if(!target||!panel.contains(target))throw Error('Swipe target is outside '+panel.id);
  if(options.button&&(!target.closest('button')||(target.closest('button') as HTMLButtonElement).disabled))throw Error('Swipe must begin on an enabled button');
  return {start,end,evidence:{panel:panel.id,rotated,button:options.button??null,reverse:!!options.reverse,target:{tag:target.tagName,id:target.id,touchAction:getComputedStyle(target).touchAction},panelTouchAction:getComputedStyle(panel).touchAction,before:{top:panel.scrollTop,max:panel.scrollHeight-panel.clientHeight}}};
 },options);
}
async function swipe(page:Page,cdp:CDPSession,id:string,options:SwipeOptions={}){
 const path=await swipePath(page,id,options);if(!path)throw Error('No visible enabled button with sufficient native swipe travel in '+id);
 const entry:Record<string,unknown>={...path.evidence,start:path.start,end:path.end},entries=gestureEvidence.get(page);if(entries){entries.push(entry);if(entries.length>80)entries.shift();}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...path.start,id:61}]});
 for(let step=1;step<=10;step++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:path.start.x+(path.end.x-path.start.x)*step/10,y:path.start.y+(path.end.y-path.start.y)*step/10,id:61}]});
  await page.waitForTimeout(35);
 }
 // Let the final position settle before release rather than testing fling timing.
 await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 entry.after=await scrollState(page,id);
}
/** Navigate toward a specific known button, rather than blindly searching
 * forward through a settings section made entirely of sliders and checkboxes. */
async function prepareButtonSwipe(page:Page,cdp:CDPSession,id:string,button:string){
 await expect(page.locator('#'+id).locator(button)).toBeEnabled();
 while(!await swipePath(page,id,{button})){
  const before=await scrollState(page,id),reverse=await page.locator('#'+id).evaluate((panel,selector)=>{
   const target=panel.querySelector(selector);if(!target)throw Error('Menu swipe button missing: '+selector);
   const box=panel.getBoundingClientRect(),r=target.getBoundingClientRect(),rotated=document.querySelector<HTMLElement>('#app')!.dataset.rotated==='true';
   return rotated?innerWidth-r.right<innerWidth-box.right+85:r.top<box.top+85;
  },button);
  const available=reverse?before.top:before.max-before.top;
  if(available<10)throw Error('Cannot reach native swipe target '+button+' in '+id);
  await swipe(page,cdp,id,{reverse});
  const moved=async()=>{const after=await scrollState(page,id);return reverse?before.top-after.top:after.top-before.top;};
  await expect.poll(moved).toBeGreaterThan(Math.min(10,available/2));
 }
 return scrollState(page,id);
}
const modes=[{open:'adventure-menu',panel:'adventure-panel',tab:'bag',button:'[data-slot="16"]'},{open:'adventure-menu',panel:'adventure-panel',tab:'craft',button:'[data-catalog-clear]'},{open:'powers-menu',panel:'powers-panel',button:'[data-power="create"]'},{open:'system-menu',panel:'system-panel',button:'#debug-flight-toggle'}];
async function openMenu(page:Page,mode:typeof modes[number],touch:boolean){
 if(touch)await page.locator('#'+mode.open).tap();else await page.locator('#'+mode.open).click();
 await expect(page.locator('#'+mode.panel)).toBeVisible();
 if(mode.tab){const tab=page.locator('[data-tab='+mode.tab+']');if(touch)await tab.tap();else await tab.click();}
}

test('survival adventure menu scrolling uses native swipes from buttons in landscape and rotated portrait',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Chromium native touch protocol');test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));gestureEvidence.set(page,[]);
 try{
 await ready(page);const cdp=await page.context().newCDPSession(page);
 for(const size of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(size);await expect(page.locator('#app')).toHaveAttribute('data-rotated',String(size.height>size.width));
  for(const mode of modes){
   await openMenu(page,mode,true);const panel=page.locator('#'+mode.panel),initial=await scrollState(page,mode.panel);
   expect(initial.max).toBeGreaterThan(60);
   const yaw=await page.locator('#app').getAttribute('data-camera-yaw'),pitch=await page.locator('#app').getAttribute('data-camera-pitch');
   const settings=mode.panel==='system-panel'?await panel.locator('input[type=range]').evaluateAll(inputs=>inputs.map(input=>({id:input.id,value:(input as HTMLInputElement).value}))):null;
   // Start from text/content, then begin a second real swipe on a menu button.
   await swipe(page,cdp,mode.panel);await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeGreaterThan(initial.top+25);
   let before=await scrollState(page,mode.panel);
   // A short inventory may already be near the end after the first swipe.
   // Move back with a real gesture to leave room for the button-start check.
   if(before.max-before.top<50){await swipe(page,cdp,mode.panel,{reverse:true});before=await scrollState(page,mode.panel);}
   before=await prepareButtonSwipe(page,cdp,mode.panel,mode.button);
   expect(before.max-before.top).toBeGreaterThan(20);
   const clicks=await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence.clicks);
   await swipe(page,cdp,mode.panel,{button:mode.button});await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeGreaterThan(before.top+Math.min(20,(before.max-before.top)/2));
   expect(await page.evaluate(()=>(window as ObservedWindow).menuScrollEvidence.clicks),'A scroll beginning on a button must not activate it').toBe(clicks);
   await expect(panel).toBeVisible();expect(await page.locator('#app').getAttribute('data-camera-yaw')).toBe(yaw);expect(await page.locator('#app').getAttribute('data-camera-pitch')).toBe(pitch);
   if(mode.tab==='bag')await page.screenshot({path:info.outputPath('menu-scroll-'+(size.height>size.width?'portrait':'landscape')+'.png'),scale:'css'});
   const down=await scrollState(page,mode.panel);await swipe(page,cdp,mode.panel,{reverse:true});await expect.poll(async()=>(await scrollState(page,mode.panel)).top).toBeLessThan(down.top-20);
   if(settings){expect(await panel.locator('input[type=range]').evaluateAll(inputs=>inputs.map(input=>({id:input.id,value:(input as HTMLInputElement).value})))).toEqual(settings);await expect(page.locator('#debug-flight-toggle')).toHaveAttribute('aria-pressed','false');}
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
 }catch(error){
  await info.attach('menu-scroll-gesture-evidence.json',{body:JSON.stringify(gestureEvidence.get(page)??[],null,2),contentType:'application/json'});
  throw error;
 }finally{gestureEvidence.delete(page);}
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
