import { test, expect } from '@playwright/test';
interface State { x:number;y:number;cameraX:number;cameraY:number;width:number;height:number;resources:Record<string,number>;deaths:number }
test('ordinary controls build a stone dam, release the reservoir and reopen downstream flow',async({page,context},info)=>{
  test.setTimeout(90000);
  const mobile=info.project.name==='android-chromium',errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(mobile?{width:393,height:851}:{width:1280,height:720});await page.goto('/?seed=3397');
  const button=async(name:string)=>{const b=page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();};
  await button('新しい世界を作る');const cave=page.locator('#cave'),cdp=mobile?await context.newCDPSession(page):null;
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!) as State;
  await expect.poll(async()=>Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(10);
  const aim=async(x:number,y:number,ms=450)=>{const s=await read(),b=(await cave.boundingBox())!;const p={x:b.x+(x-s.cameraX)/s.width*b.width,y:b.y+(y-s.cameraY)/s.height*b.height,id:7};
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});else{await page.mouse.move(p.x,p.y);await page.mouse.down();}await page.waitForTimeout(ms);
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await page.waitForTimeout(250);};
  const flyRight=async(x:number)=>{if(cdp){const m=(await page.locator('.move-pad').boundingBox())!,f=(await page.locator('.fly-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x+m.width*.8,y:m.y+m.height/2,id:1},{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]});}else{await page.keyboard.down('KeyD');await page.keyboard.down('Space');}
    await expect.poll(async()=>(await read()).x,{intervals:[50],timeout:6000}).toBeGreaterThan(x);
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else{await page.keyboard.up('KeyD');await page.keyboard.up('Space');}await page.waitForTimeout(900);};
  const menu=async()=>{if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();};
  const cells=async()=>{await menu();const raw=await page.evaluate(()=>localStorage.getItem('emberfall-survival-save-v1'));expect(raw).toBeTruthy();const w=JSON.parse(JSON.parse(raw!).data.run).data.world as {width:number;cells:number[]};const out:number[]=[];for(let n=0;n<w.cells.length;n+=2)for(let k=0;k<w.cells[n+1];k++)out.push(w.cells[n]);await button('世界に戻る');return {width:w.width,values:out};};
  const count=(w:{width:number;values:number[]},material:number,x0:number,x1:number,y0:number,y1:number)=>{let n=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(w.values[y*w.width+x]===material)n++;return n;};
  // Obtain real stone cells before approaching the reservoir. No inventory grants.
  for(let pass=0;pass<3;pass++)for(const y of [24,28,32,26,30,21])await aim(55,y,370);
  for(const x of [49,52,55])await aim(x,34,400);
  await flyRight(91);await page.locator('#tool').selectOption('pick');
  for(const x of [84,88,86])await aim(x,34,1000);
  await expect.poll(async()=>(await read()).resources.stone).toBeGreaterThanOrEqual(27);
  // Three conserved 3×3 blocks form a supported stepped wall above the waterline.
  await page.locator('#tool').selectOption('stone');const before=(await read()).resources.stone;
  for(const y of [34.5,31.05,28.05])await aim(104,y,100);
  expect((await read()).resources.stone).toBe(before-27);
  const dry=await cells();expect(count(dry,1,98,105,25,33)).toBe(27);
  await flyRight(113);await page.locator('#tool').selectOption('pick');
  await aim(111,31,450);await page.waitForTimeout(1800);
  const held=await cells();expect(count(held,5,106,111,27,33)).toBeGreaterThan(5);expect(count(held,5,94,97,27,33)).toBe(0);
  await page.screenshot({path:info.outputPath(mobile?'reservoir-held-touch.png':'reservoir-held-desktop.png')});
  // Mine the dam from the reservoir side. The actual fluid must now cross it.
  await aim(105,31,1000);await page.waitForTimeout(2400);
  const released=await cells();expect(count(released,5,94,100,27,36)).toBeGreaterThan(0);
  expect(count(released,1,98,105,25,33)).toBeLessThan(27);
  await page.screenshot({path:info.outputPath(mobile?'reservoir-released-touch.png':'reservoir-released-desktop.png')});
  await menu();await button('保存してタイトルへ');await page.reload();await button('この世界を続ける');
  const restored=await cells();expect(count(restored,1,98,105,25,33)).toBe(count(released,1,98,105,25,33));
  expect((await read()).deaths).toBe(0);expect(errors).toEqual([]);
  await info.attach('reservoir-receipt.json',{body:JSON.stringify({dryStone:count(dry,1,98,105,25,33),heldWater:count(held,5,106,111,27,33),drySide:count(held,5,94,97,27,33),releasedWater:count(released,5,94,100,27,36),state:await read()}),contentType:'application/json'});
});
