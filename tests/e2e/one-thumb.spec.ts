import {test,expect} from '@playwright/test';
test.use({video:'on'});
interface State {x:number;y:number;hp:number;deaths:number;resources:Record<string,number>;structures:{type:string}[];cameraX:number;cameraY:number;width:number;height:number}
test('one thumb mines, crafts, builds and controls water with safe handed input',async({page,context},info)=>{
  test.skip(info.project.name!=='android-chromium','Single real touch pointer acceptance uses the phone profile');
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:393,height:851});await page.goto('/?seed=3397');
  await page.getByRole('button',{name:'新しい世界を作る',exact:true}).tap();
  const cave=page.locator('#cave'),pad=page.locator('#thumb-pad'),cdp=await context.newCDPSession(page);
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!) as State;
  await expect(cave).toHaveAttribute('data-control-layout','one-hand');await expect(pad).toBeVisible();
  let pressed=false,maxPointers=0;
  const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',point?:{x:number;y:number})=>{const points=point?[{...point,id:1}]:[];maxPointers=Math.max(maxPointers,points.length);expect(points.length).toBeLessThanOrEqual(1);await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});pressed=points.length>0;};
  const release=async()=>{if(pressed)await touch('touchEnd');};
  const mode=async(value:'travel'|'work')=>{await release();if(await cave.getAttribute('data-thumb-mode')!==value)await page.locator(`button[data-thumb-mode="${value}"]`).tap();};
  const drag=async(dx:number,dy:number)=>{const b=(await pad.boundingBox())!,p={x:b.x+b.width/2,y:b.y+b.height/2};await touch('touchStart',p);await touch('touchMove',{x:p.x+dx,y:p.y+dy});return p;};
  const aim=async(x:number,y:number,ms=450)=>{await mode('work');const s=await read(),dx=x-s.x,dy=y-(s.y-1),length=Math.hypot(dx,dy);await drag(dx/length*36,dy/length*36);await page.waitForTimeout(ms+260);await release();await page.waitForTimeout(160);};
  const menu=async()=>{await release();await page.locator('#thumb-menu').tap();};
  const resume=async()=>{await page.getByRole('button',{name:'世界に戻る',exact:true}).tap();};
  const select=async(tool:string)=>{await release();if(['pick','stone','torch'].includes(tool)){await page.locator(`button[data-tool="${tool}"]`).tap();return;}await menu();if(tool==='wand'){await page.locator('[data-tab="equipment"]').tap();await page.getByRole('button',{name:'この杖を持つ',exact:true}).first().tap();return;}await page.locator('[data-tab="inventory"]').tap();const label=tool==='camp'?'焚き火の拠点':'作業台';await page.locator('article.inventory-item').filter({has:page.getByRole('heading',{name:label,exact:true})}).getByRole('button',{name:'手に持つ',exact:true}).tap();};
  const craft=async(id:string)=>{await menu();await page.locator('[data-tab="craft"]').tap();await expect(page.locator(`[data-recipe="${id}"]`)).toBeEnabled();await page.locator(`[data-recipe="${id}"]`).tap();await resume();};
  // A tap/deadzone contact must never start a tool. One finger, no second pad.
  await mode('work');const p=await drag(0,0);await page.waitForTimeout(500);expect((await read()).resources.wood).toBe(0);await expect(cave).toHaveAttribute('data-input-fire','false');
  await touch('touchMove',{x:p.x+36,y:p.y});await page.waitForTimeout(100);await touch('touchCancel');await page.waitForTimeout(300);expect((await read()).resources.wood).toBe(0);await expect(cave).toHaveAttribute('data-input-fire','false');
  for(let pass=0;pass<3;pass++)for(const y of [24,28,32,26,30,21])await aim(55,y,370);
  await expect.poll(async()=>(await read()).resources.wood).toBeGreaterThanOrEqual(34);
  for(const x of [49,52,55])await aim(x,34,400);
  await expect.poll(async()=>(await read()).resources.stone).toBeGreaterThanOrEqual(21);
  await craft('camp');await select('camp');await aim(25.5,34.5,550);
  expect((await read()).structures.filter(s=>s.type==='camp')).toHaveLength(1);
  await craft('workbench');await select('workbench');await aim(33.5,34.5,550);
  expect((await read()).structures.filter(s=>s.type==='workbench')).toHaveLength(1);
  await page.screenshot({path:info.outputPath('one-thumb-crafted-base.png')});await page.waitForTimeout(350);await page.screenshot({path:info.outputPath('one-thumb-crafted-base-next-frame.png')});
  const flyRight=async(x:number)=>{await mode('travel');await drag(38,-38);await expect.poll(async()=>(await read()).x,{intervals:[50],timeout:7000}).toBeGreaterThan(x);await release();await page.waitForTimeout(900);};
  const standNear=async(x:number)=>{for(let n=0;n<20;n++){const s=await read(),difference=x-s.x;if(Math.abs(difference)<=1.2)return;await mode('travel');await drag(Math.sign(difference)*Math.min(36,Math.max(10,Math.abs(difference)*4)),0);await page.waitForTimeout(45);await release();await page.waitForTimeout(300);}expect(Math.abs((await read()).x-x)).toBeLessThanOrEqual(1.2);};
  await flyRight(86);await standNear(94);await select('pick');
  for(const x of [84,88,86])await aim(x,34,1000);
  // The earlier base consumed 21 stone. Take a fresh reachable floor patch,
  // rather than repeatedly aiming through the already-empty left-hand shaft.
  for(const x of [97,99])if((await read()).resources.stone<27)await aim(x,34,650);
  await expect.poll(async()=>(await read()).resources.stone).toBeGreaterThanOrEqual(27);
  await select('stone');const before=(await read()).resources.stone;
  for(const y of [34.5,31.05,28.05])await aim(104,y,550);
  expect((await read()).resources.stone).toBe(before-27);
  const cells=async()=>{await menu();const raw=await page.evaluate(()=>localStorage.getItem('emberfall-survival-save-v1'));const w=JSON.parse(JSON.parse(raw!).data.run).data.world as {width:number;cells:number[]};const out:number[]=[];for(let n=0;n<w.cells.length;n+=2)for(let k=0;k<w.cells[n+1];k++)out.push(w.cells[n]);await resume();return {width:w.width,values:out};};
  const count=(w:{width:number;values:number[]},material:number,x0:number,x1:number,y0:number,y1:number)=>{let n=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(w.values[y*w.width+x]===material)n++;return n;};
  const dry=await cells();expect(count(dry,1,98,105,25,33)).toBe(27);
  await flyRight(108);await standNear(117);await expect.poll(async()=>(await read()).y).toBeGreaterThan(29);await select('pick');
  await aim(111,31,450);await page.waitForTimeout(1800);const held=await cells();expect(count(held,5,106,111,27,33)).toBeGreaterThan(5);expect(count(held,5,94,97,27,33)).toBe(0);
  await page.screenshot({path:info.outputPath('one-thumb-water-held.png')});
  await aim(105,31,1000);await page.waitForTimeout(2400);const released=await cells();expect(count(released,5,94,100,27,36)).toBeGreaterThan(0);expect(count(released,1,98,105,25,33)).toBeLessThan(27);
  await page.screenshot({path:info.outputPath('one-thumb-water-released.png')});
  // The same thumb reaches handedness and quality without touching the other side.
  await menu();await page.locator('[data-tab="settings"]').tap();await page.locator('#control-hand').selectOption('left');await resume();await expect(cave).toHaveAttribute('data-control-hand','left');
  const left=(await pad.boundingBox())!;expect(left.x+left.width/2).toBeLessThan(393/2);
  await mode('travel');const x=(await read()).x;await drag(-36,-36);await page.waitForTimeout(350);await release();expect((await read()).x).toBeLessThan(x);await page.screenshot({path:info.outputPath('one-thumb-left-handed.png')});
  await select('wand');await mode('work');await expect(page.locator('.mana')).toBeVisible();await page.waitForTimeout(150);const manaBefore=Number(await page.locator('.mana b').textContent());await drag(36,-18);await expect(cave).toHaveAttribute('data-input-fire','true');await expect.poll(async()=>Number(await page.locator('.mana b').textContent())).toBeLessThan(manaBefore);await release();await expect(cave).toHaveAttribute('data-input-fire','false');
  await mode('travel');await drag(36,0);await page.setViewportSize({width:851,height:393});await expect(cave).toHaveAttribute('data-input-move','0');await touch('touchCancel');await page.setViewportSize({width:393,height:851});
  await menu();await page.getByRole('button',{name:'保存してタイトルへ',exact:true}).tap();await page.reload();await page.getByRole('button',{name:'この世界を続ける',exact:true}).tap();await expect(cave).toHaveAttribute('data-control-hand','left');expect((await read()).deaths).toBe(0);
  const tick=Number(await cave.getAttribute('data-tick'));await page.waitForTimeout(1000);expect(Number(await cave.getAttribute('data-tick'))-tick).toBeGreaterThan(12);
  expect(maxPointers).toBe(1);expect(errors).toEqual([]);await info.attach('one-thumb-receipt.json',{body:JSON.stringify({maxPointers,dryStone:count(dry,1,98,105,25,33),heldWater:count(held,5,106,111,27,33),releasedWater:count(released,5,94,100,27,36),state:await read()}),contentType:'application/json'});
});
