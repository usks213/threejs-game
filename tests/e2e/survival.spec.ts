import { test, expect } from '@playwright/test';
interface State { x:number;y:number;hp:number;deaths:number;cameraX:number;cameraY:number;width:number;height:number;resources:Record<string,number>;structures:{id:number;type:string;x:number;y:number}[];camp:{x:number;y:number}|null;tool:string;time:number }
test('persistent survival: mine, craft, build a lit camp, recover after death and reload',async({page,context},info)=>{
  test.setTimeout(120000);
  const mobile=info.project.name==='android-chromium', errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(mobile?{width:393,height:851}:{width:1280,height:720});
  // A legacy record is deliberately opaque; the new mode must never touch it.
  await page.addInitScript(()=>{if(!localStorage.getItem('emberfall-save-v1'))localStorage.setItem('emberfall-save-v1','legacy-record-preserved');});
  await page.goto('/?seed=3397');
  const activate=async(name:string)=>{const b=page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();};
  await page.screenshot({path:info.outputPath('survival-title.png')});
  await activate('新しい世界を作る');const cave=page.locator('#cave');
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!) as State;
  await expect.poll(async()=>Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(10);
  const cdp=mobile?await context.newCDPSession(page):null;
  const aim=async(x:number,y:number,ms=600)=>{
    const s=await read(), box=(await cave.boundingBox())!;
    const point={x:box.x+(x-s.cameraX)/s.width*box.width,y:box.y+(y-s.cameraY)/s.height*box.height,id:7};
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});else{await page.mouse.move(point.x,point.y);await page.mouse.down();}
    await page.waitForTimeout(ms);
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const select=async(tool:string)=>{await page.locator('#tool').selectOption(tool);};
  const craft=async(id:string)=>{if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();await expect(page.locator(`[data-recipe="${id}"]`)).toBeEnabled();if(mobile)await page.locator(`[data-recipe="${id}"]`).tap();else await page.locator(`[data-recipe="${id}"]`).click();await activate('世界に戻る');};
  // Swing at actual trunk surfaces. Every earned unit comes from removed cells.
  for(let pass=0;pass<3;pass++)for(const y of [24,28,32,26,30,21])await aim(55,y,370);
  await expect.poll(async()=>(await read()).resources.wood).toBeGreaterThanOrEqual(34);
  for(const x of [49,52,55])await aim(x,34,400);
  await expect.poll(async()=>(await read()).resources.stone).toBeGreaterThanOrEqual(21);
  await craft('camp');await select('camp');await page.waitForTimeout(250);await aim(25.5,34.5,100);
  await expect.poll(async()=>(await read()).structures.filter(s=>s.type==='camp').length).toBe(1);
  await craft('workbench');await select('workbench');await page.waitForTimeout(250);await aim(33.5,34.5,100);
  await expect.poll(async()=>(await read()).structures.filter(s=>s.type==='workbench').length).toBe(1);
  // Fly over the harvested trunk/floor holes using the normal fuel control.
  if(cdp){const m=(await page.locator('.move-pad').boundingBox())!,f=(await page.locator('.fly-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x+m.width*.8,y:m.y+m.height/2,id:1},{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]});}
  else{await page.keyboard.down('KeyD');await page.keyboard.down('Space');}
  await expect.poll(async()=>(await read()).x,{intervals:[50],timeout:5000}).toBeGreaterThan(76);
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else{await page.keyboard.up('KeyD');await page.keyboard.up('Space');}
  await page.waitForTimeout(900);await select('pick');await aim(86,31,1000);
  await expect.poll(async()=>(await read()).resources.sand).toBeGreaterThanOrEqual(2);
  await craft('torch');await select('torch');await page.waitForTimeout(250);await aim(69.5,34.5,100);
  await expect.poll(async()=>(await read()).structures.filter(s=>s.type==='torch').length).toBe(1);
  await page.screenshot({path:info.outputPath(mobile?'survival-lit-base-portrait.png':'survival-lit-base-desktop.png')});
  const built=await read();
  const ownership=(s:State)=>Object.fromEntries(Object.entries(s.resources).map(([key,value])=>[key,value+s.structures.filter(item=>item.type===key).length]));
  // Face the hard ceiling and levitate while firing the actual explosive wand.
  // This produces lethal self-damage; no health/state injection or respawn API.
  if(mobile)await page.locator('#wand-select').tap();else await page.keyboard.press('Digit2');
  if(cdp){const a=(await page.locator('.aim-pad').boundingBox())!,f=(await page.locator('.fly-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height*.15,id:3},{x:f.x+f.width/2,y:f.y+f.height/2,id:4}]});}
  else{const s=await read(),box=(await cave.boundingBox())!;await page.mouse.move((s.x-s.cameraX)/s.width*box.width,4);await page.keyboard.down('Space');await page.mouse.down();}
  await expect.poll(async()=>(await read()).deaths,{timeout:18000}).toBeGreaterThan(0);
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else{await page.mouse.up();await page.keyboard.up('Space');}
  await page.waitForTimeout(150);
  await page.screenshot({path:info.outputPath('survival-camp-respawn.png')});
  const revived=await read();expect(revived.hp).toBeGreaterThan(0);expect(ownership(revived)).toEqual(ownership(built));for(const structure of revived.structures)expect(built.structures).toContainEqual(structure);expect(revived.camp).toEqual(built.camp);
  if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();
  await page.screenshot({path:info.outputPath('survival-crafting-after-respawn.png')});
  await activate('保存してタイトルへ');
  const snapshot=await page.evaluate(()=>localStorage.getItem('emberfall-survival-save-v1'));expect(snapshot).toBeTruthy();
  const cells=(raw:string)=>{const world=JSON.parse(JSON.parse(raw).data.run).data.world as {width:number;cells:number[]};return [[52,24],[52,28],[52,32],[25,34],[33,34]].map(([x,y])=>{const index=y*world.width+x;let offset=0;for(let n=0;n<world.cells.length;n+=2){offset+=world.cells[n+1];if(index<offset)return world.cells[n];}throw new Error('Invalid RLE receipt');});};
  expect(cells(snapshot!)[0]).toBe(0);
  await page.reload();await activate('この世界を続ける');
  await expect.poll(async()=>(await read()).deaths).toBe(revived.deaths);
  const restored=await read();expect(restored.structures).toEqual(revived.structures);expect(restored.resources).toEqual(revived.resources);expect(restored.camp).toEqual(revived.camp);
  expect(await page.evaluate(()=>localStorage.getItem('emberfall-save-v1'))).toBe('legacy-record-preserved');
  if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();
  const resaved=await page.evaluate(()=>localStorage.getItem('emberfall-survival-save-v1'));expect(cells(resaved!)).toEqual(cells(snapshot!));await activate('世界に戻る');
  const before=Number(await cave.getAttribute('data-tick'));await page.waitForTimeout(1000);expect(Number(await cave.getAttribute('data-tick'))-before).toBeGreaterThan(12);
  const lighting=JSON.parse((await cave.getAttribute('data-lighting'))!);expect(lighting.rays).toBeLessThanOrEqual(6144);expect(lighting.lights).toBeLessThanOrEqual(7);expect(lighting.canvasWidth).toBe(mobile?160:240);
  await info.attach('survival-receipt.json',{body:JSON.stringify({built,revived,restored,lighting:await cave.getAttribute('data-lighting')},null,2),contentType:'application/json'});
  // Reclaim equipment through the actual pick control; the finished item returns
  // exactly once and remains owned across another save/reload.
  await select('pick');await aim(34,31,100);
  await expect.poll(async()=>(await read()).structures.filter(s=>s.type==='workbench').length).toBe(0);
  expect((await read()).resources.workbench).toBe(1);
  await aim(34,31,100);expect((await read()).resources.workbench).toBe(1);
  if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();
  await activate('保存してタイトルへ');await page.reload();await activate('この世界を続ける');
  expect((await read()).resources.workbench).toBe(1);expect((await read()).structures.some(s=>s.type==='workbench')).toBe(false);
  await page.screenshot({path:info.outputPath('survival-reclaimed-workbench.png')});
  expect(errors).toEqual([]);
});
