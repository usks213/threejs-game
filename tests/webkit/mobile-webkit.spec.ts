import {test,expect,type Page} from '@playwright/test';

interface Probe {
 worldReady:boolean;
 restoreFailure:string|null;
 seconds:number;
 tool:boolean;
 saveStatus:string;
 settings:{graphics:string;volume:number};
 inventory:Record<string,number>;
 campaign:{completed:string[];level:number;flameTier:number};
 stats:{renderedFrames:number;drawCalls:number;triangles:number;drawingBufferWidth:number;drawingBufferHeight:number;mode:string};
}
const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as Probe);
const controls=(page:Page)=>page.evaluate(()=>(Reflect.get(window,'__inputProbe') as {controls:{x:number;z:number;block:boolean;sprint:boolean}}).controls);
const browserErrors=new WeakMap<Page,string[]>();

async function ready(page:Page){
 await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await expect.poll(async()=>(await read(page)).worldReady).toBe(true);
 await expect.poll(async()=>(await read(page)).stats.renderedFrames).toBeGreaterThan(0);
 const state=await read(page);
 expect(state.restoreFailure).toBeNull();
 expect(state.stats.drawCalls).toBeGreaterThan(0);
 expect(state.stats.triangles).toBeGreaterThan(0);
 expect(state.stats.drawingBufferWidth).toBeGreaterThan(0);
 expect(state.stats.drawingBufferHeight).toBeGreaterThan(0);
 await expect(page.locator('#error')).toBeHidden();
 await expect(page.locator('#game')).toBeVisible();
}

async function performance(page:Page){
 await expect(page.locator('#quality-toggle')).toContainText('標準');
 await page.locator('#quality-toggle').tap();
 await expect.poll(async()=>(await read(page)).settings.graphics).toBe('performance');
 await expect(page.locator('#quality-toggle')).toContainText('省電力');
}

test.beforeEach(async({page,browserName,isMobile},testInfo)=>{
 expect(browserName).toBe('webkit');
 expect(isMobile).toBe(true);
 testInfo.annotations.push({type:'engine-scope',description:'Playwright Linux WebKit, mobile viewport and touch emulation at DPR 1. Public UI taps and read-only probes; no physical iPhone/Safari or FPS claim.'});
 const errors:string[]=[];
 browserErrors.set(page,errors);
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
});

test.afterEach(async({page},testInfo)=>{
 const errors=browserErrors.get(page)??[];
 await testInfo.attach('browser-errors',{body:JSON.stringify(errors,null,2),contentType:'application/json'});
 expect(errors).toEqual([]);
 browserErrors.delete(page);
});

test('WebKit renders the campaign and delivers ordinary touch controls and menus',async({page},testInfo)=>{
 await page.goto('/?test=1&streaming=1');
 await ready(page);
 // Observe browser-created PointerEvents only. No dispatchEvent, CDP, game
 // commands, clock overrides, storage seeding, or private state writes.
 const observed=await page.evaluateHandle(()=>{
  const events:{target:string;pointerType:string;trusted:boolean}[]=[];
  const record=(event:PointerEvent)=>{const button=(event.target as Element).closest('button');if(button)events.push({target:button.id||button.dataset.tab||'',pointerType:event.pointerType,trusted:event.isTrusted});};
  document.addEventListener('pointerdown',record);
  return {read:()=>events,stop:()=>document.removeEventListener('pointerdown',record)};
 });
 try{
  await performance(page);
  await page.locator('#start').tap();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  const initial=await read(page);
  await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(initial.seconds);
  await expect.poll(async()=>(await read(page)).stats.renderedFrames).toBeGreaterThan(initial.stats.renderedFrames);
  for(const expected of [!initial.tool,initial.tool]){
   await page.locator('#tool-switch').tap();
   await expect.poll(async()=>(await read(page)).tool).toBe(expected);
  }
  await page.locator('#campaign-toggle').tap();
  await expect(page.locator('#campaign-panel')).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-running','false');
  await page.locator('[data-tab=map]').tap();
  await expect(page.locator('.campaign-map-marker.player')).toBeVisible();
  await page.getByRole('button',{name:'探索に戻る',exact:true}).tap();
  await expect(page.locator('#campaign-panel')).toBeHidden();
  await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  await page.locator('#menu-toggle').tap();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('data-running','false');
  await page.locator('#start').tap();
  await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  const events=await observed.evaluate(value=>value.read());
  await testInfo.attach('trusted-touch-observations',{body:JSON.stringify(events,null,2),contentType:'application/json'});
  await testInfo.attach('render-observations',{body:JSON.stringify({before:initial.stats,after:(await read(page)).stats},null,2),contentType:'application/json'});
  for(const target of ['quality-toggle','start','tool-switch','campaign-toggle','map','menu-toggle']){
   expect(events.some(event=>event.target===target&&event.pointerType==='touch'&&event.trusted),`A browser touch must reach ${target}`).toBe(true);
  }
  expect(events.every(event=>event.pointerType==='touch'&&event.trusted)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('webkit-campaign-render.png')});
  await expect(page.locator('#error')).toBeHidden();
 }finally{await observed.evaluate(value=>value.stop());await observed.dispose();}
});

