import {test,expect} from '@playwright/test';
import {selectTwoHandControls} from './control-preferences';
test('a short direct-use tap is consumed once without becoming a held tool',async({page,context},info)=>{
  const mobile=info.project.name==='android-chromium';await page.setViewportSize(mobile?{width:393,height:851}:{width:1280,height:720});await page.goto('/?seed=3397');
  const start=page.getByRole('button',{name:'新しい世界を作る',exact:true});if(mobile)await start.tap();else await start.click();if(mobile)await selectTwoHandControls(page);
  const cave=page.locator('#cave');await expect.poll(async()=>Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(10);
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!);const s=await read(),b=(await cave.boundingBox())!,point={x:b.x+(55-s.cameraX)/s.width*b.width,y:b.y+(25-s.cameraY)/s.height*b.height};
  if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(cave).toHaveAttribute('data-input-fire','false');await page.locator('#use-button').tap();}
  else await page.mouse.click(point.x,point.y,{delay:0});
  await expect.poll(async()=>(await read()).resources.wood).toBeGreaterThan(0);await expect(cave).toHaveAttribute('data-input-fire','false');const harvested=(await read()).resources.wood;
  await page.waitForTimeout(600);expect((await read()).resources.wood).toBe(harvested);expect(harvested).toBeLessThanOrEqual(9);
});
