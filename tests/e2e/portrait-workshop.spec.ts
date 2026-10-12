import {selectTwoHandControls} from './control-preferences';
import {test,expect} from '@playwright/test';
test('portrait survival separates aim from use and releases simultaneous work controls',async({page,context},info)=>{
  test.skip(info.project.name!=='android-chromium','Trusted touch lifecycle is covered on the phone profile');
  await page.addInitScript(()=>{if(!localStorage.getItem('emberfall-survival-ui-v1'))localStorage.setItem('emberfall-survival-ui-v1','{broken');});
  await page.setViewportSize({width:393,height:851});await page.goto('/?seed=3397');await page.getByRole('button',{name:'新しい世界を作る',exact:true}).tap();
  await selectTwoHandControls(page);
  const cave=page.locator('#cave'),cdp=await context.newCDPSession(page);await expect.poll(async()=>Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(10);
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!) as {x:number;y:number;cameraX:number;cameraY:number;width:number;height:number;resources:Record<string,number>};
  const box=(await cave.boundingBox())!,s=await read();const aim={x:box.x+(55-s.cameraX)/s.width*box.width,y:box.y+(24-s.cameraY)/s.height*box.height,id:7};
  const initial=s.resources.wood;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[aim]});await page.waitForTimeout(600);
  expect((await read()).resources.wood).toBe(initial);await expect(cave).toHaveAttribute('data-input-fire','false');
  const u=(await page.locator('#use-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[aim,{x:u.x+u.width/2,y:u.y+u.height/2,id:8}]});
  await expect.poll(async()=>(await read()).resources.wood).toBeGreaterThan(initial);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(cave).toHaveAttribute('data-input-fire','false');
  for(const selector of ['.move-pad','.aim-pad','#use-button','.fly-button','#menu-button']){const b=(await page.locator(selector).boundingBox())!;expect(b.width).toBeGreaterThanOrEqual(48);expect(b.height).toBeGreaterThanOrEqual(48);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(393);expect(b.y+b.height).toBeLessThanOrEqual(851);}
  const m=(await page.locator('.move-pad').boundingBox())!,a=(await page.locator('.aim-pad').boundingBox())!,f=(await page.locator('.fly-button').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x+m.width*.8,y:m.y+m.height/2,id:1},{x:a.x+a.width*.85,y:a.y+a.height/2,id:2},{x:u.x+u.width/2,y:u.y+u.height/2,id:3},{x:f.x+f.width/2,y:f.y+f.height/2,id:4}]});
  await expect(cave).toHaveAttribute('data-input-fire','true');await expect(cave).toHaveAttribute('data-input-fly','true');await expect.poll(async()=>Number(await cave.getAttribute('data-input-move'))).toBeGreaterThan(0);
  await page.waitForTimeout(250);await page.screenshot({path:info.outputPath('portrait-simultaneous-work.png')});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await expect(cave).toHaveAttribute('data-input-fire','false');await expect(cave).toHaveAttribute('data-input-fly','false');await expect(cave).toHaveAttribute('data-input-move','0');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:u.x+u.width/2,y:u.y+u.height/2,id:3}]});await page.setViewportSize({width:851,height:393});
  await expect(cave).toHaveAttribute('data-input-fire','false');await expect(cave).toHaveAttribute('data-input-move','0');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.setViewportSize({width:393,height:851});await page.locator('#menu-button').tap();
  for(const tab of ['craft','inventory','equipment','settings']){await page.locator(`[data-tab="${tab}"]`).tap();await expect(page.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-current','true');await page.screenshot({path:info.outputPath(`portrait-panel-${tab}.png`)});}
  await expect(page.locator('#quality-select')).toHaveValue('balanced');
  await page.locator('#quality-select').selectOption('low');await page.locator('#effect-pbr').uncheck();
  await page.getByRole('button',{name:'保存してタイトルへ',exact:true}).tap();await page.reload();await page.getByRole('button',{name:'この世界を続ける',exact:true}).tap();
  await page.locator('#menu-button').tap();await page.locator('[data-tab="settings"]').tap();await expect(page.locator('#quality-select')).toHaveValue('low');await expect(page.locator('#effect-pbr')).not.toBeChecked();
  await page.getByRole('button',{name:'世界に戻る',exact:true}).tap();
  const tick=Number(await cave.getAttribute('data-tick'));await page.waitForTimeout(1000);expect(Number(await cave.getAttribute('data-tick'))-tick).toBeGreaterThan(12);
});