test('WebKit portrait pauses simulation and landscape waits for a resume tap',async({page},testInfo)=>{
 await page.goto('/?test=1&streaming=1');await ready(page);await performance(page);
 await page.locator('#start').tap();
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 const started=(await read(page)).seconds;
 await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(started);
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#rotate')).toBeVisible();
 await expect(page.locator('#game')).toHaveAttribute('data-running','false');
 const paused=(await read(page)).seconds;
 await page.waitForTimeout(350);
 expect((await read(page)).seconds).toBe(paused);
 expect(await controls(page)).toMatchObject({x:0,z:0,block:false,sprint:false});
 await page.screenshot({path:testInfo.outputPath('webkit-portrait-pause.png')});
 await page.setViewportSize({width:844,height:390});
 await expect(page.locator('#rotate')).toBeHidden();
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#game')).toHaveAttribute('data-running','false');
 await page.waitForTimeout(350);
 expect((await read(page)).seconds).toBe(paused);
 await page.locator('#start').tap();
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(paused);
 expect(await controls(page)).toMatchObject({x:0,z:0,block:false,sprint:false});
 await expect(page.locator('#error')).toBeHidden();
});

test('WebKit saves touch-selected settings and reloads the same campaign',async({page},testInfo)=>{
 await page.goto('/?test=1&streaming=1');await ready(page);await performance(page);
 await page.locator('#restart').tap();
 await expect(page.locator('#campaign-panel')).toBeVisible();
 await page.locator('[data-tab=settings]').tap();
 const volume=page.getByRole('slider',{name:'音量',exact:true});
 await volume.scrollIntoViewIfNeeded();
 const box=await volume.boundingBox();expect(box).not.toBeNull();
 await volume.tap({position:{x:box!.width*.2,y:box!.height/2}});
 await expect.poll(async()=>(await read(page)).settings.volume).toBeLessThan(.5);
 await page.getByRole('button',{name:'今すぐ保存',exact:true}).tap();
 await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
 const saved=await read(page);
 expect(await page.evaluate(()=>localStorage.getItem('ash-campaign-v3'))).not.toBeNull();
 await page.reload();await ready(page);
 await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');
 const restored=await read(page);
 expect(restored.settings).toEqual(saved.settings);
 expect(restored.inventory).toEqual(saved.inventory);
 expect(restored.campaign).toEqual(saved.campaign);
 await expect(page.locator('#quality-toggle')).toContainText('省電力');
 await page.locator('#restart').tap();
 await page.locator('[data-tab=settings]').tap();
 await expect(volume).toHaveValue(String(saved.settings.volume));
 const quality=page.getByRole('combobox',{name:'描画品質',exact:true});await quality.scrollIntoViewIfNeeded();
 await expect(quality).toBeInViewport({ratio:1});await expect(quality).toHaveValue('performance');
 const face=await quality.evaluate(element=>{const style=getComputedStyle(element);const luminance=(color:string)=>{const channels=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(value=>{const s=value/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};const fg=luminance(style.color),bg=luminance(style.backgroundColor);return {appearance:style.appearance,color:style.color,background:style.backgroundColor,contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};});
 // Author-painted face avoids the pale native WebKit background seen in4276b09.
 // The original select remains keyboard/touch accessible with its native picker.
 expect(face.appearance).toBe('none');expect(face.contrast).toBeGreaterThanOrEqual(4.5);
 await testInfo.attach('select-face-readability',{body:JSON.stringify(face,null,2),contentType:'application/json'});
 await page.screenshot({path:testInfo.outputPath('webkit-restored-settings.png')});
 await page.getByRole('button',{name:'探索に戻る',exact:true}).tap();
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 const resumed=(await read(page)).seconds;
 await expect.poll(async()=>(await read(page)).seconds).toBeGreaterThan(resumed);
 await expect(page.locator('#error')).toBeHidden();
});
